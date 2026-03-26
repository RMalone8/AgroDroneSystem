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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
