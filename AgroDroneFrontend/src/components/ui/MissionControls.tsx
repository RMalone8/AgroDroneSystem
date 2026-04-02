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
        className="absolute top-1 right-1 z-50 bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
      >
        Save Flight Plan
      </button>
    );
  }

  return null;
}
