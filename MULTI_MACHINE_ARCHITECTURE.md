# Multi-Machine Multi-User Architecture

## Overview
Support multiple phone case printing machines with concurrent users, each accessing via machine-specific QR codes.

## User Flow
1. User scans QR code on specific machine
2. QR code contains: `https://yoursite.com/editor?machine=CT0700046`
3. Web app loads with that machine pre-selected
4. User creates design
5. Order sent to that specific machine
6. User sees real-time status updates

## Required Components

### 1. QR Code Structure
Each machine QR code should contain:
```
https://yoursite.com/editor?machine={MACHINE_CODE}&location={OPTIONAL_LOCATION_ID}
```

### 2. Frontend Changes

#### Route with Machine Parameter
```typescript
// pages/editor.tsx or pages/editor/[machineId].tsx
const router = useRouter();
const { machine } = router.query;
```

#### Session Management
```typescript
interface UserSession {
  sessionId: string;
  machineCode: string;
  startTime: Date;
  currentDesign?: string;
  orderStatus?: 'designing' | 'processing' | 'printing' | 'complete';
}
```

### 3. Backend Changes

#### Machine-Specific Endpoints
```typescript
// Get specific machine status
GET /api/chitu/machine/:machineCode/status

// Create order for specific machine
POST /api/chitu/machine/:machineCode/print
{
  "image_url": "...",
  "sessionId": "..."
}

// Get queue position
GET /api/chitu/machine/:machineCode/queue/:orderId
```

#### Enhanced Queue Service
```typescript
class MachineQueueService {
  private queues: Map<string, Queue> = new Map();

  addToQueue(machineCode: string, order: Order) {
    if (!this.queues.has(machineCode)) {
      this.queues.set(machineCode, new Queue());
    }
    return this.queues.get(machineCode).add(order);
  }

  getQueuePosition(machineCode: string, orderId: string) {
    const queue = this.queues.get(machineCode);
    return queue?.getPosition(orderId) ?? -1;
  }
}
```

### 4. Real-time Updates via MQTT
```typescript
// Subscribe to specific machine updates
mqtt.subscribe(`ct/machine/${machineCode}/status`);
mqtt.subscribe(`ct/order/${orderId}/progress`);

// Broadcast to specific user sessions
io.to(sessionId).emit('orderUpdate', { status, progress });
```

### 5. Database/Storage Considerations

#### Order Tracking
```typescript
interface PrintOrder {
  id: string;
  sessionId: string;
  machineCode: string;
  deviceId: string;  // Encrypted device ID
  imageUrl: string;
  status: 'queued' | 'printing' | 'complete' | 'failed';
  queuePosition?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
```

#### Machine Registry
```typescript
interface MachineInfo {
  code: string;           // CT0700046
  deviceId: string;       // Encrypted ID
  name: string;
  location?: string;
  status: 'online' | 'offline' | 'printing' | 'error';
  currentOrder?: string;
  queueLength: number;
  inkLevels: {
    cyan: number;
    magenta: number;
    yellow: number;
    black: number;
  };
}
```

## Implementation Priority

### Phase 1: Core Multi-Machine Support ✅ Needed Now
1. Add machine parameter to frontend routes
2. Pass machine code from QR to backend
3. Update ChituService to accept dynamic machine codes
4. Test with multiple machines

### Phase 2: Queue Management
1. Implement per-machine queues
2. Add queue position tracking
3. Show estimated wait times
4. Handle queue overflow

### Phase 3: Enhanced User Experience
1. Real-time status updates
2. Push notifications when ready
3. Session recovery (if user navigates away)
4. Multi-language support

## Security Considerations
1. Validate machine codes against whitelist
2. Rate limiting per session
3. Image upload size limits
4. Session timeout after inactivity
5. Prevent queue manipulation

## Scalability Notes
- Each machine handles ~10 prints/hour
- Queue should cap at reasonable limit (e.g., 20 orders)
- Consider Redis for distributed queue management
- CDN for image storage/delivery
- Load balancer for multiple backend instances

## Testing Requirements
1. Simulate multiple concurrent users
2. Test queue overflow scenarios
3. Handle machine offline during print
4. Network interruption recovery
5. Image upload failures