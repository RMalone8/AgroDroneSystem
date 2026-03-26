import { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { DroneTelemetry } from '../constants/types';

interface DroneDataOptions {
  userId:    string | null;
  mqttToken: string | null;
}

export function useDroneData({ userId, mqttToken }: DroneDataOptions) {
  const [battery, setBattery] = useState("...");
  const [altitude, setAltitude] = useState("...");
  const [baseStationPos, setBaseStationPos] = useState<[number, number] | undefined>(undefined);
  const [imageURL, setImageURL] = useState("");
  const [hdop, setHdop] = useState("");
  const [satellitesVisible, setSatellitesVisible] = useState("");
  const [droneLat, setDroneLat] = useState("1");
  const [droneLng, setDroneLng] = useState("1");
  const [velocity, setVelocity] = useState<[string, string, string]>(["", "", ""]);
  const [heading, setHeading] = useState("");

  // Keep a stable ref to the current client so the cleanup can always find it.
  const clientRef = useRef<ReturnType<typeof mqtt.connect> | null>(null);

  useEffect(() => {
    if (!userId || !mqttToken) return;

    const topic = `${userId}/telemetry`;

    const client = mqtt.connect('ws://localhost:9001', {
      clean:    true,
      username: userId,
      password: mqttToken,
    });
    clientRef.current = client;

    const handleConnect = () => {
      console.log('Connected to broker, subscribing to', topic);
      client.subscribe(topic);
    };

    const handleMessage = (_topic: string, payload: Buffer) => {
      try {
        const telemetry = JSON.parse(payload.toString('utf8'));
        console.log('PAYLOAD:', telemetry);
        setBattery(telemetry.battery_remaining);
        setAltitude(telemetry.alt_msl);
        setBaseStationPos(telemetry.base_station_position);
        setHdop(telemetry.gps_hdop);
        setHeading(telemetry.heading);
        setSatellitesVisible(telemetry.satellites_visible);
        setDroneLat(telemetry.lat);
        setDroneLng(telemetry.lon);
        setVelocity([telemetry.vx, telemetry.vy, telemetry.vz]);
      } catch (e) {
        console.error('Telemetry parse error', e);
      }
    };

    if (client.connected) handleConnect();

    client.on('connect', handleConnect);
    client.on('message', handleMessage);
    client.on('error', (err) => {
      console.error('MQTT connection error:', err);
      client.end();
    });

    return () => {
      console.log('Cleaning up MQTT connection');
      client.off('connect',  handleConnect);
      client.off('message',  handleMessage);
      client.end();
      clientRef.current = null;
    };
  }, [userId, mqttToken]);

  return {
    battery, altitude, baseStationPos, imageURL,
    hdop, heading, satellitesVisible, droneLat, droneLng, velocity,
  } as DroneTelemetry;
}
