import { useState } from 'react';
import { MissionFrequency, MissionMeta } from '../../constants/types';
import { isWithinRange, polygonAreaAcres } from '../../utils/geo';

interface Props {
  vertices: { lat: number; lng: number }[];
  baseStationPos: [number, number] | undefined;
  existingNames: string[];
  onSave: (meta: MissionMeta) => void;
  onCancel: () => void;
}

const PROXIMITY_METERS = 30;
const MAX_ACRES = 150;

function validationError(
  name: string,
  vertices: { lat: number; lng: number }[],
  baseStationPos: [number, number] | undefined,
  existingNames: string[],
): string | null {
  if (!baseStationPos) {
    return 'Base station position unavailable — cannot validate proximity.';
  }
  if (!isWithinRange(vertices, baseStationPos[0], baseStationPos[1], PROXIMITY_METERS)) {
    return `No vertex is within ${PROXIMITY_METERS} m of the base station. Reposition your polygon.`;
  }
  const acres = polygonAreaAcres(vertices);
  if (acres > MAX_ACRES) {
    return `Flight area is ${acres.toFixed(1)} acres — exceeds the ${MAX_ACRES}-acre limit.`;
  }
  const trimmed = name.trim().toLowerCase();
  if (trimmed && existingNames.some(n => n.toLowerCase() === trimmed)) {
    return 'A flight plan with that name already exists. Choose a different name.';
  }
  return null;
}

export function MissionMetadataModal({ vertices, baseStationPos, existingNames, onSave, onCancel }: Props) {
  const [missionName, setMissionName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [frequency, setFrequency] = useState<MissionFrequency>('once');

  const geoError = validationError(missionName, vertices, baseStationPos, existingNames);
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-lg">Save Flight Plan</h3>

        <div className="space-y-4">
          {/* Flight plan name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Flight Plan Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={missionName}
              onChange={(e) => setMissionName(e.target.value)}
              placeholder="e.g. North Field Survey"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Scheduled time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Scheduled Time <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as MissionFrequency)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Validation error */}
          {geoError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
              {geoError}
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
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
