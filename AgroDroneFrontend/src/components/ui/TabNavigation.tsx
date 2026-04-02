import { TabType } from '../../constants/types.ts';

export function TabNavigation({ activeTab, onTabChange }: { activeTab: TabType; onTabChange: (tab: TabType) => void }) {
  const tabs: { key: TabType; label: string }[] = [
    { key: 'planning', label: 'Flight Planning' },
    { key: 'flights', label: 'Flight Plan History' },
    { key: 'sensor', label: 'Sensor Data' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-20">
      <div className="flex space-x-8 px-6">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
              activeTab === key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
