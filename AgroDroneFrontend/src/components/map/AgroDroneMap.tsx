import { Map, Marker, Popup, MapRef, Source, Layer } from '@vis.gl/react-maplibre';
import { DrawControl } from './DrawControl';
import GeocoderControl from './Geocoder';
import { ICON, DRONE_ICON, drawProps, dronePinStyle, pinStyle, dimPinStyle } from '../../constants/mapStyles';
import { useState, useRef, useCallback, useEffect } from 'react';
import { DroneTelemetry, SensorImage } from '../../constants/types';
import { computeImageCorners } from '../../utils/geo';
import { useDarkMode } from '../../contexts/DarkModeContext';

const MAP_STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const MAP_STYLE_DARK  = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface MapViewerProps {
  activeTab: string;
  droneData: DroneTelemetry;
  drawRef: React.MutableRefObject<any>;
  /** Last-known base station position loaded from the backend on app mount. */
  initialBaseStationPos?: [number, number] | null;
  waypoints?: { order: number; lat: number; lng: number }[];
  visitedOrders?: Set<number>;
  sensorImages?: SensorImage[];
  /** Called once flyToBaseStation is ready; parent can render the button itself. */
  onFlyToReady?: (fn: () => void) => void;
}

const DEFAULT_LAT = 42.35316;
const DEFAULT_LNG = -71.11777;
const DEFAULT_ZOOM = 12;

export function AgroDroneMap({ activeTab, droneData, drawRef, initialBaseStationPos, waypoints, visitedOrders, sensorImages, onFlyToReady }: MapViewerProps) {
  const [baseStationPopup, setBaseStationPopup] = useState<boolean>(false);
  const mapRef = useRef<MapRef>(null);
  const { darkMode } = useDarkMode();

  const flyToBaseStation = useCallback(() => {
    const pos = droneData.baseStationPos ?? initialBaseStationPos;
    if (!pos || pos[0] == null || pos[1] == null) return;
    mapRef.current?.flyTo({ center: [pos[1], pos[0]], zoom: 16, duration: 1200 });
  }, [droneData.baseStationPos, initialBaseStationPos]);

  // Expose flyToBaseStation to parent once stable
  useEffect(() => {
    onFlyToReady?.(flyToBaseStation);
  }, [flyToBaseStation, onFlyToReady]);

  // Use the saved backend position for the initial view; fall back to hardcoded default.
  const initLat = initialBaseStationPos?.[0] ?? DEFAULT_LAT;
  const initLng = initialBaseStationPos?.[1] ?? DEFAULT_LNG;

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
      mapStyle={darkMode ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
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

      <GeocoderControl
        position="top-left"
        render={(feature: any) => {
          const name = feature.place_name ?? '';
          const comma = name.indexOf(',');
          const title = comma > -1 ? name.slice(0, comma) : name;
          const address = comma > -1 ? name.slice(comma + 2) : '';
          const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          return `<div class="maplibregl-ctrl-geocoder--suggestion"><div class="maplibregl-ctrl-geocoder--suggestion-info"><div class="maplibregl-ctrl-geocoder--suggestion-title">${esc(title)}</div>${address ? `<div class="maplibregl-ctrl-geocoder--suggestion-address">${esc(address)}</div>` : ''}</div></div>`;
        }}
      />

      {/* Base Station Marker — dim (stored) until live telemetry arrives */}
      {(() => {
        const livePos = droneData.baseStationPos?.length === 2 ? droneData.baseStationPos : null;
        const storedPos = !livePos && initialBaseStationPos ? initialBaseStationPos : null;
        const displayPos = livePos ?? storedPos;
        if (!displayPos || displayPos[0] == null || displayPos[1] == null) return null;
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

      {/* Waypoint markers — visible while drone is airborne */}
      {(droneData.altRel ?? 0) > 5 && waypoints?.map(wp => {
        const isGreen = visitedOrders?.has(wp.order) ?? false;
        console.log(`[MAP] wp#${wp.order} rendering as ${isGreen ? 'GREEN' : 'gray'} — visitedOrders size: ${visitedOrders?.size ?? 0}`);
        return (
          <Marker key={wp.order} longitude={wp.lng} latitude={wp.lat} anchor="center">
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: isGreen ? '#22c55e' : '#9ca3af',
              border: '1.5px solid white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </Marker>
        );
      })}

      {/* Sensor image overlays — visible on sensor tab */}
      {sensorImages?.filter((img, i, arr) => arr.findIndex(x => x.index === img.index) === i).map(img => {
        const corners = computeImageCorners(img.lat, img.lng, img.heading, img.altitude);
        return (
          <Source
            key={`sensor-${img.index}`}
            id={`sensor-img-${img.index}`}
            type="image"
            url={img.url}
            coordinates={corners}
          >
            <Layer
              id={`sensor-layer-${img.index}`}
              type="raster"
              paint={{ 'raster-opacity': 0.75 }}
            />
          </Source>
        );
      })}

      {/* Base Station Popup */}
      {baseStationPopup && (() => {
        const popupPos = droneData.baseStationPos ?? initialBaseStationPos;
        if (!popupPos || popupPos[0] == null || popupPos[1] == null) return null;
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
