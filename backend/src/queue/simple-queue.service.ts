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
  private readonly MAX_CONCURRENT = 20;
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between API calls
  private activeJobs = 0;
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
   * Start processing queue with self-healing
   */
  private async startProcessing() {
    this.processorAlive = true;

    // Main processing loop
    setInterval(() => {
      this.lastProcessorTick = Date.now();

      try {
        if (this.activeJobs >= this.MAX_CONCURRENT) {
          return;
        }

        const waitingJobs = this.queue.filter((j) => j.status === 'waiting');
        if (waitingJobs.length === 0) {
          return;
        }

        const job = waitingJobs[0];
        // Fire and forget — don't await in setInterval
        this.processJob(job).catch((err) => {
          console.error(`❌ Queue processor error (job ${job.id}):`, err?.message || err);
        });
      } catch (err) {
        console.error('❌ Queue processor tick error:', err?.message || err);
      }
    }, 2000);

    // Self-healing: detect and recover stuck jobs every 60 seconds
    setInterval(() => {
      try {
        this.healStuckJobs();
      } catch (err) {
        console.error('❌ Self-heal error:', err?.message || err);
      }
    }, 60000);

    // Health logging every 5 minutes
    setInterval(() => {
      const waiting = this.queue.filter((j) => j.status === 'waiting').length;
      const processing = this.queue.filter((j) => j.status === 'processing').length;
      const completed = this.queue.filter((j) => j.status === 'completed').length;
      const failed = this.queue.filter((j) => j.status === 'failed').length;
      if (waiting > 0 || processing > 0) {
        console.log(`📊 Queue health: ${waiting} waiting, ${processing} processing, ${completed} completed, ${failed} failed | activeJobs: ${this.activeJobs} | total: ${this.queue.length}`);
      }
    }, 5 * 60 * 1000);

    console.log('✅ Queue processor started with self-healing');
  }

  /**
   * Detect and recover stuck jobs
   */
  private healStuckJobs() {
    const now = Date.now();
    const STUCK_TIMEOUT = 3 * 60 * 1000; // 3 minutes — no single job should take this long
    let healed = 0;

    for (const job of this.queue) {
      if (job.status === 'processing' && job.startedAt) {
        const elapsed = now - job.startedAt.getTime();
        if (elapsed > STUCK_TIMEOUT) {
          console.log(`🔧 Healing stuck job ${job.id} (stuck for ${Math.round(elapsed / 1000)}s)`);
          job.status = job.attempts >= 3 ? 'failed' : 'waiting';
          job.error = 'Job timed out and was auto-recovered';
          healed++;
        }
      }
    }

    // Fix activeJobs counter if it's out of sync
    const actualProcessing = this.queue.filter((j) => j.status === 'processing').length;
    if (this.activeJobs !== actualProcessing) {
      console.log(`🔧 Fixing activeJobs counter: was ${this.activeJobs}, actual processing: ${actualProcessing}`);
      this.activeJobs = actualProcessing;
    }

    if (healed > 0) {
      console.log(`🔧 Self-healed ${healed} stuck job(s)`);
    }
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

    try {
      // Upload image to S3 (PNG with 300 DPI for Chitu printer)
      let imageUrl = job.data.imageUrl;
      if (!imageUrl && job.data.image) {
        console.log(`📤 Uploading image to S3...`);

        const buffer = Buffer.from(
          job.data.image.replace(/^data:image\/\w+;base64,/, ''),
          'base64',
        );

        const key = `designs/${job.data.sessionId}/${Date.now()}.png`;
        imageUrl = await this.s3Service.uploadImage(buffer, key, true); // Convert for print (PNG 300 DPI)
        job.data.imageUrl = imageUrl;

        console.log(`✅ Image uploaded as PNG (300 DPI): ${imageUrl}`);

        // Free base64 image data from memory — it's now in S3
        job.data.image = '';
      }

      // Create Chitu order with validated workflow
      // This workflow will:
      // 1. Check machine status
      // 2. Get product list from machine
      // 3. Verify inventory
      // 4. Create order with correct product_id
      if (job.data.machineId && job.data.phoneModel && imageUrl) {
        console.log(`📦 Creating Chitu order...`);
        console.log(
          `🔑 Product ID from frontend: ${job.data.productId || 'not provided'}`,
        );
        const orderResult =
          await this.chituService.createPrintOrderWithValidation({
            deviceCode: job.data.machineId,
            phoneModelName: job.data.phoneModel,
            productId: job.data.productId, // Pass product_id directly (skips name matching)
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
          // This allows MQTT status updates to be routed to the correct frontend client
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

      // Mark as completed
      job.status = 'completed';
      job.completedAt = new Date();
      console.log(`✅ Job ${job.id} completed successfully`);

      // Keep jobs in memory for S3 section display (don't auto-delete)
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
