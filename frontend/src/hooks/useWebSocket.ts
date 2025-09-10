import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface MachineStatus {
  device_id: string;
  online_status: boolean;
  working_status: 'idle' | 'printing' | 'completed' | 'error';
  timestamp: Date;
}

interface OrderUpdate {
  order_id: string;
  status: string;
  progress?: number;
  timestamp: Date;
}

interface PrintProgress {
  orderId: string;
  progress: number;
  status: string;
  timestamp: Date;
}

export const useWebSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [machineStatus, setMachineStatus] = useState<MachineStatus | null>(null);
  const [orderUpdate, setOrderUpdate] = useState<OrderUpdate | null>(null);
  const [printProgress, setPrintProgress] = useState<PrintProgress | null>(null);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const newSocket = io(backendUrl);

    newSocket.on('connect', () => {
      console.log('✅ Connected to backend WebSocket');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('💔 Disconnected from backend WebSocket');
      setConnected(false);
    });

    newSocket.on('machine:status', (data: MachineStatus) => {
      console.log('🖨️ Machine status update:', data);
      setMachineStatus(data);
    });

    newSocket.on('order:update', (data: OrderUpdate) => {
      console.log('📦 Order update:', data);
      setOrderUpdate(data);
    });

    newSocket.on('print:progress', (data: PrintProgress) => {
      console.log('📊 Print progress:', data);
      setPrintProgress(data);
    });

    newSocket.on('machine:error', (error) => {
      console.error('❌ Machine error:', error);
      // Handle machine errors (show notification, etc.)
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const subscribeToMachine = (deviceId: string) => {
    if (socket) {
      socket.emit('subscribe:machine', deviceId);
    }
  };

  const subscribeToOrder = (orderId: string) => {
    if (socket) {
      socket.emit('subscribe:order', orderId);
    }
  };

  return {
    socket,
    connected,
    machineStatus,
    orderUpdate,
    printProgress,
    subscribeToMachine,
    subscribeToOrder,
  };
};