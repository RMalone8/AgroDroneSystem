import { useState } from 'react';
import { SidebarProps, SensorFlightPlan, SensorMission } from '../../constants/types';
import { sendEmergencySignal } from '../../hooks/sendEmergencySignal';
import { useAuth } from '../../contexts/AuthContext';

export function Sidebar({
  activeTab,
  telemetry,
  flightplanData,
  setFlightplans,
  onSelectFlightPlan,
  onDeleteFlightPlan,
  onActivateFlightPlan,
  drawRef,
  sensorData,
  activeSensorMission,
  onSelectSensorMission,
}: SidebarProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const { userId, mqttToken } = useAuth();

  return (
    <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-6 flex flex-col h-full overflow-hidden">

      {/* Activate confirmation modal */}
      {confirmingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Activate Flight Plan</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Activate flight plan <span className="font-mono font-bold">{confirmingId.slice(0, 8)}</span>?
              This will publish it to the drone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingId(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onActivateFlightPlan(confirmingId);
                  setConfirmingId(null);
                }}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmingDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Delete Flight Plan</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Permanently delete mission <span className="font-mono font-bold">{confirmingDeleteId.slice(0, 8)}</span>?
              This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const fp = flightplanData["flightplans"].find((p: any) => p.fpid === confirmingDeleteId);
                  if (fp) onDeleteFlightPlan(fp, flightplanData["flightplans"], drawRef, setFlightplans);
                  setConfirmingDeleteId(null);
                }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {activeTab === 'planning' ? (
          <>
            {/* Drone Status */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Drone Status</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Active - Field Monitoring</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Battery</span>
                    <div className="font-semibold text-gray-900 dark:text-white">{telemetry.battery ?? "---"}%</div>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Relative Altitude</span>
                    <div className="font-semibold text-gray-900 dark:text-white">{telemetry.altRel?.toFixed(2) ?? "---"} m</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Feed */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Live Feed</h3>
              <div className="h-32 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-mono tracking-tighter">● LIVE FEED</span>
              </div>
            </div>

            {/* System Telemetry */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">System Telemetry</h3>
              <div className="space-y-2 text-sm">
                <TelemetryRow label="Satellites Visible" value={telemetry.satellitesVisible?.toString() ?? "---"} color="text-green-600 dark:text-green-400" />
                <TelemetryRow label="GPS HDOP" value={telemetry.hdop?.toFixed(3) ?? "---"} color="text-green-600 dark:text-green-400" />
                <TelemetryRow label="Heading" value={telemetry.heading?.toFixed(2) ?? "---"} />
                <TelemetryRow label="VX" value={telemetry.velocity?.[0]?.toFixed(2) ?? "---"} />
                <TelemetryRow label="VY" value={telemetry.velocity?.[1]?.toFixed(2) ?? "---"} />
                <TelemetryRow label="VZ" value={telemetry.velocity?.[2]?.toFixed(2) ?? "---"} />
              </div>
            </div>
          </>
        ) : activeTab === 'sensor' ? (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
              Sensor Data ({sensorData?.length ?? 0} flight plans)
            </h3>
            <div className="space-y-2">
              {sensorData?.map(fp => (
                <SensorFlightPlanRow
                  key={fp.fpid}
                  fp={fp}
                  activeMission={activeSensorMission}
                  onSelectMission={onSelectSensorMission!}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Flight Plan History ({flightplanData?.["flightplans"]?.length || 0})</h3>
            <div className="space-y-2">
              {flightplanData?.["flightplans"]?.map((fp: any) => {
                const isActive = fp.fpid === flightplanData["metadata"].currentFlightPlan;
                return (
                  <div className="flex" key={fp.fpid}>
                    <button
                      onClick={() => onSelectFlightPlan(fp, drawRef)}
                      className="flex-1 text-left p-3 border rounded-l hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-600"
                    >
                      <div className="font-medium text-sm text-blue-600 dark:text-blue-400 group-hover:text-blue-800 dark:group-hover:text-blue-300">
                        {fp.missionName ?? fp.fpid.slice(0, 8)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {fp.scheduledAt ? new Date(fp.scheduledAt).toLocaleString() : new Date(fp.createdAt).toLocaleString()}
                      </div>
                      {fp.frequency && (
                        <span className="text-xs capitalize text-gray-400 dark:text-gray-500">{fp.frequency}</span>
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmingId(fp.fpid)}
                      title={isActive ? 'Active mission' : 'Set as active mission'}
                      className={`group self-stretch px-3 border-t border-b border-gray-100 dark:border-gray-700 flex items-center transition-colors ${
                        isActive ? 'cursor-default' : 'hover:bg-green-100 dark:hover:bg-green-900/30'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full transition-colors ${
                        isActive
                          ? 'bg-green-500 animate-pulse'
                          : 'bg-gray-300 dark:bg-gray-600 group-hover:bg-green-500'
                      }`} />
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(fp.fpid)}
                      className="self-stretch px-3 border rounded-r border-gray-100 dark:border-gray-700 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      X
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Fixed Emergency Controls at Bottom */}
      <div className="pt-6 border-t border-gray-100 dark:border-gray-700 mt-auto">
        <h2 className="text-lg font-semibold mb-3 text-red-800 dark:text-red-400 uppercase text-xs tracking-wider">Emergency Controls</h2>
        <div className="space-y-2">
          <button className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 font-bold transition-all active:scale-95"
          onClick={() => userId && mqttToken && sendEmergencySignal("ABORT", { userId, mqttToken })}>
            ABORT FLIGHT
          </button>
          <button className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-sm font-semibold"
          onClick={() => userId && mqttToken && sendEmergencySignal("LAND", { userId, mqttToken })}>
            Emergency Land
          </button>
        </div>
      </div>
    </div>
  );
}

function SensorFlightPlanRow({
  fp, activeMission, onSelectMission
}: {
  fp: SensorFlightPlan;
  activeMission: { fpid: string; mid: string } | null | undefined;
  onSelectMission: (fpid: string, mid: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left p-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
      >
        <div className="font-medium text-sm text-blue-600 dark:text-blue-400">
          {fp.missionName ?? fp.fpid.slice(0, 8)}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(fp.createdAt).toLocaleString()}
        </div>
        {fp.frequency && (
          <span className="text-xs capitalize text-gray-400 dark:text-gray-500">{fp.frequency}</span>
        )}
      </button>
      {expanded && fp.missions.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {fp.missions.map((m: SensorMission) => {
            const isActive = activeMission?.fpid === fp.fpid && activeMission?.mid === m.mid;
            return (
              <button
                key={m.mid}
                onClick={() => onSelectMission(fp.fpid, m.mid)}
                className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                  isActive
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {new Date(m.createdAt).toLocaleString()}
              </button>
            );
          })}
        </div>
      )}
      {expanded && fp.missions.length === 0 && (
        <p className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">No missions yet</p>
      )}
    </div>
  );
}

// Helper for clean telemetry rows
function TelemetryRow({ label, value, color = "text-gray-900 dark:text-white" }: { label: string, value: string, color?: string }) {
  return (
    <div className="flex justify-between border-b border-gray-50 dark:border-gray-700 pb-1">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}
