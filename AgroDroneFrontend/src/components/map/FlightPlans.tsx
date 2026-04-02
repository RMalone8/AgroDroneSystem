import { MutableRefObject } from 'react';
import { MissionFrequency } from '../../constants/types';
import { authFetch } from '../../utils/api';

export interface Vertex {
  order: number;
  lat: number;
  lng: number;
}

export interface FlightPlanPayload {
  fpid: string;
  missionName: string;
  scheduledAt: string;
  frequency: MissionFrequency;
  createdAt: string;
  totalVertices: number;
  vertices: Vertex[];
}

// Extracts polygon vertices from the active draw selection.
// Returns null if nothing is selected or the draw ref is not ready.
export function extractVertices(drawRef: MutableRefObject<any>): Omit<Vertex, 'order'>[] | null {
  try {
    const features = drawRef.current?.getSelected()?.features;
    if (!features?.length) return null;
    const coords: number[][] = features[0].geometry.coordinates[0];
    return coords.map((coord) => ({ lng: coord[0], lat: coord[1] }));
  } catch {
    return null;
  }
}

// Sends a complete flight plan payload to the backend.
// Returns true on success, false on error.
export async function saveFlightPlan(payload: FlightPlanPayload): Promise<boolean> {
  try {
    const response = await authFetch('/flightplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log('Flight Plan Sent!');
      return true;
    } else {
      console.error('Error Sending Flight Plan. Status:', response.status);
      return false;
    }
  } catch (e) {
    console.error(e);
    return false;
  }
}

export async function getAllFlightPlans() {
  try {
    const response = await authFetch('/flightplan/all');
    if (!response.ok) return { flightplans: [], metadata: {} };
    return await response.json();
  } catch (e) {
    console.log('Error Retrieving All Flight Plans: ', e);
    return { flightplans: [], metadata: {} };
  }
}

export async function selectFlightPlan(fp: any, drawRef: MutableRefObject<any>) {
  const geojsonFeature = {
    id: fp.fpid,
    type: 'Feature',
    properties: { createdAt: fp.createdAt },
    geometry: {
      type: 'Polygon',
      coordinates: [fp.vertices.map((v: any) => [v.lng, v.lat])],
    },
  };
  drawRef.current.deleteAll();
  drawRef.current.add(geojsonFeature);
}

export async function activateFlightPlan(fpid: string) {
  try {
    const response = await authFetch(`/flightplan/${fpid}/activate`, {
      method: 'PUT',
    });
    if (response.ok) {
      console.log('Flight plan activated:', fpid);
      return true;
    } else {
      console.error('Error activating flight plan. Status:', response.status);
      return false;
    }
  } catch (e) {
    console.error('Error activating flight plan:', e);
    return false;
  }
}

export async function deleteFlightPlan(
  fp: any,
  _flightplans: any,
  drawRef: MutableRefObject<any>,
  setFlightPlans: any,
) {
  try {
    if (drawRef.current) {
      drawRef.current.delete(fp.fpid);
    }
    const response = await authFetch(`/flightplan/${fp.fpid}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      setFlightPlans((prev: any) => ({
        ...prev,
        flightplans: prev.flightplans.filter(
          (plan: { fpid: any }) => plan.fpid !== fp.fpid,
        ),
      }));
      console.log('Successfully deleted flight plan', fp.fpid);
    } else {
      console.log('Response Code not OK:', response.status);
    }
  } catch (e) {
    console.log('Error deleting flight plan:', e);
  }
}
