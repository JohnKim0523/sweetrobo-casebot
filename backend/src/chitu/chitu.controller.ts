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
import { MqttService } from '../mqtt/mqtt.service';

@Controller('api/chitu')
export class ChituController {
  constructor(
    private readonly chituService: ChituService,
    private readonly s3Service: S3Service,
    private readonly queueService: SimpleQueueService,
    private readonly mqttService: MqttService,
  ) {}

  /**
   * Run complete test workflow
   */
  @Get('test')
  async runTest() {
    console.log('\n🧪 === CHITU API TEST STARTED ===\n');
    return await this.chituService.testConnection();
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
   * Get machine details (for backwards compatibility)
   */
  @Get('machines/:deviceId')
  async getMachineDetails(@Param('deviceId') deviceId: string) {
    try {
      // Try to get details using device_code if it looks like a code
      const details = deviceId.startsWith('CT')
        ? await this.chituService.getMachineDetailsByCode(deviceId)
        : await this.chituService.getMachineDetailsByDeviceId(deviceId);
      return {
        success: true,
        machine: details,
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get specific machine details by code (for QR code routing)
   */
  @Get('machine/:deviceCode')
  async getMachineByCode(@Param('deviceCode') deviceCode: string) {
    try {
      const details = await this.chituService.getMachineDetailsByCode(deviceCode);
      return {
        success: true,
        machine: details,
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Check if machine is online and ready (for upfront status check)
   * Returns online status before user starts designing
   */
  @Get('machine/:deviceCode/status')
  async getMachineStatus(@Param('deviceCode') deviceCode: string) {
    try {
      const status = await this.chituService.checkMachineStatus(deviceCode);
      return {
        success: true,
        online: status.ready,
        message: status.message,
        machine: status.details ? {
          name: status.details.device_name,
          code: status.details.device_code,
          model: status.details.machine_model,
          address: status.details.address,
        } : null,
      };
    } catch (error) {
      return {
        success: false,
        online: false,
        message: `Failed to check machine status: ${error.message}`,
        machine: null,
      };
    }
  }

  /**
   * Get product catalog (phone models) for a machine
   * Query params: type=diy|default|all, status=0|1, page=1, limit=100
   * If type is not specified or 'all', fetches from both 'default' and 'diy' and merges
   */
  @Get('products/:deviceCode')
  async getProductCatalog(
    @Param('deviceCode') deviceCode: string,
    @Query('type') type?: 'default' | 'diy' | 'all',
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const statusValue = status === '0' ? 0 : 1;
      const pageValue = parseInt(page || '1', 10);
      const limitValue = parseInt(limit || '100', 10);

      // If type is 'all' or not specified, fetch from both types and merge
      if (!type || type === 'all') {
        const [defaultCatalog, diyCatalog] = await Promise.all([
          this.chituService.getProductCatalogByCode(
            deviceCode,
            'default',
            statusValue,
            pageValue,
            limitValue,
          ),
          this.chituService.getProductCatalogByCode(
            deviceCode,
            'diy',
            statusValue,
            pageValue,
            limitValue,
          ),
        ]);

        // Merge both catalogs - combine brand lists
        const allBrands = [...(defaultCatalog.list || []), ...(diyCatalog.list || [])];

        // Remove duplicates by brand ID and merge model lists from duplicate brands
        const brandMap = new Map();
        allBrands.forEach(brand => {
          if (brandMap.has(brand.id)) {
            // Brand exists, merge model lists
            const existing = brandMap.get(brand.id);
            existing.modelList = [...existing.modelList, ...brand.modelList];
          } else {
            brandMap.set(brand.id, { ...brand });
          }
        });

        return {
          success: true,
          count: defaultCatalog.count + diyCatalog.count,
          brands: Array.from(brandMap.values()),
        };
      }

      // If specific type requested, use that
      const catalog = await this.chituService.getProductCatalogByCode(
        deviceCode,
        type,
        statusValue,
        pageValue,
        limitValue,
      );
      return {
        success: true,
        count: catalog.count,
        brands: catalog.list,
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
    productId?: string;  // NEW: Chitu product_id from phone model
    sessionId?: string;
    dimensions?: any;
    userId?: string;
    priority?: number;
  }) {
    try {
      console.log('\n🖨️ === NEW PRINT JOB REQUEST ===');
      console.log(`📱 Session: ${body.sessionId}`);
      console.log(`📱 Model: ${body.phoneModel}`);
      console.log(`📦 Product ID: ${body.productId || 'not provided'}`);
      console.log(`🎯 Machine: ${body.machineId || 'auto-assign'}`);

      // Add to queue with duplicate prevention and load balancing
      const result = await this.queueService.addPrintJob({
        sessionId: body.sessionId || `anon_${Date.now()}`,
        machineId: body.machineId,
        image: body.image,
        phoneModel: body.phoneModel || 'Default',
        phoneModelId: body.phoneModelId || 'default',
        productId: body.productId,  // NEW: Pass product_id to queue
        dimensions: body.dimensions || {
          widthPX: 711,   // Updated default to iPhone 15 Pro actual dimensions
          heightPX: 1471, // Updated default to iPhone 15 Pro actual dimensions
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
   * Get all queue jobs with images (for admin dashboard)
   */
  @Get('queue/jobs')
  async getAllJobs(@Query('limit') limit?: string) {
    const jobs = this.queueService.getAllJobs(
      limit ? parseInt(limit, 10) : 50
    );
    return {
      success: true,
      count: jobs.length,
      jobs,
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
      // TODO: Implement getOrderStatus method
      const status = { orderId, status: 'not_implemented' };
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
      // TODO: Implement getOrderList method
      const orders = { orders: [] };
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
   * Body: { machineId: "CT0700046", url: "https://yourapp.com/editor?machine=CT0700046" }
   */
  @Post('qr-code')
  async uploadQRCode(@Body() body: {
    machineId: string;
    url: string;
  }) {
    try {
      console.log('\n📱 === UPLOAD QR CODE REQUEST ===');
      console.log(`Machine: ${body.machineId}`);
      console.log(`URL: ${body.url}`);

      const result = await this.chituService.uploadQRCodeByCode(
        body.machineId,
        body.url,
      );

      console.log(`✅ QR code upload result:`, result);

      return {
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      console.error('❌ QR code upload failed:', error.message);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * TEST ENDPOINT: Simulate payment confirmation
   * Body: { machineId: "CT0700046", jobId: "job_123", amount: 25.99 }
   * This simulates what would happen when a user pays at the physical machine
   */
  @Post('test/payment')
  async simulatePayment(@Body() body: {
    machineId: string;
    jobId: string;
    amount?: number;
  }) {
    try {
      console.log('\n🧪 === TEST PAYMENT SIMULATION ===');
      console.log(`Machine: ${body.machineId}`);
      console.log(`Job ID: ${body.jobId}`);
      console.log(`Amount: $${body.amount || 25.99}`);

      this.mqttService.simulatePaymentConfirmation(
        body.machineId,
        body.jobId,
        body.amount || 25.99,
      );

      return {
        success: true,
        message: 'Payment simulation triggered. Check frontend for page transition.',
        machineId: body.machineId,
        jobId: body.jobId,
      };
    } catch (error) {
      console.error('❌ Payment simulation failed:', error.message);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}