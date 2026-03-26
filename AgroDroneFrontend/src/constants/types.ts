export type TabType = 'planning' | 'flights' | 'sensor';

export type MissionFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

export interface MissionMeta {
  missionName: string;
  scheduledAt: string;
  frequency: MissionFrequency;
}

export interface DroneTelemetry {
    battery?: string;
    altitude?: string;
    baseStationPos?: [number, number];
    hdop?: string;
    satellitesVisible?: string;
    droneLat: string;
    droneLng: string;
    heading?: string;
    velocity?: [string, string, string];
    imageURL?: string;
  }
  
  export interface SidebarProps {
    activeTab: string;
    telemetry: DroneTelemetry;
    flightplanData: any;
    setFlightplans: any;
    drawRef: any;
    onSelectFlightPlan: (fp: any, drawRef: any) => void;
    onDeleteFlightPlan: (fp: any, flightplans: any, drawRef: any, setFlightplans: any) => void;
    onActivateFlightPlan: (missionId: string) => void;
  }