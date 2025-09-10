import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { ChituService } from '../chitu/chitu.service';
import { S3Service } from '../s3/s3.service';
import { PrintJobData } from './queue.service';

@Processor('print-jobs')
@Injectable()
export class PrintProcessor {
  private readonly MAX_CONCURRENT = 3; // Process max 3 jobs simultaneously
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between API calls
  private lastApiCall = 0;

  constructor(
    private readonly chituService: ChituService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Process print jobs with rate limiting
   */
  @Process({ name: 'print', concurrency: 3 })
  async handlePrint(job: Job<PrintJobData>) {
    console.log(`🖨️ Processing print job ${job.id} for machine ${job.data.machineId}`);
    
    try {
      // Update progress
      await job.progress(10);

      // Rate limiting
      await this.enforceRateLimit();

      // Upload image to S3 if needed
      let imageUrl = job.data.imageUrl;
      if (!imageUrl && job.data.image) {
        await job.progress(20);
        console.log(`📤 Uploading image to S3...`);
        
        const buffer = Buffer.from(
          job.data.image.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );
        
        const key = `designs/${job.data.sessionId}/${Date.now()}.png`;
        imageUrl = await this.s3Service.uploadImage(buffer, key);
        
        await job.progress(40);
        console.log(`✅ Image uploaded: ${imageUrl}`);
      }

      // Submit to Chitu API with retry logic
      await job.progress(50);
      const result = await this.submitToChitu(job.data, imageUrl || '');
      
      await job.progress(90);

      // Store result for tracking
      const completedJob = {
        ...job.data,
        imageUrl,
        chituTaskId: result.taskId,
        completedAt: new Date(),
      };

      await job.progress(100);
      
      return completedJob;
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Enforce rate limiting between API calls
   */
  private async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    
    if (timeSinceLastCall < this.RATE_LIMIT_DELAY) {
      const delay = this.RATE_LIMIT_DELAY - timeSinceLastCall;
      console.log(`⏳ Rate limiting: waiting ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastApiCall = Date.now();
  }

  /**
   * Submit print job to Chitu
   */
  private async submitToChitu(data: PrintJobData, imageUrl: string) {
    try {
      // When we have valid Chitu credentials, this will call the actual API
      // For now, mock the response
      console.log(`📨 Submitting to Chitu API for machine: ${data.machineId}`);
      
      // Simulated API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // In production:
      // const result = await this.chituService.createPrintTask({
      //   device_id: data.machineId,
      //   image_url: imageUrl,
      //   task_name: `${data.phoneModel}_${data.sessionId}`,
      //   slice_param: this.getSliceParams(data.dimensions),
      // });
      
      return {
        success: true,
        taskId: `task_${Date.now()}`,
        machineId: data.machineId,
      };
    } catch (error) {
      console.error('Chitu API error:', error);
      throw error;
    }
  }

  /**
   * Get slice parameters based on phone dimensions
   */
  private getSliceParams(dimensions: any) {
    return {
      layer_thickness: 0.05,
      exposure_time: 2.5,
      bottom_exposure_time: 30,
      bottom_layers: 6,
      width_mm: dimensions.widthMM,
      height_mm: dimensions.heightMM,
    };
  }

  /**
   * Job started handler
   */
  @OnQueueActive()
  onActive(job: Job) {
    console.log(`🚀 Job ${job.id} started processing`);
  }

  /**
   * Job completed handler
   */
  @OnQueueCompleted()
  onComplete(job: Job, result: any) {
    console.log(`✅ Job ${job.id} completed successfully`);
    console.log('Result:', result);
    
    // Emit WebSocket event for real-time updates
    // this.websocketGateway.emitJobComplete(job.id, result);
  }

  /**
   * Job failed handler
   */
  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    console.error(`❌ Job ${job.id} failed:`, error.message);
    
    // Emit WebSocket event for real-time updates
    // this.websocketGateway.emitJobFailed(job.id, error.message);
  }
}