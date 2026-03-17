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
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private clients: Map<string, Socket> = new Map();

  handleConnection(client: Socket) {
    this.clients.set(client.id, client);

    // Send initial connection confirmation
    client.emit('connected', {
      message: 'Connected to SweetRobo WebSocket',
      clientId: client.id,
    });
  }

  handleDisconnect(client: Socket) {
    this.clients.delete(client.id);
  }

  // Subscribe to specific machine updates
  @SubscribeMessage('subscribe:machine')
  handleMachineSubscription(client: Socket, deviceId: string) {
    client.join(`machine:${deviceId}`);
    return { subscribed: true, deviceId };
  }

  @SubscribeMessage('subscribe:order')
  handleOrderSubscription(client: Socket, orderId: string) {
    client.join(`order:${orderId}`);
    return { subscribed: true, orderId };
  }

  @OnEvent('machine.status')
  handleMachineStatus(data: any) {

    // Broadcast to all clients watching this machine
    this.server.to(`machine:${data.device_id}`).emit('machine:status', data);

      this.server.emit('admin:machine:status', data);
  }

  @OnEvent('order.update')
  handleOrderUpdate(data: any) {

    // Broadcast to clients watching this order
    this.server.to(`order:${data.order_id}`).emit('order:update', data);

    this.server.emit('admin:order:update', data);
  }

  @OnEvent('payment.update')
  handlePaymentUpdate(data: any) {

    // Broadcast payment updates
    this.server.emit('payment:update', data);
  }

  @OnEvent('order.status')
  handleOrderStatus(data: any) {
    if (data.orderNo) {
      this.server.to(`order:${data.orderNo}`).emit('order:status', data);
    }
    if (data.jobId && data.jobId !== data.orderNo) {
      this.server.to(`order:${data.jobId}`).emit('order:status', data);
    }
    if (data.machineId) {
      this.server.to(`machine:${data.machineId}`).emit('order:status', data);
    }
    this.server.emit('admin:order:status', data);
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
