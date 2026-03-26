/* global fetch */
import * as React from 'react';
import {useState} from 'react';
import {useControl, Marker, MarkerProps, ControlPosition} from '@vis.gl/react-maplibre';
import MaplibreGeocoder, {
  MaplibreGeocoderApi,
  MaplibreGeocoderOptions
} from '@maplibre/maplibre-gl-geocoder';

type GeocoderControlProps = Omit<MaplibreGeocoderOptions, 'maplibregl' | 'marker'> & {
  marker?: boolean | Omit<MarkerProps, 'longitude' | 'latitude'>;

  position: ControlPosition;

  onLoading?: (e: object) => void;
  onResults?: (e: object) => void;
  onResult?: (e: object) => void;
  onError?: (e: object) => void;
};

const geocoderApi: MaplibreGeocoderApi = {
  forwardGeocode: async config => {
    const features = [];
    try {
      const request = `https://nominatim.openstreetmap.org/search?q=${config.query}&format=geojson&polygon_geojson=1&addressdetails=1`;
      const response = await fetch(request);
      const geojson = await response.json();
      for (const feature of geojson.features) {
        const center: [number, number] = [
          feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2,
          feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2
        ];
        const point = {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const, 
            coordinates: center
          },
          place_name: feature.properties.display_name,
          properties: feature.properties,
          text: feature.properties.display_name,
          place_type: ['place'],
          center: center
        };
        features.push(point);
      }
    } catch (e) {
      console.error(`Failed to forwardGeocode with error: ${e}`);
    }

    return {
      type: 'FeatureCollection' as const,
      features: features
    };
  }
};

export default function GeocoderControl(props: GeocoderControlProps) {
  const {
    marker: useMarker = true,
    onLoading = () => {},
    onResults = () => {},
    onResult = () => {},
    onError = () => {},
    position,
    ...otherOptions // Captures proximity, zoom, etc.
  } = props;

  const [markerElement, setMarkerElement] = React.useState<React.ReactElement | null>(null);

  const geocoder = useControl<MaplibreGeocoder>(
    ({mapLib}) => {
      const ctrl = new MaplibreGeocoder(geocoderApi, {
        ...otherOptions,
        marker: false,
        maplibregl: mapLib as any
      });
      ctrl.on('loading', (e) => props.onLoading?.(e));
      ctrl.on('results', (e) => props.onResults?.(e));
      ctrl.on('result', evt => {
        onResult(evt);

        const {result} = evt;
        const location =
          result &&
          (result.center || (result.geometry?.type === 'Point' && result.geometry.coordinates));
          
        if (location && useMarker) {
          const markerProps = typeof useMarker === 'object' ? useMarker : {};
          setMarkerElement(<Marker {...markerProps} longitude={location[0]} latitude={location[1]} />);
        } else {
          setMarkerElement(null);
        }
      });
      ctrl.on('error', (e) => onError);
      return ctrl;
    },
    {
      position: position
    }
  );

  // @ts-ignore (TS2339) private member
  if (geocoder._map) {
    if (geocoder.getProximity() !== props.proximity && props.proximity !== undefined) {
      geocoder.setProximity(props.proximity);
    }
    if (geocoder.getRenderFunction() !== props.render && props.render !== undefined) {
      geocoder.setRenderFunction(props.render);
    }
    if (geocoder.getLanguage() !== props.language && props.language !== undefined) {
      geocoder.setLanguage(props.language);
    }
    if (geocoder.getZoom() !== props.zoom && props.zoom !== undefined) {
      geocoder.setZoom(props.zoom);
    }
    if (geocoder.getFlyTo() !== props.flyTo && props.flyTo !== undefined) {
      geocoder.setFlyTo(props.flyTo);
    }
    if (geocoder.getPlaceholder() !== props.placeholder && props.placeholder !== undefined) {
      geocoder.setPlaceholder(props.placeholder);
    }
    if (geocoder.getCountries() !== props.countries && props.countries !== undefined) {
      geocoder.setCountries(props.countries);
    }
    if (geocoder.getTypes() !== props.types && props.types !== undefined) {
      geocoder.setTypes(props.types);
    }
    if (geocoder.getMinLength() !== props.minLength && props.minLength !== undefined) {
      geocoder.setMinLength(props.minLength);
    }
    if (geocoder.getLimit() !== props.limit && props.limit !== undefined) {
      geocoder.setLimit(props.limit);
    }
    if (geocoder.getFilter() !== props.filter && props.filter !== undefined) {
      geocoder.setFilter(props.filter);
    }
    // if (geocoder.getOrigin() !== props.origin && props.origin !== undefined) {
    //   geocoder.setOrigin(props.origin);
    // }
    // if (geocoder.getAutocomplete() !== props.autocomplete && props.autocomplete !== undefined) {
    //   geocoder.setAutocomplete(props.autocomplete);
    // }
    // if (geocoder.getFuzzyMatch() !== props.fuzzyMatch && props.fuzzyMatch !== undefined) {
    //   geocoder.setFuzzyMatch(props.fuzzyMatch);
    // }
    // if (geocoder.getRouting() !== props.routing && props.routing !== undefined) {
    //   geocoder.setRouting(props.routing);
    // }
    // if (geocoder.getWorldview() !== props.worldview && props.worldview !== undefined) {
    //   geocoder.setWorldview(props.worldview);
    // }
  }
  return markerElement;
}