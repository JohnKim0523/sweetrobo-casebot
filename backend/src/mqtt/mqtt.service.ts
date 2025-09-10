import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as mqtt from 'mqtt';
import * as crypto from 'crypto';

interface MachineStatusMessage {
  msgType: 'machineInfo' | 'cleanNozzle' | 'orderStatus';
  payWayList?: string[];
  isNormal?: boolean;
  machineId?: string;
  result?: boolean;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly brokerUrl: string;
  private connected = false;

  constructor(private eventEmitter: EventEmitter2) {
    // Use WebSocket connection as shown in documentation
    // Note: The doc has a typo - it says "gzchittu.cn" but should be "gzchitu.cn"
    
    // Try different URL formats - common MQTT WebSocket patterns
    const broker = process.env.CHITU_MQTT_BROKER || 'open-mqtt.gzchitu.cn';
    
    // Option 1: Default from docs
    this.brokerUrl = `wss://${broker}`;
    
    // Alternative URLs to try if connection fails:
    // this.brokerUrl = `wss://${broker}:8084`;  // Common MQTT over WSS port
    // this.brokerUrl = `ws://${broker}:8083`;   // Non-SSL WebSocket
    // this.brokerUrl = `wss://${broker}/mqtt`;  // With /mqtt path
    // this.brokerUrl = `wss://${broker}:443`;   // HTTPS port
    
    console.log('🔧 MQTT Configuration:');
    console.log('  Broker URL:', this.brokerUrl);
    console.log('  Environment:', process.env.NODE_ENV || 'development');
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    console.log('🔌 Connecting to Chitu MQTT broker...');
    console.log(`🌐 URL: ${this.brokerUrl}`);
    
    // Generate client ID as shown in documentation
    const clientId = 'mqttjs_' + Math.random().toString(16).substr(2, 8);
    
    // Load MQTT credentials from environment
    const mqttPassword = process.env.CHITU_MQTT_PASSWORD;
    if (!mqttPassword) {
      console.error('❌ MQTT password not configured in environment');
      console.error('Please set CHITU_MQTT_PASSWORD in .env file');
      return;
    }

    const options: mqtt.IClientOptions = {
      clientId: clientId,
      username: process.env.CHITU_MQTT_USERNAME || process.env.CHITU_APP_ID || '',
      password: mqttPassword,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30 * 1000,
      // Add WebSocket specific options
      wsOptions: {
        rejectUnauthorized: false, // Accept self-signed certificates
      },
      // Add protocol version
      protocolVersion: 4, // MQTT 3.1.1
    };

    console.log(`🔑 Client ID: ${clientId}`);
    console.log(`👤 Username: ${options.username}`);
    console.log(`🔐 Password: ${options.password ? '***' + options.password.slice(-4) : 'NOT SET'}`);
    console.log(`📋 Protocol Version: ${options.protocolVersion}`);

    this.client = mqtt.connect(this.brokerUrl, options);

    // Add debugging for all MQTT events
    this.client.on('connect', (connack) => {
      console.log('✅ MQTT CONNECTED Successfully!');
      console.log('📦 CONNACK packet:', connack);
      console.log('Client connected:' + clientId);
      this.connected = true;
      this.subscribeToTopics();
    });

    this.client.on('message', (topic, payload, packet) => {
      console.log(`📨 Message received on topic: ${topic}`);
      this.handleMessage(topic, payload);
    });

    this.client.on('error', (error) => {
      console.error('❌ MQTT Error Event:', error);
      console.error('Error type:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      this.connected = false;
    });

    this.client.on('reconnect', () => {
      console.log('🔄 MQTT Reconnecting...');
      console.log('Reconnect attempt with URL:', this.brokerUrl);
    });

    this.client.on('close', () => {
      console.log('💔 MQTT Connection Closed');
      console.log('Connected status:', this.connected);
      console.log('Client state:', this.client?.connected ? 'connected' : 'disconnected');
      this.connected = false;
    });

    // Additional debugging events
    this.client.on('offline', () => {
      console.log('📴 MQTT Client is offline');
    });

    this.client.on('end', () => {
      console.log('🔚 MQTT Client connection ended');
    });

    this.client.on('disconnect', (packet) => {
      console.log('🔌 MQTT Disconnect packet received:', packet);
    });

    this.client.on('packetsend', (packet) => {
      console.log('📤 MQTT Packet sent:', packet.cmd);
    });

    this.client.on('packetreceive', (packet: any) => {
      console.log('📥 MQTT Packet received:', packet.cmd);
      if (packet.cmd === 'connack' && packet.returnCode && packet.returnCode !== 0) {
        console.error('🚫 Connection rejected with return code:', packet.returnCode);
        const errorMessages: Record<number, string> = {
          1: 'Unacceptable protocol version',
          2: 'Identifier rejected',
          3: 'Server unavailable',
          4: 'Bad username or password',
          5: 'Not authorized',
        };
        const errorMessage = packet.returnCode ? errorMessages[packet.returnCode] : 'Unknown error';
        console.error('Reason:', errorMessage || 'Unknown error');
      }
    });
  }

  private subscribeToTopics() {
    // For now, subscribe to a test topic
    // In production, you'll need actual machine IDs to generate MD5 hashes
    // Example: ct/platform/[MD5(machineId)]
    
    // Subscribe to example topic (you'll need to replace with actual machine MD5)
    const exampleTopic = 'ct/platform/+'; // Use wildcard to catch all platform messages
    
    this.client.subscribe(exampleTopic, (err) => {
      if (err) {
        console.error(`❌ Failed to subscribe to ${exampleTopic}:`, err);
      } else {
        console.log(`📡 Subscribed to ${exampleTopic}`);
      }
    });
  }

  private handleMessage(topic: string, payload: Buffer) {
    try {
      const message = JSON.parse(payload.toString()) as MachineStatusMessage;
      console.log(`📨 MQTT Message on ${topic}:`, message);

      switch (message.msgType) {
        case 'machineInfo':
          this.handleMachineInfo(message);
          break;
        case 'cleanNozzle':
          this.handleCleanNozzleResponse(message);
          break;
        default:
          console.log('📦 Unknown message type:', message.msgType);
      }
    } catch (error) {
      console.error('❌ Error parsing MQTT message:', error);
    }
  }

  private handleMachineInfo(message: MachineStatusMessage) {
    const update = {
      device_id: message.machineId,
      online_status: message.isNormal || false,
      payment_methods: message.payWayList || [],
      timestamp: new Date(),
    };

    // Emit event for WebSocket broadcast
    this.eventEmitter.emit('machine.status', update);
    console.log(`🖨️ Machine ${message.machineId}: ${message.isNormal ? 'Normal' : 'Error'}`);
  }

  private handleCleanNozzleResponse(message: MachineStatusMessage) {
    console.log(`🧹 Clean nozzle result for ${message.machineId}: ${message.result ? 'Success' : 'Failed'}`);
  }

  // Method to request machine info
  requestMachineInfo(machineId: string) {
    if (!this.connected) {
      console.error('❌ MQTT not connected, cannot send message');
      return;
    }

    const message = {
      data: {
        msgType: 'machineInfo',
        machineId: machineId,
      },
    };

    // Send to the topic that server subscribes to
    const topic = 'ct/machine/common';
    
    this.client.publish(topic, JSON.stringify(message), (err) => {
      if (err) {
        console.error('❌ Failed to publish message:', err);
      } else {
        console.log('📤 Sent machine info request for:', machineId);
      }
    });
  }

  // Method to send clean nozzle command
  cleanNozzle(machineId: string) {
    if (!this.connected) {
      console.error('❌ MQTT not connected, cannot send message');
      return;
    }

    const message = {
      data: {
        msgType: 'cleanNozzle',
        machineId: machineId,
      },
    };

    const topic = 'ct/machine/common';
    
    this.client.publish(topic, JSON.stringify(message), (err) => {
      if (err) {
        console.error('❌ Failed to publish clean nozzle command:', err);
      } else {
        console.log('📤 Sent clean nozzle command for:', machineId);
      }
    });
  }

  // Subscribe to specific machine updates
  subscribeToMachine(machineId: string) {
    if (!this.connected) {
      console.error('❌ MQTT not connected');
      return;
    }

    // Generate MD5 hash of machine ID
    const md5Hash = crypto.createHash('md5').update(machineId).digest('hex');
    const topic = `ct/platform/${md5Hash}`;
    
    this.client.subscribe(topic, (err) => {
      if (err) {
        console.error(`❌ Failed to subscribe to machine ${machineId}:`, err);
      } else {
        console.log(`📡 Subscribed to machine ${machineId} on topic ${topic}`);
      }
    });
  }

  async disconnect() {
    if (this.client) {
      console.log('👋 Disconnecting from MQTT broker...');
      this.client.end();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}