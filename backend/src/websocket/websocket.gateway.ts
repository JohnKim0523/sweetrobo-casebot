import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';

@WebSocketGateway({
  cors: {
    origin: '*', // Configure properly for production
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clients: Map<string, Socket> = new Map();

  handleConnection(client: Socket) {
    console.log(`🔗 Client connected: ${client.id}`);
    this.clients.set(client.id, client);
    
    // Send initial connection confirmation
    client.emit('connected', { 
      message: 'Connected to SweetRobo WebSocket',
      clientId: client.id 
    });
  }

  handleDisconnect(client: Socket) {
    console.log(`💔 Client disconnected: ${client.id}`);
    this.clients.delete(client.id);
  }

  // Subscribe to specific machine updates
  @SubscribeMessage('subscribe:machine')
  handleMachineSubscription(client: Socket, deviceId: string) {
    client.join(`machine:${deviceId}`);
    console.log(`📡 Client ${client.id} subscribed to machine ${deviceId}`);
    return { subscribed: true, deviceId };
  }

  // Subscribe to specific order updates
  @SubscribeMessage('subscribe:order')
  handleOrderSubscription(client: Socket, orderId: string) {
    client.join(`order:${orderId}`);
    console.log(`📡 Client ${client.id} subscribed to order ${orderId}`);
    return { subscribed: true, orderId };
  }

  // Listen for MQTT machine status updates and broadcast
  @OnEvent('machine.status')
  handleMachineStatus(data: any) {
    console.log('🖨️ Broadcasting machine status:', data);
    
    // Broadcast to all clients watching this machine
    this.server.to(`machine:${data.device_id}`).emit('machine:status', data);
    
    // Also broadcast to admin dashboard
    this.server.emit('admin:machine:status', data);
  }

  // Listen for MQTT order updates and broadcast
  @OnEvent('order.update')
  handleOrderUpdate(data: any) {
    console.log('📦 Broadcasting order update:', data);
    
    // Broadcast to clients watching this order
    this.server.to(`order:${data.order_id}`).emit('order:update', data);
    
    // Also broadcast to admin dashboard
    this.server.emit('admin:order:update', data);
  }

  // Listen for MQTT payment updates
  @OnEvent('payment.update')
  handlePaymentUpdate(data: any) {
    console.log('💳 Broadcasting payment update:', data);
    
    // Broadcast payment updates
    this.server.emit('payment:update', data);
  }

  // Send print progress updates
  broadcastPrintProgress(orderId: string, progress: number, status: string) {
    this.server.to(`order:${orderId}`).emit('print:progress', {
      orderId,
      progress,
      status,
      timestamp: new Date(),
    });
  }

  // Send error notifications
  broadcastError(deviceId: string, error: any) {
    this.server.to(`machine:${deviceId}`).emit('machine:error', {
      deviceId,
      error: error.message || error,
      timestamp: new Date(),
    });
  }

  // Admin broadcast for all machine statuses
  broadcastAllMachineStatuses(statuses: any[]) {
    this.server.emit('admin:all:machines', statuses);
  }
}