import { useState } from 'react';
import { MissionFrequency, MissionMeta } from '../../constants/types';
import { isWithinRange } from '../../utils/geo';

interface Props {
  vertices: { lat: number; lng: number }[];
  baseStationPos: [number, number] | undefined;
  onSave: (meta: MissionMeta) => void;
  onCancel: () => void;
}

const PROXIMITY_METERS = 30;

function proximityError(
  vertices: { lat: number; lng: number }[],
  baseStationPos: [number, number] | undefined,
): string | null {
  if (!baseStationPos) {
    return 'Base station position unavailable — cannot validate proximity.';
  }
  if (!isWithinRange(vertices, baseStationPos[0], baseStationPos[1], PROXIMITY_METERS)) {
    return `No vertex is within ${PROXIMITY_METERS} m of the base station. Reposition your polygon.`;
  }
  return null;
}

export function MissionMetadataModal({ vertices, baseStationPos, onSave, onCancel }: Props) {
  const [missionName, setMissionName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [frequency, setFrequency] = useState<MissionFrequency>('once');

  const geoError = proximityError(vertices, baseStationPos);
  const canSubmit = missionName.trim() !== '' && scheduledAt !== '' && geoError === null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSave({
      missionName: missionName.trim(),
      scheduledAt: new Date(scheduledAt).toISOString(),
      frequency,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="font-semibold text-gray-900 mb-4 text-lg">Save Flight Plan</h3>

        <div className="space-y-4">
          {/* Flight plan name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Flight Plan Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={missionName}
              onChange={(e) => setMissionName(e.target.value)}
              placeholder="e.g. North Field Survey"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Scheduled time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scheduled Time <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as MissionFrequency)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Proximity error */}
          {geoError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {geoError}
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Flight Plan
          </button>
        </div>
      </div>
    </div>
  );
}
