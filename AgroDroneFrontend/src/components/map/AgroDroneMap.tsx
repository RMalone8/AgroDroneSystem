import { Map, Marker, Popup, MapRef } from '@vis.gl/react-maplibre';
import { DrawControl } from './DrawControl';
import GeocoderControl from './Geocoder';
import { ICON, DRONE_ICON, drawProps, dronePinStyle, pinStyle, dimPinStyle } from '../../constants/mapStyles';
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

      {/* Base Station Marker — dim (stored) until live telemetry arrives */}
      {(() => {
        const livePos = droneData.baseStationPos?.length === 2 ? droneData.baseStationPos : null;
        const storedPos = !livePos && initialBaseStationPos ? initialBaseStationPos : null;
        const displayPos = livePos ?? storedPos;
        if (!displayPos) return null;
        return (
          <Marker
            longitude={displayPos[1]}
            latitude={displayPos[0]}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setBaseStationPopup(true);
            }}
          >
            <svg height={20} viewBox="0 0 24 24" style={livePos ? pinStyle : dimPinStyle}>
              <path d={ICON} />
            </svg>
          </Marker>
        );
      })()}

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
      {baseStationPopup && (() => {
        const popupPos = droneData.baseStationPos ?? initialBaseStationPos;
        if (!popupPos) return null;
        const isLive = !!droneData.baseStationPos;
        return (
          <Popup
            anchor="top"
            longitude={popupPos[1]}
            latitude={popupPos[0]}
            onClose={() => setBaseStationPopup(false)}
            maxWidth="220px"
          >
            <div className="px-4 pt-3 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-900">Base Station</span>
                {isLive
                  ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">live</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">last known</span>
                }
              </div>
              <div className="border-t border-gray-100 pt-2 space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-xs text-gray-400">Lat</span>
                  <span className="text-xs font-mono text-gray-700">{popupPos[0].toFixed(5)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-xs text-gray-400">Lng</span>
                  <span className="text-xs font-mono text-gray-700">{popupPos[1].toFixed(5)}</span>
                </div>
              </div>
            </div>
          </Popup>
        );
      })()}
    </Map>
  );
}
