import mqtt from 'mqtt';

interface EmergencyCredentials {
  userId:    string;
  mqttToken: string;
}

export function sendEmergencySignal(message: string, credentials: EmergencyCredentials, brokerUrl?: string) {
  const { userId, mqttToken } = credentials;
  const topic = `${userId}/emergency`;

  const url = brokerUrl ?? (() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProtocol}://${window.location.host}/mqtt`;
  })();

  const client = mqtt.connect(url, {
    clean:    true,
    username: userId,
    password: mqttToken,
  });

  client.on('error', (err) => {
    console.error('Emergency MQTT connection error:', err);
    client.end();
  });

  const publish = () => {
    console.log('Sending emergency signal:', message, '→', topic);
    client.publish(topic, message, {}, () => client.end());
  };

  if (client.connected) {
    publish();
  } else {
    client.once('connect', publish);
  }
}
