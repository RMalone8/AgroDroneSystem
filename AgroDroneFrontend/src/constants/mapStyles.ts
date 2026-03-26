export const ICON = `M20.2,15.7L20.2,15.7c1.1-1.6,1.8-3.6,1.8-5.7c0-5.6-4.5-10-10-10S2,4.5,2,10c0,2,0.6,3.9,1.6,5.4c0,0.1,0.1,0.2,0.2,0.3
  c0,0,0.1,0.1,0.1,0.2c0.2,0.3,0.4,0.6,0.7,0.9c2.6,3.1,7.4,7.6,7.4,7.6s4.8-4.5,7.4-7.5c0.2-0.3,0.5-0.6,0.7-0.9
  C20.1,15.8,20.2,15.8,20.2,15.7z`;

// Top-down quadcopter silhouette: cross arms + four rotors + centre hub
export const DRONE_ICON = [
  'M5 10.5 h14 v3 h-14 Z',                          // horizontal arm
  'M10.5 5 h3 v14 h-3 Z',                           // vertical arm
  'M1 12 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0',          // left rotor
  'M17 12 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0',         // right rotor
  'M9 4 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0',           // front rotor
  'M9 20 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0',          // rear rotor
  'M10 12 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0',         // centre hub
].join(' ');

export const pinStyle = {
  cursor: 'pointer',
  fill: '#d00',
  stroke: 'none'
};

export const dronePinStyle = {
  cursor: 'pointer',
  fill: '#2563eb',
  stroke: 'none'
};
  
export const drawProps = [
  // ACTIVE (being drawn)
  // line stroke
  {
      "id": "gl-draw-line",
      "type": "line",
      "filter": ["all", ["==", "$type", "LineString"]],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#D20C0C",
        "line-dasharray": [0.2, 2],
        "line-width": 2
      }
  },
  // polygon fill
  {
    "id": "gl-draw-polygon-fill",
    "type": "fill",
    "filter": ["all", ["==", "$type", "Polygon"]],
    "paint": {
      "fill-color": "#D20C0C",
      "fill-outline-color": "#D20C0C",
      "fill-opacity": 0.1
    }
  },
  // polygon mid points
  {
    'id': 'gl-draw-polygon-midpoint',
    'type': 'circle',
    'filter': ['all',
      ['==', '$type', 'Point'],
      ['==', 'meta', 'midpoint']],
    'paint': {
      'circle-radius': 3,
      'circle-color': '#fbb03b'
    }
  },
  // polygon outline stroke
  // This doesn't style the first edge of the polygon, which uses the line stroke styling instead
  {
    "id": "gl-draw-polygon-stroke-active",
    "type": "line",
    "filter": ["all", ["==", "$type", "Polygon"]],
    "layout": {
      "line-cap": "round",
      "line-join": "round"
    },
    "paint": {
      "line-color": "#D20C0C",
      "line-dasharray": [0.2, 2],
      "line-width": 2
    }
  },
  // vertex point halos
  {
    "id": "gl-draw-polygon-and-line-vertex-halo-active",
    "type": "circle",
    "filter": ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    "paint": {
      "circle-radius": 5,
      "circle-color": "#FFF"
    }
  },
  // vertex points
  {
    "id": "gl-draw-polygon-and-line-vertex-active",
    "type": "circle",
    "filter": ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    "paint": {
      "circle-radius": 3,
      "circle-color": "#D20C0C",
    }
  }
];