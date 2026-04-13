import mqtt from 'mqtt';

interface EmergencyCredentials {
  userId:    string;
  mqttToken: string;
}

export function sendEmergencySignal(message: string, credentials: EmergencyCredentials) {
  const { userId, mqttToken } = credentials;
  const topic = `${userId}/emergency`;

  const client = mqtt.connect(`ws://${window.location.host}/mqtt`, {
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
