import { Injectable } from '@nestjs/common';

/**
 * Service to track mapping between our internal job IDs and Chitu order IDs
 * This is necessary because:
 * 1. We create orders with our own jobId (e.g., job_123456_abc)
 * 2. Chitu returns their own orderId (e.g., CT_ORDER_789)
 * 3. MQTT status updates from Chitu use Chitu's orderId
 * 4. Frontend is subscribed to our jobId
 *
 * This service bridges the gap by maintaining a mapping table.
 */
@Injectable()
export class OrderMappingService {
  // Map from Chitu orderId to our jobId
  private chituToJobId: Map<string, string> = new Map();

  // Map from our jobId to Chitu orderId (reverse lookup)
  private jobIdToChitu: Map<string, string> = new Map();

  // Also track machine ID for each order
  private orderMachineMap: Map<string, string> = new Map();

  // Cleanup old entries after 24 hours
  private readonly TTL_MS = 24 * 60 * 60 * 1000;
  private timestamps: Map<string, number> = new Map();

  constructor() {
    // Cleanup old entries every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
    console.log('🗺️ OrderMappingService initialized');
  }

  /**
   * Register a mapping between our jobId and Chitu's orderId
   */
  registerMapping(
    jobId: string,
    chituOrderId: string,
    machineId?: string,
  ): void {
    console.log(`🗺️ Registering order mapping: ${jobId} <-> ${chituOrderId}`);

    this.chituToJobId.set(chituOrderId, jobId);
    this.jobIdToChitu.set(jobId, chituOrderId);
    this.timestamps.set(jobId, Date.now());

    if (machineId) {
      this.orderMachineMap.set(jobId, machineId);
      this.orderMachineMap.set(chituOrderId, machineId);
    }
  }

  /**
   * Get our jobId from Chitu's orderId
   */
  getJobId(chituOrderId: string): string | undefined {
    return this.chituToJobId.get(chituOrderId);
  }

  /**
   * Get Chitu's orderId from our jobId
   */
  getChituOrderId(jobId: string): string | undefined {
    return this.jobIdToChitu.get(jobId);
  }

  /**
   * Get machine ID for an order
   */
  getMachineId(orderId: string): string | undefined {
    return this.orderMachineMap.get(orderId);
  }

  /**
   * Check if we have a mapping for this Chitu orderId
   */
  hasChituMapping(chituOrderId: string): boolean {
    return this.chituToJobId.has(chituOrderId);
  }

  /**
   * Clean up old mappings
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [jobId, timestamp] of this.timestamps.entries()) {
      if (now - timestamp > this.TTL_MS) {
        const chituId = this.jobIdToChitu.get(jobId);

        this.jobIdToChitu.delete(jobId);
        this.orderMachineMap.delete(jobId);
        this.timestamps.delete(jobId);

        if (chituId) {
          this.chituToJobId.delete(chituId);
          this.orderMachineMap.delete(chituId);
        }

        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old order mappings`);
    }
  }

  /**
   * Get statistics about current mappings
   */
  getStats(): { totalMappings: number; oldestMapping: Date | null } {
    const timestamps = Array.from(this.timestamps.values());
    return {
      totalMappings: this.chituToJobId.size,
      oldestMapping:
        timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null,
    };
  }
}
