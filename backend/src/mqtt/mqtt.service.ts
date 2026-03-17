import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as mqtt from 'mqtt';
import * as crypto from 'crypto';
import { OrderMappingService } from '../order-mapping/order-mapping.service';

interface MachineStatusMessage {
  msgType: 'machineInfo' | 'cleanNozzle' | 'orderStatus';
  payWayList?: string[];
  isNormal?: boolean;
  machineId?: string;
  result?: boolean;
  orderId?: string;
  orderNo?: string;
  status?: 'pending' | 'paid' | 'printing' | 'completed' | 'failed';
  payStatus?: 'unpaid' | 'paid' | 'refunded';
  payType?: string;
  amount?: number;
  timestamp?: number;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly brokerUrl: string;
  private connected = false;

  constructor(
    private eventEmitter: EventEmitter2,
    private orderMappingService: OrderMappingService,
  ) {
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

  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    const clientId = 'mqttjs_' + Math.random().toString(16).substr(2, 8);

    const mqttPassword = process.env.CHITU_MQTT_PASSWORD;
    if (!mqttPassword) {
      console.error('[MQTT] Missing CHITU_MQTT_PASSWORD in .env');
      return;
    }

    const options: mqtt.IClientOptions = {
      clientId,
      username:
        process.env.CHITU_MQTT_USERNAME || process.env.CHITU_APP_ID || '',
      password: mqttPassword,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30 * 1000,
      wsOptions: { rejectUnauthorized: false },
      protocolVersion: 4,
    };

    this.client = mqtt.connect(this.brokerUrl, options);

    this.client.on('connect', () => {
      console.log('[MQTT] Connected');
      this.connected = true;
      this.subscribeToTopics();
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload);
    });

    this.client.on('error', (error) => {
      console.error('[MQTT] Error:', error.message);
      this.connected = false;
    });

    this.client.on('close', () => {
      this.connected = false;
    });

    this.client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting...');
    });
  }

  private subscribeToTopics() {
    // For now, subscribe to a test topic
    // In production, you'll need actual machine IDs to generate MD5 hashes
    // Example: ct/platform/[MD5(machineId)]

    // Subscribe to example topic (you'll need to replace with actual machine MD5)
    const exampleTopic = 'ct/platform/+'; // Use wildcard to catch all platform messages

    this.client.subscribe(exampleTopic, (err) => {
      if (err) console.error('[MQTT] Subscribe failed:', err.message);
    });
  }

  private handleMessage(topic: string, payload: Buffer) {
    try {
      const message = JSON.parse(payload.toString()) as MachineStatusMessage;

      switch (message.msgType) {
        case 'machineInfo':
          this.handleMachineInfo(message);
          break;
        case 'cleanNozzle':
          this.handleCleanNozzleResponse(message);
          break;
        case 'orderStatus':
          this.handleOrderStatus(message);
          break;
      }
    } catch (error) {
      console.error('[MQTT] Parse error:', error);
    }
  }

  private handleMachineInfo(message: MachineStatusMessage) {
    const update = {
      device_id: message.machineId,
      online_status: message.isNormal || false,
      payment_methods: message.payWayList || [],
      timestamp: new Date(),
    };

    this.eventEmitter.emit('machine.status', update);
  }

  private handleCleanNozzleResponse(message: MachineStatusMessage) {
    // No action needed
  }

  private handleOrderStatus(message: MachineStatusMessage) {
    let jobId: string | undefined;
    if (message.orderId) {
      jobId = this.orderMappingService.getJobId(message.orderId);
    }
    if (!jobId && message.orderNo) {
      jobId = this.orderMappingService.getJobId(message.orderNo);
    }

    const orderUpdate = {
      orderId: message.orderId,
      orderNo: jobId || message.orderNo, // Use our jobId if mapped, else Chitu's orderNo
      jobId: jobId, // Explicit jobId field for frontend matching
      chituOrderId: message.orderId, // Keep original Chitu ID for reference
      chituOrderNo: message.orderNo, // Keep original Chitu orderNo for reference
      machineId: message.machineId,
      status: message.status,
      payStatus: message.payStatus,
      payType: message.payType,
      amount: message.amount,
      timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    };

    this.eventEmitter.emit('order.status', orderUpdate);

    // Only log meaningful status changes
    const id = jobId || message.orderNo;
    if (message.payStatus === 'paid') {
      console.log(`[MQTT] Payment confirmed: ${id} (${message.payType})`);
    } else if (message.status === 'printing') {
      console.log(`[MQTT] Printing: ${id}`);
    } else if (message.status === 'completed') {
      console.log(`[MQTT] Completed: ${id}`);
    } else if (message.status === 'failed') {
      console.error(`[MQTT] Failed: ${id}`);
    }
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
      if (err) console.error('[MQTT] Publish failed:', err.message);
    });
  }

  // TEST METHOD: Simulate payment confirmation (for testing without physical machine)
  simulatePaymentConfirmation(
    machineId: string,
    orderNo: string,
    amount: number = 25.99,
  ) {
    // For test simulation, the orderNo IS our jobId
    const testOrderStatus = {
      orderId: `test_${orderNo}`,
      orderNo: orderNo,
      jobId: orderNo, // In test mode, orderNo is the jobId
      machineId: machineId,
      status: 'paid',
      payStatus: 'paid',
      payType: 'test_simulation',
      amount: amount,
      timestamp: new Date(),
    };

    this.eventEmitter.emit('order.status', testOrderStatus);
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
      if (err) console.error('[MQTT] Publish failed:', err.message);
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
      if (err) console.error('[MQTT] Subscribe failed:', err.message);
    });
  }

  async disconnect() {
    if (this.client) {
      this.client.end();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
