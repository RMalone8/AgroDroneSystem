import { TabType } from '../../constants/types.ts';

interface MissionControlsProps {
  activeTab: TabType;
  onSaveFlightPlan: () => void;
}

export function MissionControls({ activeTab, onSaveFlightPlan }: MissionControlsProps) {
  if (activeTab === 'planning') {
    return (
      <button
        onClick={onSaveFlightPlan}
        className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded shadow hover:bg-blue-700 dark:hover:bg-blue-600"
      >
        Save Flight Plan
      </button>
    );
  }

  return null;
}
