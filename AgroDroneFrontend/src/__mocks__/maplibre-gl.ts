const maplibregl = {
  Map: class {
    on() {}
    off() {}
    remove() {}
    addControl() {}
    removeControl() {}
    getCanvas() { return { style: {} }; }
  },
  Marker: class {
    setLngLat() { return this; }
    addTo() { return this; }
    remove() {}
  },
  Popup: class {
    setLngLat() { return this; }
    setHTML() { return this; }
    addTo() { return this; }
    remove() {}
  },
  LngLatBounds: class {
    extend() { return this; }
  },
  supported: () => true,
};

export default maplibregl;
