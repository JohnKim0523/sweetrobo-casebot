import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';

export interface PrintJobData {
  sessionId: string;
  machineId: string;
  image: string;
  imageUrl?: string;
  phoneModel: string;
  phoneModelId: string;
  productId?: string;  // Chitu product_id for the phone case model
  dimensions: {
    widthPX: number;
    heightPX: number;
    widthMM: number;
    heightMM: number;
  };
  priority?: number;
  userId?: string;
  submittedAt: Date;
  fingerprint?: string;
}

@Injectable()
export class QueueService {
  private submissionCache = new Map<string, number>();
  private readonly DUPLICATE_WINDOW_MS = 10000; // 10 seconds
  private machineRoundRobin = 0;
  private availableMachines = ['machine-1', 'machine-2', 'machine-3']; // Will be dynamic

  constructor(
    @InjectQueue('print-jobs') private printQueue: Queue,
  ) {
    // Clean up old cache entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.submissionCache.entries()) {
        if (now - timestamp > this.DUPLICATE_WINDOW_MS) {
          this.submissionCache.delete(key);
        }
      }
    }, 60000);
  }

  /**
   * Create a fingerprint for duplicate detection
   */
  private createFingerprint(data: Partial<PrintJobData>): string {
    // Create hash from image data + session + timestamp window
    const timeWindow = Math.floor(Date.now() / this.DUPLICATE_WINDOW_MS);
    const fingerprint = crypto
      .createHash('md5')
      .update(`${data.sessionId}-${data.image?.substring(0, 100)}-${timeWindow}`)
      .digest('hex');
    return fingerprint;
  }

  /**
   * Check if this is a duplicate submission
   */
  private isDuplicate(fingerprint: string): boolean {
    const now = Date.now();
    const lastSubmission = this.submissionCache.get(fingerprint);
    
    if (lastSubmission && (now - lastSubmission) < this.DUPLICATE_WINDOW_MS) {
      console.log(`🚫 Duplicate submission detected: ${fingerprint}`);
      return true;
    }
    
    this.submissionCache.set(fingerprint, now);
    return false;
  }

  /**
   * Get next available machine (round-robin load balancing)
   */
  private getNextMachine(): string {
    // In production, this would check actual machine status
    const machine = this.availableMachines[this.machineRoundRobin % this.availableMachines.length];
    this.machineRoundRobin++;
    return machine;
  }

  /**
   * Add a print job to the queue
   */
  async addPrintJob(data: Partial<PrintJobData>) {
    // Create fingerprint for duplicate detection
    const fingerprint = this.createFingerprint(data);
    
    // Check for duplicate
    if (this.isDuplicate(fingerprint)) {
      return {
        success: false,
        error: 'Duplicate submission detected. Please wait before submitting again.',
        jobId: null,
      };
    }

    // Assign machine if not specified (load balancing)
    if (!data.machineId || data.machineId.startsWith('demo-')) {
      data.machineId = this.getNextMachine();
    }

    // Calculate priority (can be based on user type, payment, etc.)
    const priority = data.priority || this.calculatePriority(data);

    // Add to queue with priority
    const job = await this.printQueue.add('print', {
      ...data,
      fingerprint,
      submittedAt: new Date(),
      priority,
    }, {
      priority,
      delay: 0,
    });

    console.log(`✅ Print job queued: ${job.id} for machine: ${data.machineId}`);

    return {
      success: true,
      jobId: job.id,
      machineId: data.machineId,
      position: await this.getQueuePosition(job.id),
      estimatedTime: await this.estimateProcessingTime(job.id),
    };
  }

  /**
   * Calculate priority for a job
   */
  private calculatePriority(data: Partial<PrintJobData>): number {
    // Lower number = higher priority
    // Default priority is 100
    let priority = 100;

    // Premium users get priority 10
    if (data.userId && this.isPremiumUser(data.userId)) {
      priority = 10;
    }

    // Rush orders get priority 50
    // Regular orders get priority 100
    // Bulk orders get priority 150

    return priority;
  }

  /**
   * Check if user is premium (mock implementation)
   */
  private isPremiumUser(userId: string): boolean {
    // In production, check database or payment status
    return userId.includes('premium');
  }

  /**
   * Get queue position for a job
   */
  async getQueuePosition(jobId: string | number): Promise<number> {
    const waitingJobs = await this.printQueue.getWaiting();
    const position = waitingJobs.findIndex(job => job.id === jobId);
    return position === -1 ? 0 : position + 1;
  }

  /**
   * Estimate processing time for a job
   */
  async estimateProcessingTime(jobId: string | number): Promise<number> {
    const position = await this.getQueuePosition(jobId);
    // Estimate 2 minutes per job
    return position * 2 * 60 * 1000; // in milliseconds
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const waiting = await this.printQueue.getWaitingCount();
    const active = await this.printQueue.getActiveCount();
    const completed = await this.printQueue.getCompletedCount();
    const failed = await this.printQueue.getFailedCount();

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
      machineLoads: await this.getMachineLoads(),
    };
  }

  /**
   * Get load per machine
   */
  private async getMachineLoads() {
    const jobs = await this.printQueue.getWaiting();
    const loads = {};
    
    for (const machine of this.availableMachines) {
      loads[machine] = jobs.filter(job => job.data.machineId === machine).length;
    }
    
    return loads;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string | number, sessionId: string) {
    const job = await this.printQueue.getJob(jobId);
    
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    // Verify ownership
    if (job.data.sessionId !== sessionId) {
      return { success: false, error: 'Unauthorized' };
    }

    await job.remove();
    return { success: true };
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string | number) {
    const job = await this.printQueue.getJob(jobId);
    
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const position = state === 'waiting' ? await this.getQueuePosition(jobId) : 0;

    return {
      id: job.id,
      state,
      position,
      data: job.data,
      progress: job.progress(),
      createdAt: new Date(job.timestamp),
      processedAt: job.processedOn ? new Date(job.processedOn) : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
    };
  }
}