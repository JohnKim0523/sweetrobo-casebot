import { Injectable, Inject, forwardRef } from '@nestjs/common';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { S3Service } from '../s3/s3.service';
import { ChituService } from '../chitu/chitu.service';
import { OrderMappingService } from '../order-mapping/order-mapping.service';

export interface PrintJobData {
  sessionId: string;
  machineId: string;
  image: string;
  imageUrl?: string;
  phoneModel: string;
  phoneModelId: string;
  productId?: string; // NEW: Chitu product_id for this phone model
  chituOrderId?: string; // Chitu order ID after order creation
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
  _processingToken?: string; // Unique token per processJob invocation — prevents healed jobs from interfering
}

@Injectable()
export class SimpleQueueService {
  private queue: QueueJob[] = [];
  private processing = false;
  private submissionCache = new Map<string, number>();
  private readonly DUPLICATE_WINDOW_MS = 10000; // 10 seconds
  private readonly MAX_CONCURRENT = 20;
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between API calls
  private readonly JOB_TIMEOUT = 2 * 60 * 1000; // 2 minutes — hard timeout per job
  private machineRoundRobin = 0;
  private availableMachines: string[];
  private lastApiCall = 0;
  private processorAlive = false;
  private lastProcessorTick = 0;

  constructor(
    @Inject(forwardRef(() => S3Service))
    private readonly s3Service: S3Service,
    @Inject(forwardRef(() => ChituService))
    private readonly chituService: ChituService,
    private readonly orderMappingService: OrderMappingService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    // Load available machines from environment or use defaults
    const machinesEnv = process.env.AVAILABLE_MACHINES;
    if (machinesEnv) {
      this.availableMachines = machinesEnv.split(',').map((m) => m.trim());
      console.log(
        `✅ Loaded ${this.availableMachines.length} machines from environment:`,
        this.availableMachines,
      );
    } else {
      // Fallback to defaults if not configured
      this.availableMachines = ['machine-1', 'machine-2', 'machine-3'];
      console.log(
        '⚠️ Using default machine IDs. Set AVAILABLE_MACHINES in .env for production',
      );
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

    // Schedule old job cleanup every 6 hours
    setInterval(
      () => {
        this.cleanupOldJobs();
      },
      6 * 60 * 60 * 1000,
    );
    console.log('🗑️ Job cleanup scheduled: every 6 hours (7-day retention)');

    // Start processing queue
    this.startProcessing();
  }

  /**
   * Derived active job count — always accurate, can never desync
   */
  private get activeJobCount(): number {
    return this.queue.filter((j) => j.status === 'processing').length;
  }

  /**
   * Create a fingerprint for duplicate detection
   */
  private createFingerprint(data: Partial<PrintJobData>): string {
    const timeWindow = Math.floor(Date.now() / this.DUPLICATE_WINDOW_MS);
    const fingerprint = crypto
      .createHash('md5')
      .update(
        `${data.sessionId}-${data.image?.substring(0, 100)}-${timeWindow}`,
      )
      .digest('hex');
    return fingerprint;
  }

  /**
   * Check if this is a duplicate submission
   */
  private isDuplicate(fingerprint: string): boolean {
    const now = Date.now();
    const lastSubmission = this.submissionCache.get(fingerprint);

    if (lastSubmission && now - lastSubmission < this.DUPLICATE_WINDOW_MS) {
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
    const machine =
      this.availableMachines[
        this.machineRoundRobin % this.availableMachines.length
      ];
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
        error:
          'Duplicate submission detected. Please wait before submitting again.',
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
        ...(data as PrintJobData),
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

    console.log(
      `✅ Print job queued: ${job.id} for machine: ${data.machineId}`,
    );
    console.log(
      `📊 Queue size: ${this.queue.length}, Active jobs: ${this.activeJobCount}`,
    );

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
   * Start processing queue with self-healing
   */
  private async startProcessing() {
    this.processorAlive = true;

    // Main processing loop — picks up ONE waiting job per tick
    setInterval(() => {
      this.lastProcessorTick = Date.now();

      try {
        const activeCount = this.activeJobCount;
        if (activeCount >= this.MAX_CONCURRENT) {
          return;
        }

        const waitingJobs = this.queue.filter((j) => j.status === 'waiting');
        if (waitingJobs.length === 0) {
          return;
        }

        const job = waitingJobs[0];
        console.log(`⏰ Queue tick: picking up ${job.id} (${waitingJobs.length} waiting, ${activeCount} active)`);
        // Fire and forget — don't await in setInterval
        // processJob marks job as 'processing' synchronously before any await
        this.processJob(job).catch((err) => {
          console.error(`❌ Queue processor error (job ${job.id}):`, err?.message || err);
        });
      } catch (err) {
        console.error('❌ Queue processor tick error:', err?.message || err);
      }
    }, 2000);

    // Self-healing: detect and recover stuck jobs every 30 seconds
    setInterval(() => {
      try {
        this.healStuckJobs();
      } catch (err) {
        console.error('❌ Self-heal error:', err?.message || err);
      }
    }, 30000);

    // Health logging every 2 minutes
    setInterval(() => {
      const waiting = this.queue.filter((j) => j.status === 'waiting').length;
      const processing = this.queue.filter((j) => j.status === 'processing').length;
      const completed = this.queue.filter((j) => j.status === 'completed').length;
      const failed = this.queue.filter((j) => j.status === 'failed').length;
      console.log(`📊 Queue health: ${waiting} waiting, ${processing} processing, ${completed} completed, ${failed} failed | total: ${this.queue.length}`);
    }, 2 * 60 * 1000);

    console.log('✅ Queue processor started with self-healing');
  }

  /**
   * Detect and recover stuck jobs
   */
  private healStuckJobs() {
    const now = Date.now();
    const STUCK_TIMEOUT = this.JOB_TIMEOUT + 30000; // Job timeout + 30s grace period
    let healed = 0;

    for (const job of this.queue) {
      if (job.status === 'processing' && job.startedAt) {
        const elapsed = now - job.startedAt.getTime();
        if (elapsed > STUCK_TIMEOUT) {
          console.log(`🔧 Healing stuck job ${job.id} (stuck for ${Math.round(elapsed / 1000)}s)`);
          // Invalidate the old processJob's token so its finally/catch won't interfere
          job._processingToken = undefined;
          job.status = job.attempts >= 3 ? 'failed' : 'waiting';
          job.error = 'Job timed out and was auto-recovered';
          healed++;
        }
      }
    }

    if (healed > 0) {
      console.log(`🔧 Self-healed ${healed} stuck job(s)`);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: QueueJob) {
    // Guard: skip if already picked up by another tick or at capacity
    if (job.status !== 'waiting') {
      return;
    }
    if (this.activeJobCount >= this.MAX_CONCURRENT) {
      return;
    }

    // CRITICAL: Claim job synchronously before any await
    // This prevents the next setInterval tick from picking up the same job
    const processingToken = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    job._processingToken = processingToken;
    job.status = 'processing';
    job.startedAt = new Date();
    job.attempts++;

    console.log(
      `🔄 Job ${job.id} claimed (${this.activeJobCount} active, attempt ${job.attempts})`,
    );

    // Rate limiting (safe to await now — job is already marked as 'processing')
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    if (timeSinceLastCall < this.RATE_LIMIT_DELAY) {
      const delay = this.RATE_LIMIT_DELAY - timeSinceLastCall;
      console.log(`⏳ Rate limiting: waiting ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.lastApiCall = Date.now();

    // Check if job was reclaimed by healer during rate limit wait
    if (job._processingToken !== processingToken) {
      console.log(`⚠️ Job ${job.id} was reclaimed during rate limit, aborting`);
      return;
    }

    console.log(
      `🖨️ Processing job ${job.id} (attempt ${job.attempts}) for machine ${job.data.machineId}`,
    );

    try {
      // Wrap all work in a hard timeout — prevents hanging S3/Chitu calls from blocking forever
      await Promise.race([
        this.executeJobWork(job, processingToken),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Job timed out after ${this.JOB_TIMEOUT / 1000}s`)), this.JOB_TIMEOUT),
        ),
      ]);

      // Verify we still own the job before marking complete
      if (job._processingToken !== processingToken) {
        console.log(`⚠️ Job ${job.id} ownership changed, skipping completion`);
        return;
      }

      job.status = 'completed';
      job.completedAt = new Date();
      console.log(`✅ Job ${job.id} completed successfully`);
    } catch (error) {
      // Only handle error if we still own the job
      if (job._processingToken !== processingToken) {
        console.log(`⚠️ Job ${job.id} ownership changed, ignoring error: ${error?.message}`);
        return;
      }

      console.error(`❌ Job ${job.id} failed:`, error?.message || error);

      if (job.attempts < 3) {
        job.status = 'waiting';
        job._processingToken = undefined;
        console.log(`🔄 Retrying job ${job.id} (${job.attempts}/3)`);
      } else {
        job.status = 'failed';
        job.error = error?.message || 'Unknown error';
        console.log(`💀 Job ${job.id} permanently failed after ${job.attempts} attempts`);
      }
    }
    // No finally { activeJobs-- } needed — activeJobCount is derived from job status
  }

  /**
   * Execute the actual job work (S3 upload + Chitu order creation)
   * Separated from processJob so Promise.race can enforce a hard timeout
   */
  private async executeJobWork(job: QueueJob, processingToken: string) {
    // Upload image to S3 (PNG with 300 DPI for Chitu printer)
    let imageUrl = job.data.imageUrl;
    if (!imageUrl && job.data.image) {
      console.log(`📤 Uploading image to S3...`);

      const buffer = Buffer.from(
        job.data.image.replace(/^data:image\/\w+;base64,/, ''),
        'base64',
      );

      const key = `designs/${job.data.sessionId}/${Date.now()}.png`;
      imageUrl = await this.s3Service.uploadImage(buffer, key, true);
      job.data.imageUrl = imageUrl;

      console.log(`✅ Image uploaded as PNG (300 DPI): ${imageUrl}`);

      // Free base64 image data from memory — it's now in S3
      job.data.image = '';
    }

    // Check if job was reclaimed by healer during S3 upload
    if (job._processingToken !== processingToken) {
      throw new Error('Job ownership changed during processing');
    }

    // Create Chitu order with validated workflow
    if (job.data.machineId && job.data.phoneModel && imageUrl) {
      console.log(`📦 Creating Chitu order...`);
      console.log(
        `🔑 Product ID from frontend: ${job.data.productId || 'not provided'}`,
      );
      const orderResult =
        await this.chituService.createPrintOrderWithValidation({
          deviceCode: job.data.machineId,
          phoneModelName: job.data.phoneModel,
          productId: job.data.productId,
          imageUrl: imageUrl,
          orderNo: job.id,
          printCount: 1,
          sessionId: job.data.sessionId,
        });

      if (orderResult.success) {
        console.log(`✅ Chitu order created: ${orderResult.orderId}`);
        console.log(
          `📦 Product used: ${orderResult.details?.product?.name_en}`,
        );
        console.log(
          `🔑 Product ID: ${orderResult.details?.product?.product_id}`,
        );
        job.data.chituOrderId = orderResult.orderId;

        if (orderResult.orderId) {
          this.orderMappingService.registerMapping(
            job.id,
            orderResult.orderId,
            job.data.machineId,
          );
          console.log(
            `🗺️ Registered order mapping: ${job.id} <-> ${orderResult.orderId}`,
          );

          this.eventEmitter.emit('order.status', {
            orderId: orderResult.orderId,
            orderNo: job.id,
            jobId: job.id,
            chituOrderId: orderResult.orderId,
            machineId: job.data.machineId,
            status: 'order_created',
            timestamp: new Date(),
          });
          console.log(
            `📡 Emitted order.status for pickup code: ${orderResult.orderId}`,
          );
        }
      } else {
        throw new Error(
          `Chitu order creation failed: ${orderResult.message}`,
        );
      }
    } else {
      console.log(`⚠️ Skipping Chitu order creation - missing required data`);
      console.log(`   machineId: ${job.data.machineId ? '✅' : '❌'}`);
      console.log(`   phoneModel: ${job.data.phoneModel ? '✅' : '❌'}`);
      console.log(`   imageUrl: ${imageUrl ? '✅' : '❌'}`);
    }
  }

  /**
   * Get queue position for a job
   */
  getQueuePosition(jobId: string): number {
    const waitingJobs = this.queue.filter((j) => j.status === 'waiting');
    const position = waitingJobs.findIndex((j) => j.id === jobId);
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
    const waiting = this.queue.filter((j) => j.status === 'waiting').length;
    const processing = this.queue.filter(
      (j) => j.status === 'processing',
    ).length;
    const completed = this.queue.filter((j) => j.status === 'completed').length;
    const failed = this.queue.filter((j) => j.status === 'failed').length;

    const machineLoads = {};
    for (const machine of this.availableMachines) {
      machineLoads[machine] = this.queue.filter(
        (j) => j.data.machineId === machine && j.status === 'waiting',
      ).length;
    }

    return {
      waiting,
      processing,
      completed,
      failed,
      total: this.queue.length,
      activeJobs: this.activeJobCount,
      machineLoads,
    };
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string) {
    const job = this.queue.find((j) => j.id === jobId);
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
    const job = this.queue.find((j) => j.id === jobId);

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

  /**
   * Get all jobs with image data (for admin dashboard)
   * Returns most recent jobs first, with image previews
   */
  getAllJobs(limit: number = 50) {
    // Sort by creation date, most recent first
    const sortedJobs = [...this.queue].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    // Limit results
    const limitedJobs = sortedJobs.slice(0, limit);

    // Map to admin-friendly format
    return limitedJobs.map((job) => ({
      id: job.id,
      status: job.status,
      phoneModel: job.data.phoneModel,
      phoneModelId: job.data.phoneModelId,
      productId: job.data.productId,
      machineId: job.data.machineId,
      sessionId: job.data.sessionId,
      dimensions: job.data.dimensions,
      image: job.data.image, // Base64 masked image (what goes to printer)
      imageUrl: job.data.imageUrl, // S3 URL if uploaded
      priority: job.priority,
      queuePosition:
        job.status === 'waiting' ? this.getQueuePosition(job.id) : 0,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      attempts: job.attempts,
    }));
  }

  /**
   * Remove completed/failed jobs older than 7 days to prevent unbounded memory growth
   */
  cleanupOldJobs(): void {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    const before = this.queue.length;

    this.queue = this.queue.filter((job) => {
      if (job.status === 'completed' && job.completedAt) {
        return job.completedAt.getTime() > cutoff;
      }
      if (job.status === 'failed') {
        const refTime = job.completedAt || job.createdAt;
        return refTime.getTime() > cutoff;
      }
      return true; // Keep waiting/processing jobs
    });

    const removed = before - this.queue.length;
    if (removed > 0) {
      console.log(`🗑️ Job cleanup: removed ${removed} old completed/failed job(s). Queue size: ${this.queue.length}`);
    }
  }

  getCompletedJobs(limit: number = 100) {
    // Filter only completed jobs
    const completedJobs = this.queue.filter(
      (job) => job.status === 'completed',
    );

    // Sort by completion date, most recent first
    const sortedJobs = completedJobs.sort((a, b) => {
      const aTime = a.completedAt?.getTime() || 0;
      const bTime = b.completedAt?.getTime() || 0;
      return bTime - aTime;
    });

    // Limit results
    const limitedJobs = sortedJobs.slice(0, limit);

    // Map to same format as getAllJobs
    return limitedJobs.map((job) => ({
      id: job.id,
      status: job.status,
      phoneModel: job.data.phoneModel,
      phoneModelId: job.data.phoneModelId,
      productId: job.data.productId,
      machineId: job.data.machineId,
      sessionId: job.data.sessionId,
      dimensions: job.data.dimensions,
      image: job.data.image, // Base64 PNG image for display
      imageUrl: job.data.imageUrl, // S3 PNG URL for deletion
      priority: job.priority,
      queuePosition: 0, // Completed jobs have no queue position
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      attempts: job.attempts,
    }));
  }
}
