import { TabType } from '../../constants/types.ts';

interface MissionControlsProps {
  activeTab: TabType;
  onSaveMission: () => void;
}

export function MissionControls({ activeTab, onSaveMission }: MissionControlsProps) {
  if (activeTab === 'planning') {
    return (
      <button
        onClick={onSaveMission}
        className="absolute top-1 right-1 z-50 bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
      >
        Save Mission
      </button>
    );
  }

  return null;
}
