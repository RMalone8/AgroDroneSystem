import { useControl } from '@vis.gl/react-maplibre';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { IControl } from 'maplibre-gl';

export function DrawControl(props: any) {
    useControl(
      () => {
        const draw = new MapboxDraw(props) as unknown as IControl;
        
        if (props.onInstanceUpdate) {
          props.onInstanceUpdate(draw);
        }
  
        return draw;
      },
      {
        position: props.position
      }
    );
  
    return null;
  }
  