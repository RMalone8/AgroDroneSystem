import { useState, useRef, useEffect } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { useDroneData } from './hooks/useDroneData.ts';
import { Sidebar } from './components/ui/Sidebar.tsx';
import { Header } from './components/ui/Header.tsx';
import { TabNavigation } from './components/ui/TabNavigation.tsx';
import { MissionControls } from './components/ui/MissionControls.tsx';
import { MissionMetadataModal } from './components/ui/MissionMetadataModal.tsx';
import {
  getAllFlightPlans,
  saveFlightPlan,
  extractVertices,
  selectFlightPlan,
  deleteFlightPlan,
  activateFlightPlan,
} from './components/map/FlightPlans.tsx';
import { AgroDroneMap } from './components/map/AgroDroneMap.tsx';
import { TabType, MissionMeta } from './constants/types.ts';
import { useAuth } from './contexts/AuthContext.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { AdminPanel } from './pages/AdminPanel.tsx';
import { authFetch } from './utils/api.ts';

// Auth gate — renders LoginPage when logged out, AdminPanel for admins, AppContent for clients
export default function App() {
  const { token, role } = useAuth();
  if (!token) return <LoginPage />;
  if (role === 'admin') return <AdminPanel />;
  return <AppContent />;
}

// Main application — only mounted when the user is authenticated
function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>('planning');
  const drawRef = useRef<any>(null);
  const [flightplanData, setFlightplanData] = useState({
    flightplans: [],
    metadata: { currentFlightPlan: null }
  });
  const hasLoadedFlightPlans = useRef(false);
  const [modalVertices, setModalVertices] = useState<{ lat: number; lng: number }[] | null>(null);
  const [savedBaseStationPos, setSavedBaseStationPos] = useState<[number, number] | null>(null);
  const hasPersistedBaseStation = useRef(false);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<{ order: number; lat: number; lng: number }[]>([]);
  const [visitedOrders, setVisitedOrders] = useState<Set<number>>(new Set());
  const wasFlyingRef = useRef(false);
  const airborneWaypointFetchedRef = useRef(false);

  const { userId, mqttToken } = useAuth();
  const droneData = useDroneData({ userId, mqttToken });

  // Fetch the last-known base station position from the backend on mount,
  // so the map can center on it before MQTT telemetry arrives.
  useEffect(() => {
    authFetch('/basestation/position')
      .then((r) => r.json())
      .then((pos) => {
        if (Array.isArray(pos) && pos.length === 2) {
          setSavedBaseStationPos(pos as [number, number]);
        }
      })
      .catch(() => { /* no saved position yet — map will use default */ });
  }, []);

  // Persist the live base station position the first time MQTT delivers it.
  useEffect(() => {
    if (!droneData.baseStationPos || hasPersistedBaseStation.current) return;
    hasPersistedBaseStation.current = true;
    authFetch('/basestation/position', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: droneData.baseStationPos[0], lng: droneData.baseStationPos[1] }),
    }).catch(() => { /* non-critical */ });
  }, [droneData.baseStationPos]);

  // Poll for waypoints after a mission is activated (edge node may take ~1s to POST them).
  useEffect(() => {
    if (!activeMissionId) return;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts++;
      try {
        const r = await authFetch(`/flightplan/${activeMissionId}/waypoints`);
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          setWaypoints(data);
          clearInterval(id);
        }
      } catch { /* ignore */ }
      if (attempts >= 10) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [activeMissionId]);

  // Clear waypoints when the drone lands (alt_rel drops back to 0 after flying).
  useEffect(() => {
    const alt = droneData.altRel ?? 0;
    if (alt > 0) {
      wasFlyingRef.current = true;
    } else if (wasFlyingRef.current && alt === 0) {
      wasFlyingRef.current = false;
      airborneWaypointFetchedRef.current = false;
      setWaypoints([]);
      setVisitedOrders(new Set());
      setActiveMissionId(null);
    }
  }, [droneData.altRel]);

  // Fallback: if drone is airborne but no waypoints loaded (e.g. page refresh mid-flight),
  // fetch them using the backend's current active mission.
  useEffect(() => {
    const alt = droneData.altRel ?? 0;
    if (alt <= 0 || waypoints.length > 0 || airborneWaypointFetchedRef.current) return;
    airborneWaypointFetchedRef.current = true;

    const fetchForMission = (missionId: string) =>
      authFetch(`/flightplan/${missionId}/waypoints`)
        .then(r => r.json())
        .then((data: any) => {
          if (Array.isArray(data) && data.length > 0) {
            setWaypoints(data);
          } else {
            airborneWaypointFetchedRef.current = false;
          }
        })
        .catch(() => { airborneWaypointFetchedRef.current = false; });

    const missionId = activeMissionId ?? (flightplanData?.metadata?.currentFlightPlan as string | null);
    if (missionId) {
      fetchForMission(missionId);
    } else {
      // No mission cached locally — ask the backend for the active one
      authFetch('/flightplan/all')
        .then(r => r.json())
        .then((d: any) => {
          const id = d?.metadata?.currentFlightPlan as string | null;
          if (id) fetchForMission(id);
          else airborneWaypointFetchedRef.current = false;
        })
        .catch(() => { airborneWaypointFetchedRef.current = false; });
    }
  }, [droneData.altRel]);

  // Mark waypoints as visited only when the drone is hovering on top of one (vx≈0, vy≈0).
  useEffect(() => {
    if (!waypoints.length || (droneData.altRel ?? 0) <= 0) return;
    const vx = Number(droneData.velocity?.[0] ?? 1);
    const vy = Number(droneData.velocity?.[1] ?? 1);
    if (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) return;
    const dLat = Number(droneData.droneLat);
    const dLng = Number(droneData.droneLng);
    if (!dLat || !dLng) return;
    setVisitedOrders(prev => {
      const next = new Set(prev);
      waypoints.forEach(wp => {
        if (prev.has(wp.order)) return;
        const dNorth = (wp.lat - dLat) * 111111;
        const dEast  = (wp.lng - dLng) * 111111 * Math.cos(dLat * Math.PI / 180);
        if (Math.sqrt(dNorth ** 2 + dEast ** 2) < 15) next.add(wp.order);
      });
      return next;
    });
  }, [droneData.velocity]);

  const handleTabChange = async (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'flights' && !hasLoadedFlightPlans.current) {
      setFlightplanData(await getAllFlightPlans());
      hasLoadedFlightPlans.current = true;
    }
  };

  const handleSaveMission = () => {
    const vertices = extractVertices(drawRef);
    if (!vertices) return;
    setModalVertices(vertices);
  };

  const handleModalSave = async (meta: MissionMeta) => {
    if (!modalVertices) return;
    const success = await saveFlightPlan({
      missionId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      totalVertices: modalVertices.length - 1,
      vertices: modalVertices.map((v, i) => ({ order: i, ...v })),
      ...meta,
    });
    if (success) {
      setModalVertices(null);
      setFlightplanData(await getAllFlightPlans());
      hasLoadedFlightPlans.current = true;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header imageURL={droneData.imageURL} />

      {modalVertices && (
        <MissionMetadataModal
          vertices={modalVertices}
          baseStationPos={droneData.baseStationPos}
          onSave={handleModalSave}
          onCancel={() => setModalVertices(null)}
        />
      )}

      <div className="flex h-[calc(100vh-80px)]">
        <Sidebar
          activeTab={activeTab}
          telemetry={droneData}
          flightplanData={flightplanData}
          setFlightplans={setFlightplanData}
          onSelectFlightPlan={selectFlightPlan}
          onDeleteFlightPlan={deleteFlightPlan}
          onActivateFlightPlan={async (missionId: string) => {
            const ok = await activateFlightPlan(missionId);
            if (ok) {
              setActiveMissionId(missionId);
              setWaypoints([]);
              setVisitedOrders(new Set());
              setFlightplanData((prev: any) => ({
                ...prev,
                metadata: { ...prev.metadata, currentFlightPlan: missionId }
              }));
            }
          }}
          drawRef={drawRef}
        />

        <div className="flex-1 flex flex-col min-h-0">
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

          <div className="flex-1 relative z-0">
            <MissionControls
              activeTab={activeTab}
              onSaveMission={handleSaveMission}
            />
            <AgroDroneMap
              activeTab={activeTab}
              droneData={droneData}
              drawRef={drawRef}
              initialBaseStationPos={savedBaseStationPos}
              waypoints={waypoints}
              visitedOrders={visitedOrders}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
