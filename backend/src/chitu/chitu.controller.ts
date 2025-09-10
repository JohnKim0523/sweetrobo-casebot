import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ChituService } from './chitu.service';
import { S3Service } from '../s3/s3.service';
import { SimpleQueueService } from '../queue/simple-queue.service';

@Controller('api/chitu')
export class ChituController {
  constructor(
    private readonly chituService: ChituService,
    private readonly s3Service: S3Service,
    private readonly queueService: SimpleQueueService,
  ) {}

  /**
   * Run complete test workflow
   */
  @Get('test')
  async runTest() {
    console.log('\n🧪 === CHITU API TEST STARTED ===\n');
    return await this.chituService.testWorkflow();
  }

  /**
   * Get all machines
   */
  @Get('machines')
  async getMachines() {
    try {
      const machines = await this.chituService.getMachineList();
      return {
        success: true,
        count: machines?.machines?.length || 0,
        machines: machines?.machines || [],
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get machine details
   */
  @Get('machines/:deviceId')
  async getMachineDetails(@Param('deviceId') deviceId: string) {
    try {
      const details = await this.chituService.getMachineDetails(deviceId);
      return {
        success: true,
        machine: details,
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Submit design to print (replacement for old flow)
   */
  @Post('print')
  async submitPrint(@Body() body: {
    image: string;
    machineId?: string;
    phoneModel?: string;
    phoneModelId?: string;
    sessionId?: string;
    dimensions?: any;
    userId?: string;
    priority?: number;
  }) {
    try {
      console.log('\n🖨️ === NEW PRINT JOB REQUEST ===');
      console.log(`📱 Session: ${body.sessionId}`);
      console.log(`📱 Model: ${body.phoneModel}`);
      console.log(`🎯 Machine: ${body.machineId || 'auto-assign'}`);

      // Add to queue with duplicate prevention and load balancing
      const result = await this.queueService.addPrintJob({
        sessionId: body.sessionId || `anon_${Date.now()}`,
        machineId: body.machineId,
        image: body.image,
        phoneModel: body.phoneModel || 'Default',
        phoneModelId: body.phoneModelId || 'default',
        dimensions: body.dimensions || {
          widthPX: 834,
          heightPX: 1731,
          widthMM: 70.6,
          heightMM: 146.6,
        },
        userId: body.userId,
        priority: body.priority,
        submittedAt: new Date(),
      });

      if (!result.success) {
        console.log(`⚠️ Job rejected: ${result.error}`);
        return {
          success: false,
          error: result.error,
          message: result.error,
        };
      }

      console.log(`✅ Job queued: ${result.jobId}`);
      console.log(`📊 Queue position: ${result.position}`);
      console.log(`⏱️ Estimated time: ${(result.estimatedTime || 0) / 1000}s`);

      return {
        success: true,
        jobId: result.jobId,
        queuePosition: result.position,
        estimatedTime: Math.ceil((result.estimatedTime || 0) / 1000), // Convert to seconds
        machineId: result.machineId,
        message: 'Your design has been queued for printing!',
      };

    } catch (error) {
      console.error('❌ Print submission failed:', error.message);
      throw new HttpException(
        error.message || 'Failed to submit print job',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get queue status
   */
  @Get('queue/stats')
  async getQueueStats() {
    const stats = this.queueService.getQueueStats();
    return {
      success: true,
      stats,
    };
  }

  /**
   * Get job status
   */
  @Get('queue/job/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = this.queueService.getJobStatus(jobId);
    if (!status) {
      throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
    }
    return {
      success: true,
      job: status,
    };
  }

  /**
   * Cancel a job
   */
  @Post('queue/cancel/:jobId')
  async cancelJob(
    @Param('jobId') jobId: string,
    @Body('sessionId') sessionId: string,
  ) {
    const result = await this.queueService.cancelJob(jobId, sessionId);
    if (!result.success) {
      throw new HttpException(result.error || 'Unknown error', HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * Get order status
   */
  @Get('orders/:orderId')
  async getOrderStatus(@Param('orderId') orderId: string) {
    try {
      const status = await this.chituService.getOrderStatus(orderId);
      return {
        success: true,
        order: status,
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get all orders
   */
  @Get('orders')
  async getOrders() {
    try {
      const orders = await this.chituService.getOrderList();
      return {
        success: true,
        count: orders?.orders?.length || 0,
        orders: orders?.orders || [],
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Upload QR code to machine
   */
  @Post('qr-code')
  async uploadQRCode(@Body() body: {
    machineId: string;
    url: string;
  }) {
    try {
      const result = await this.chituService.uploadQRCode(
        body.machineId,
        body.url,
      );
      return {
        success: true,
        message: 'QR code uploaded successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}