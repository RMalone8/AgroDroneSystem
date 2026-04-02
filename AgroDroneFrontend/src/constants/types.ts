export type TabType = 'planning' | 'flights' | 'sensor';

export type MissionFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

export interface MissionMeta {
  missionName: string;
  scheduledAt: string;
  frequency: MissionFrequency;
}

export interface DroneTelemetry {
    battery?: number | null;
    altMsl?: number | null;
    altRel?: number | null;
    baseStationPos?: [number | null, number | null];
    hdop?: number | null;
    satellitesVisible?: number | null;
    droneLat: number | null;
    droneLng: number | null;
    heading?: number | null;
    velocity?: [number | null, number | null, number | null];
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
    onActivateFlightPlan: (fpid: string) => void;
  }