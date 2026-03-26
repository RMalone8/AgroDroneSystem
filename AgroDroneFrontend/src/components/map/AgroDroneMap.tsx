import { Map, Marker, Popup, MapRef } from '@vis.gl/react-maplibre';
import { DrawControl } from './DrawControl';
import GeocoderControl from './Geocoder';
import { ICON, DRONE_ICON, drawProps, dronePinStyle, pinStyle } from '../../constants/mapStyles';
import { useState, useRef, useCallback } from 'react';
import { DroneTelemetry } from '../../constants/types';

interface MapViewerProps {
  activeTab: string;
  droneData: DroneTelemetry;
  drawRef: React.MutableRefObject<any>;
  /** Last-known base station position loaded from the backend on app mount. */
  initialBaseStationPos?: [number, number] | null;
}

const DEFAULT_LAT = 42.35316;
const DEFAULT_LNG = -71.11777;
const DEFAULT_ZOOM = 12;

export function AgroDroneMap({ activeTab, droneData, drawRef, initialBaseStationPos }: MapViewerProps) {
  const [baseStationPopup, setBaseStationPopup] = useState<boolean>(false);
  const mapRef = useRef<MapRef>(null);

  const flyToBaseStation = useCallback(() => {
    const pos = droneData.baseStationPos ?? initialBaseStationPos;
    if (!pos) return;
    mapRef.current?.flyTo({ center: [pos[1], pos[0]], zoom: 16, duration: 1200 });
  }, [droneData.baseStationPos, initialBaseStationPos]);

  // Use the saved backend position for the initial view; fall back to hardcoded default.
  const initLat = initialBaseStationPos?.[0] ?? DEFAULT_LAT;
  const initLng = initialBaseStationPos?.[1] ?? DEFAULT_LNG;

  // Show the Navigate button whenever we have any known base station position.
  const hasBaseStation = !!(droneData.baseStationPos ?? initialBaseStationPos);

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        latitude:  initLat,
        longitude: initLng,
        zoom:      DEFAULT_ZOOM,
        pitch:     0,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
    >
      {/* Draw Controls only active in Planning / Flights mode */}
      {(activeTab === 'planning' || activeTab === 'flights') && (
        <DrawControl
          position="top-left"
          styles={drawProps}
          displayControlsDefault={false}
          controls={{ polygon: true, trash: true }}
          onInstanceUpdate={(instance: any) => { drawRef.current = instance; }}
        />
      )}

      <GeocoderControl position="top-left" />

      {/* Navigate to Base Station button */}
      {hasBaseStation && (
        <button
          onClick={flyToBaseStation}
          title="Navigate to base station"
          className="absolute bottom-8 right-3 z-10 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 shadow-md hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
        >
          Navigate to Base Station
        </button>
      )}

      {/* Base Station Marker */}
      {droneData.baseStationPos && droneData.baseStationPos.length >= 2 ? (
        <Marker
          longitude={droneData.baseStationPos[1]}
          latitude={droneData.baseStationPos[0]}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            setBaseStationPopup(true);
          }}
        >
          <svg height={20} viewBox="0 0 24 24" style={pinStyle}>
            <path d={ICON} />
          </svg>
        </Marker>
      ) : null}

      {Number(droneData.droneLat) && Number(droneData.droneLng) ? (
        <Marker
          longitude={Number(droneData.droneLng)}
          latitude={Number(droneData.droneLat)}
          anchor="bottom"
          onClick={(e) => { e.originalEvent.stopPropagation(); }}
        >
          <svg height={28} viewBox="0 0 24 24" style={dronePinStyle}>
            <path d={DRONE_ICON} />
          </svg>
        </Marker>
      ) : null}

      {/* Base Station Popup */}
      {baseStationPopup && (
        <Popup
          anchor="top"
          longitude={droneData.baseStationPos?.[1] ?? 0}
          latitude={droneData.baseStationPos?.[0] ?? 0}
          onClose={() => setBaseStationPopup(false)}
        >
          <div className="p-1 font-sans text-sm font-semibold">Base Station</div>
        </Popup>
      )}
    </Map>
  );
}
