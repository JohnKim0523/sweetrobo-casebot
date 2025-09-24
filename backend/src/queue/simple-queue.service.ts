import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface PrintJobData {
  sessionId: string;
  machineId: string;
  image: string;
  imageUrl?: string;
  phoneModel: string;
  phoneModelId: string;
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

interface QueueJob {
  id: string;
  data: PrintJobData;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  attempts: number;
}

@Injectable()
export class SimpleQueueService {
  private queue: QueueJob[] = [];
  private processing = false;
  private submissionCache = new Map<string, number>();
  private readonly DUPLICATE_WINDOW_MS = 10000; // 10 seconds
  private readonly MAX_CONCURRENT = 3;
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between API calls
  private activeJobs = 0;
  private machineRoundRobin = 0;
  private availableMachines: string[];
  private lastApiCall = 0;

  constructor() {
    // Load available machines from environment or use defaults
    const machinesEnv = process.env.AVAILABLE_MACHINES;
    if (machinesEnv) {
      this.availableMachines = machinesEnv.split(',').map(m => m.trim());
      console.log(`✅ Loaded ${this.availableMachines.length} machines from environment:`, this.availableMachines);
    } else {
      // Fallback to defaults if not configured
      this.availableMachines = ['machine-1', 'machine-2', 'machine-3'];
      console.log('⚠️ Using default machine IDs. Set AVAILABLE_MACHINES in .env for production');
    }

    // Clean up old cache entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.submissionCache.entries()) {
        if (now - timestamp > this.DUPLICATE_WINDOW_MS) {
          this.submissionCache.delete(key);
        }
      }
    }, 60000);

    // Start processing queue
    this.startProcessing();
  }

  /**
   * Create a fingerprint for duplicate detection
   */
  private createFingerprint(data: Partial<PrintJobData>): string {
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
    const machine = this.availableMachines[this.machineRoundRobin % this.availableMachines.length];
    this.machineRoundRobin++;
    console.log(`🎯 Assigned to machine: ${machine}`);
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

    // Calculate priority
    const priority = data.priority || this.calculatePriority(data);

    // Create job
    const job: QueueJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data: {
        ...data as PrintJobData,
        fingerprint,
        submittedAt: new Date(),
      },
      status: 'waiting',
      priority,
      createdAt: new Date(),
      attempts: 0,
    };

    // Add to queue (sorted by priority)
    this.queue.push(job);
    this.queue.sort((a, b) => a.priority - b.priority);

    console.log(`✅ Print job queued: ${job.id} for machine: ${data.machineId}`);
    console.log(`📊 Queue size: ${this.queue.length}, Active jobs: ${this.activeJobs}`);

    return {
      success: true,
      jobId: job.id,
      machineId: data.machineId,
      position: this.getQueuePosition(job.id),
      estimatedTime: this.estimateProcessingTime(job.id),
    };
  }

  /**
   * Calculate priority for a job
   */
  private calculatePriority(data: Partial<PrintJobData>): number {
    // Lower number = higher priority
    let priority = 100;

    // Premium users get priority 10
    if (data.userId && data.userId.includes('premium')) {
      priority = 10;
    }

    return priority;
  }

  /**
   * Start processing queue
   */
  private async startProcessing() {
    setInterval(async () => {
      if (this.activeJobs >= this.MAX_CONCURRENT) {
        return;
      }

      const waitingJobs = this.queue.filter(j => j.status === 'waiting');
      if (waitingJobs.length === 0) {
        return;
      }

      const job = waitingJobs[0];
      await this.processJob(job);
    }, 2000); // Check every 2 seconds
  }

  /**
   * Process a single job
   */
  private async processJob(job: QueueJob) {
    if (this.activeJobs >= this.MAX_CONCURRENT) {
      return;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    if (timeSinceLastCall < this.RATE_LIMIT_DELAY) {
      const delay = this.RATE_LIMIT_DELAY - timeSinceLastCall;
      console.log(`⏳ Rate limiting: waiting ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.activeJobs++;
    job.status = 'processing';
    job.startedAt = new Date();
    job.attempts++;
    this.lastApiCall = Date.now();

    console.log(`🖨️ Processing job ${job.id} (attempt ${job.attempts}) for machine ${job.data.machineId}`);

    try {
      // Simulate processing (in production, this would call Chitu API)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Mark as completed
      job.status = 'completed';
      job.completedAt = new Date();
      console.log(`✅ Job ${job.id} completed successfully`);

      // Remove from queue after 5 minutes
      setTimeout(() => {
        const index = this.queue.findIndex(j => j.id === job.id);
        if (index > -1) {
          this.queue.splice(index, 1);
        }
      }, 5 * 60 * 1000);

    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error);
      
      if (job.attempts < 3) {
        // Retry
        job.status = 'waiting';
        console.log(`🔄 Retrying job ${job.id} (${job.attempts}/3)`);
      } else {
        // Mark as failed
        job.status = 'failed';
        job.error = error.message;
      }
    } finally {
      this.activeJobs--;
    }
  }

  /**
   * Get queue position for a job
   */
  getQueuePosition(jobId: string): number {
    const waitingJobs = this.queue.filter(j => j.status === 'waiting');
    const position = waitingJobs.findIndex(j => j.id === jobId);
    return position === -1 ? 0 : position + 1;
  }

  /**
   * Estimate processing time
   */
  estimateProcessingTime(jobId: string): number {
    const position = this.getQueuePosition(jobId);
    // Estimate 2 minutes per job
    return position * 2 * 60 * 1000;
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const waiting = this.queue.filter(j => j.status === 'waiting').length;
    const processing = this.queue.filter(j => j.status === 'processing').length;
    const completed = this.queue.filter(j => j.status === 'completed').length;
    const failed = this.queue.filter(j => j.status === 'failed').length;

    const machineLoads = {};
    for (const machine of this.availableMachines) {
      machineLoads[machine] = this.queue.filter(
        j => j.data.machineId === machine && j.status === 'waiting'
      ).length;
    }

    return {
      waiting,
      processing,
      completed,
      failed,
      total: this.queue.length,
      activeJobs: this.activeJobs,
      machineLoads,
    };
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string) {
    const job = this.queue.find(j => j.id === jobId);
    if (!job) return null;

    return {
      id: job.id,
      status: job.status,
      position: job.status === 'waiting' ? this.getQueuePosition(jobId) : 0,
      machineId: job.data.machineId,
      priority: job.priority,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      attempts: job.attempts,
    };
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string, sessionId: string) {
    const job = this.queue.find(j => j.id === jobId);
    
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    // Verify ownership
    if (job.data.sessionId !== sessionId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Remove from queue
    const index = this.queue.indexOf(job);
    if (index > -1) {
      this.queue.splice(index, 1);
      console.log(`🗑️ Job ${jobId} cancelled`);
      return { success: true };
    }

    return { success: false, error: 'Failed to cancel job' };
  }
}