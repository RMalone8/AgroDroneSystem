import { useState } from 'react';
import { SidebarProps } from '../../constants/types';
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
  drawRef
}: SidebarProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const { userId, mqttToken } = useAuth();

  return (
    <div className="w-80 bg-white border-r border-gray-200 p-6 flex flex-col h-full overflow-hidden">

      {/* Activate confirmation modal */}
      {confirmingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 mb-2">Activate Flight Plan</h3>
            <p className="text-sm text-gray-600 mb-4">
              Activate flight plan <span className="font-mono font-bold">{confirmingId.slice(0, 8)}</span>?
              This will publish it to the drone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
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
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 mb-2">Delete Flight Plan</h3>
            <p className="text-sm text-gray-600 mb-4">
              Permanently delete mission <span className="font-mono font-bold">{confirmingDeleteId.slice(0, 8)}</span>?
              This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
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
        {activeTab === 'planning' || activeTab === 'sensor' ? (
          <>
            {/* Drone Status */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Drone Status</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm">Active - Field Monitoring</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Battery</span>
                    <div className="font-semibold">{telemetry.battery ?? "---"}%</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Relative Altitude</span>
                    <div className="font-semibold">{telemetry.altRel?.toFixed(2) ?? "---"} m</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Feed */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Live Feed</h3>
              <div className="h-32 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-mono tracking-tighter">● LIVE FEED</span>
              </div>
            </div>

            {/* System Telemetry */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">System Telemetry</h3>
              <div className="space-y-2 text-sm">
                <TelemetryRow label="Satellites Visible" value={telemetry.satellitesVisible?.toString() ?? "---"} color="text-green-600" />
                <TelemetryRow label="GPS HDOP" value={telemetry.hdop?.toFixed(3) ?? "---"} color="text-green-600" />
                <TelemetryRow label="Heading" value={telemetry.heading?.toFixed(2) ?? "---"} />
                <TelemetryRow label="VX" value={telemetry.velocity?.[0]?.toFixed(2) ?? "---"} />
                <TelemetryRow label="VY" value={telemetry.velocity?.[1]?.toFixed(2) ?? "---"} />
                <TelemetryRow label="VZ" value={telemetry.velocity?.[2]?.toFixed(2) ?? "---"} />
              </div>
            </div>
          </>
        ) : (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Flight Plan History ({flightplanData?.["flightplans"]?.length || 0})</h3>
            <div className="space-y-2">
              {flightplanData?.["flightplans"]?.map((fp: any) => {
                const isActive = fp.fpid === flightplanData["metadata"].currentFlightPlan;
                return (
                  <div className="flex" key={fp.fpid}>
                    <button
                      onClick={() => onSelectFlightPlan(fp, drawRef)}
                      className="flex-1 text-left p-3 border rounded-l hover:bg-blue-50 transition-all group border-gray-100 hover:border-blue-200"
                    >
                      <div className="font-medium text-sm text-blue-600 group-hover:text-blue-800">
                        {fp.missionName ?? fp.fpid.slice(0, 8)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {fp.scheduledAt ? new Date(fp.scheduledAt).toLocaleString() : new Date(fp.createdAt).toLocaleString()}
                      </div>
                      {fp.frequency && (
                        <span className="text-xs capitalize text-gray-400">{fp.frequency}</span>
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmingId(fp.fpid)}
                      title={isActive ? 'Active mission' : 'Set as active mission'}
                      className={`group self-stretch px-3 border-t border-b border-gray-100 flex items-center transition-colors ${
                        isActive ? 'cursor-default' : 'hover:bg-green-100'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full transition-colors ${
                        isActive
                          ? 'bg-green-500 animate-pulse'
                          : 'bg-gray-300 group-hover:bg-green-500'
                      }`} />
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(fp.fpid)}
                      className="self-stretch px-3 border rounded-r border-gray-100 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
      <div className="pt-6 border-t border-gray-100 mt-auto">
        <h2 className="text-lg font-semibold mb-3 text-red-800 uppercase text-xs tracking-wider">Emergency Controls</h2>
        <div className="space-y-2">
          <button className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 font-bold transition-all active:scale-95"
          onClick={() => userId && mqttToken && sendEmergencySignal("ABORT", { userId, mqttToken })}>
            ABORT FLIGHT
          </button>
          <button className="w-full bg-red-50 text-red-600 py-2 rounded-lg hover:bg-red-100 transition-colors text-sm font-semibold"
          onClick={() => userId && mqttToken && sendEmergencySignal("LAND", { userId, mqttToken })}>
            Emergency Land
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper for clean telemetry rows
function TelemetryRow({ label, value, color = "text-gray-900" }: { label: string, value: string, color?: string }) {
  return (
    <div className="flex justify-between border-b border-gray-50 pb-1">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}
