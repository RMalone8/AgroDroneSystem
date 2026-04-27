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
import { TabType, MissionMeta, SensorFlightPlan, SensorImage } from './constants/types.ts';
import { useAuth } from './contexts/AuthContext.tsx';
import { useMode } from './contexts/ModeContext.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DemoLoader } from './pages/DemoLoader.tsx';
import { AdminPanel } from './pages/AdminPanel.tsx';
import { authFetch } from './utils/api.ts';

// Auth gate — shows LandingPage, LoginPage, DemoLoader, AdminPanel, or the main app
export default function App() {
  const { token, role } = useAuth();
  const { mode } = useMode();
  if (!token) {
    if (!mode)           return <LandingPage />;
    if (mode === 'demo') return <DemoLoader />;
    return <LoginPage />;
  }
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
  const [activeFpid, setActiveFpid] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<{ order: number; lat: number; lng: number }[]>([]);
  const [visitedOrders, setVisitedOrders] = useState<Set<number>>(new Set());
  const wasFlyingRef = useRef(false);
  const airborneWaypointFetchedRef = useRef(false);
  const waypointDwellRef = useRef<Map<number, number>>(new Map());
  const [sensorData, setSensorData] = useState<SensorFlightPlan[]>([]);
  const [activeSensorMission, setActiveSensorMission] = useState<{ fpid: string; mid: string } | null>(null);
  const [sensorImages, setSensorImages] = useState<SensorImage[]>([]);
  const hasLoadedSensorData = useRef(false);
  const flyToBaseStationRef = useRef<(() => void) | null>(null);

  const { userId, mqttToken } = useAuth();
  const droneData = useDroneData({ userId, mqttToken });

  const hasBaseStation = !!(droneData.baseStationPos ?? savedBaseStationPos);

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
    if (!activeFpid) return;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts++;
      try {
        const r = await authFetch(`/flightplan/${activeFpid}/waypoints`);
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          setWaypoints(data);
          clearInterval(id);
        }
      } catch { /* ignore */ }
      if (attempts >= 10) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [activeFpid]);

  // Clear waypoints when the drone lands (alt_rel drops back to 0 after flying).
  useEffect(() => {
    const alt = droneData.altRel ?? 0;
    if (alt > 0) {
      wasFlyingRef.current = true;
    } else if (wasFlyingRef.current && alt === 0) {
      wasFlyingRef.current = false;
      airborneWaypointFetchedRef.current = false;
      hasLoadedSensorData.current = false;
      setWaypoints([]);
      setVisitedOrders(new Set());
      setActiveFpid(null);
    }
  }, [droneData.altRel]);

  // Fallback: if drone is airborne but no waypoints loaded (e.g. page refresh mid-flight),
  // fetch them using the backend's current active mission.
  useEffect(() => {
    const alt = droneData.altRel ?? 0;
    if (alt <= 0 || waypoints.length > 0 || airborneWaypointFetchedRef.current) return;
    airborneWaypointFetchedRef.current = true;

    const fetchForMission = (fpid: string) =>
      authFetch(`/flightplan/${fpid}/waypoints`)
        .then(r => r.json())
        .then((data: any) => {
          if (Array.isArray(data) && data.length > 0) {
            setWaypoints(data);
          } else {
            airborneWaypointFetchedRef.current = false;
          }
        })
        .catch(() => { airborneWaypointFetchedRef.current = false; });

    const fpid = activeFpid ?? (flightplanData?.metadata?.currentFlightPlan as string | null);
    if (fpid) {
      fetchForMission(fpid);
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

  // Mark waypoints as visited only when the drone has been hovering above 25 m
  // on top of one (vx≈0, vy≈0) for at least 3 seconds. The altitude gate
  // prevents the takeoff climb (which passes over the first waypoint coords)
  // from triggering a false positive.
  useEffect(() => {
    if (!waypoints.length || (droneData.altRel ?? 0) < 25) {
      waypointDwellRef.current.clear();
      return;
    }
    const vx = Number(droneData.velocity?.[0] ?? 1);
    const vy = Number(droneData.velocity?.[1] ?? 1);
    if (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) {
      waypointDwellRef.current.clear();
      return;
    }
    const dLat = Number(droneData.droneLat);
    const dLng = Number(droneData.droneLng);
    if (!dLat || !dLng) return;
    const now = Date.now();
    setVisitedOrders(prev => {
      const next = new Set(prev);
      waypoints.forEach(wp => {
        if (prev.has(wp.order)) return;
        const dNorth = (wp.lat - dLat) * 111111;
        const dEast  = (wp.lng - dLng) * 111111 * Math.cos(dLat * Math.PI / 180);
        const inRange = Math.sqrt(dNorth ** 2 + dEast ** 2) < 15;
        if (inRange) {
          if (!waypointDwellRef.current.has(wp.order)) {
            waypointDwellRef.current.set(wp.order, now);
          } else if (now - waypointDwellRef.current.get(wp.order)! >= 3000) {
            next.add(wp.order);
            waypointDwellRef.current.delete(wp.order);
          }
        } else {
          waypointDwellRef.current.delete(wp.order);
        }
      });
      return next;
    });
  }, [droneData.velocity, droneData.altRel]);

  const handleSelectSensorMission = async (fpid: string, mid: string) => {
    setActiveSensorMission({ fpid, mid });
    setSensorImages([]);
    try {
      const meta = await authFetch(`/sensor/mission?fpid=${fpid}&mid=${mid}`).then(r => r.json());
      const images: SensorImage[] = await Promise.all(
        (meta.images ?? []).map(async (img: any) => {
          const r = await authFetch(`/sensor/image?fpid=${fpid}&mid=${mid}&index=${img.index}`);
          const blob = await r.blob();
          return { ...img, url: URL.createObjectURL(blob) };
        })
      );
      setSensorImages(images);
    } catch { /* non-critical */ }
  };

  const handleTabChange = async (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'flights' && !hasLoadedFlightPlans.current) {
      setFlightplanData(await getAllFlightPlans());
      hasLoadedFlightPlans.current = true;
    }
    if (tab === 'sensor' && !hasLoadedSensorData.current) {
      hasLoadedSensorData.current = true;
      try {
        const d = await authFetch('/sensor/all').then(r => r.json());
        // Only show flight plans that have at least one mission, sorted newest-first
        const plans: SensorFlightPlan[] = (d.flightPlans ?? [])
          .filter((fp: SensorFlightPlan) => fp.missions.length > 0)
          .sort((a: SensorFlightPlan, b: SensorFlightPlan) =>
            b.missions[0].createdAt.localeCompare(a.missions[0].createdAt)
          );
        setSensorData(plans);
        const fp = plans[0];
        if (fp?.missions?.[0]) {
          handleSelectSensorMission(fp.fpid, fp.missions[0].mid);
        }
      } catch { /* non-critical */ }
    }
  };

  const handleSaveFlightPlan = async () => {
    const vertices = extractVertices(drawRef);
    if (!vertices) return;
    // Always fetch fresh flight plans so we can check for duplicate names
    const data = await getAllFlightPlans();
    setFlightplanData(data);
    hasLoadedFlightPlans.current = true;
    setModalVertices(vertices);
  };

  const handleModalSave = async (meta: MissionMeta) => {
    if (!modalVertices) return;
    const success = await saveFlightPlan({
      fpid: crypto.randomUUID(),
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

  const existingNames = (flightplanData?.flightplans ?? []).map((fp: any) => fp.missionName ?? '').filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      {modalVertices && (
        <MissionMetadataModal
          vertices={modalVertices}
          baseStationPos={
            droneData.baseStationPos?.[0] != null && droneData.baseStationPos?.[1] != null
              ? (droneData.baseStationPos as [number, number])
              : savedBaseStationPos ?? undefined
          }
          existingNames={existingNames}
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
          onActivateFlightPlan={async (fpid: string) => {
            const ok = await activateFlightPlan(fpid);
            if (ok) {
              setActiveFpid(fpid);
              setWaypoints([]);
              setVisitedOrders(new Set());
              setFlightplanData((prev: any) => ({
                ...prev,
                metadata: { ...prev.metadata, currentFlightPlan: fpid }
              }));
            }
          }}
          drawRef={drawRef}
          sensorData={sensorData}
          activeSensorMission={activeSensorMission}
          onSelectSensorMission={handleSelectSensorMission}
        />

        <div className="flex-1 flex flex-col min-h-0">
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

          <div className="flex-1 relative z-0">
            <div className="absolute top-1 right-1 z-50 flex gap-2">
              {hasBaseStation && (
                <button
                  onClick={() => flyToBaseStationRef.current?.()}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow hover:bg-blue-50 dark:hover:bg-gray-700 hover:text-blue-700 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-500 transition-colors"
                >
                  Navigate to Base Station
                </button>
              )}
              <MissionControls
                activeTab={activeTab}
                onSaveFlightPlan={handleSaveFlightPlan}
              />
            </div>
            <AgroDroneMap
              activeTab={activeTab}
              droneData={droneData}
              drawRef={drawRef}
              initialBaseStationPos={savedBaseStationPos}
              waypoints={waypoints}
              visitedOrders={visitedOrders}
              sensorImages={activeTab === 'sensor' ? sensorImages : []}
              onFlyToReady={(fn) => { flyToBaseStationRef.current = fn; }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
