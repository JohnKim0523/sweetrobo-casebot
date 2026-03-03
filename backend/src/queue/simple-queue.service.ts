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
      `📊 Queue size: ${this.queue.length}, Active jobs: ${this.activeJobs}`,
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
   * Start processing queue
   */
  private async startProcessing() {
    setInterval(async () => {
      // Self-heal: reset jobs stuck in 'processing' for over 2 minutes
      const staleThreshold = Date.now() - 2 * 60 * 1000;
      const stuckJobs = this.queue.filter(
        (j) =>
          j.status === 'processing' &&
          j.startedAt &&
          j.startedAt.getTime() < staleThreshold,
      );
      for (const stuck of stuckJobs) {
        console.log(
          `⚠️ Resetting stale job ${stuck.id} (stuck in processing for >2min)`,
        );
        stuck.status = 'failed';
        stuck.error = 'Timed out - stuck in processing';
        this.activeJobs = Math.max(0, this.activeJobs - 1);
      }

      // Safety: ensure activeJobs counter never goes below 0 or above reality
      const actualProcessing = this.queue.filter(
        (j) => j.status === 'processing',
      ).length;
      if (this.activeJobs !== actualProcessing) {
        console.log(
          `🔧 Correcting activeJobs counter: ${this.activeJobs} -> ${actualProcessing}`,
        );
        this.activeJobs = actualProcessing;
      }

      if (this.activeJobs >= this.MAX_CONCURRENT) {
        return;
      }

      const waitingJobs = this.queue.filter((j) => j.status === 'waiting');
      if (waitingJobs.length === 0) {
        return;
      }

      const job = waitingJobs[0];
      await this.processJob(job);
    }, 2000); // Check every 2 seconds
  }

  private readonly JOB_TIMEOUT_MS = 90000; // 90 second timeout per job

  /**
   * Process a single job (with timeout protection)
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
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.activeJobs++;
    job.status = 'processing';
    job.startedAt = new Date();
    job.attempts++;
    this.lastApiCall = Date.now();

    console.log(
      `🖨️ Processing job ${job.id} (attempt ${job.attempts}) for machine ${job.data.machineId}`,
    );
    console.log(
      `📊 Active jobs: ${this.activeJobs}/${this.MAX_CONCURRENT}, Queue waiting: ${this.queue.filter((j) => j.status === 'waiting').length}`,
    );

    try {
      // Wrap entire processing in a timeout to prevent hanging forever
      await Promise.race([
        this.executeJob(job),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Job processing timed out after 90s')),
            this.JOB_TIMEOUT_MS,
          ),
        ),
      ]);

      // Mark as completed
      job.status = 'completed';
      job.completedAt = new Date();
      console.log(`✅ Job ${job.id} completed successfully`);
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error.message || error);

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
      console.log(`📊 Active jobs after completion: ${this.activeJobs}`);
    }
  }

  /**
   * Execute the actual job work (S3 upload + Chitu order creation)
   */
  private async executeJob(job: QueueJob): Promise<void> {
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

        // Register mapping between our jobId and Chitu's orderId
        if (orderResult.orderId) {
          this.orderMappingService.registerMapping(
            job.id,
            orderResult.orderId,
            job.data.machineId,
          );
          console.log(
            `🗺️ Registered order mapping: ${job.id} <-> ${orderResult.orderId}`,
          );

          // Emit order status so frontend receives chituOrderId immediately
          // (Mini casebots need this to display the pickup code)
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
      activeJobs: this.activeJobs,
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
