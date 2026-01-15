import {
  Controller,
  Get,
  Delete,
  Body,
  HttpException,
  HttpStatus,
  UseGuards,
  Query,
  Param,
  Res,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { S3Service } from '../s3/s3.service';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { SimpleQueueService } from '../queue/simple-queue.service';
import { aiUsageService } from '../services/ai-usage.service';

@Controller('api/admin')
@UseGuards(AdminAuthGuard) // Protect all admin endpoints
export class AdminController {
  private s3Client: S3Client;

  constructor(
    private readonly s3Service: S3Service,
    private readonly queueService: SimpleQueueService,
  ) {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  @Get('s3-images')
  async listS3Images(@Query('limit') limit?: string) {
    try {
      // Simply return all jobs that have uploaded to S3 (have imageUrl)
      const maxLimit = limit ? parseInt(limit) : 200;
      const allJobs = await this.queueService.getAllJobs(maxLimit);

      // Filter to only jobs that have been uploaded to S3
      const s3Jobs = allJobs.filter((job) => job.imageUrl);

      return {
        success: true,
        images: s3Jobs, // These already have the base64 image thumbnails
        count: s3Jobs.length,
      };
    } catch (error: any) {
      console.error('Error listing S3 images:', error);
      throw new HttpException(
        error.message || 'Failed to list S3 images',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('s3-download')
  async downloadS3Image(@Query('url') imageUrl: string, @Res() res: Response) {
    try {
      if (!imageUrl) {
        throw new HttpException('No URL provided', HttpStatus.BAD_REQUEST);
      }

      // Extract key from URL
      let key = imageUrl;
      if (key.startsWith('http')) {
        const url = new URL(key);
        const pathname = url.pathname;
        const parts = pathname.split('/');
        const designsIndex = parts.indexOf('designs');
        if (designsIndex !== -1) {
          key = parts.slice(designsIndex).join('/');
        } else {
          key = pathname.substring(1);
        }
      }

      console.log('⬇️ Downloading from S3:', key);

      const bucketName =
        process.env.AWS_S3_BUCKET || 'sweetrobo-phonecase-designs';
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const s3Response = await this.s3Client.send(getCommand);

      // Stream the TIF file to the response
      res.set({
        'Content-Type': 'image/tiff',
        'Content-Disposition': `attachment; filename="${key.split('/').pop()}"`,
      });

      // @ts-ignore
      s3Response.Body.pipe(res);
    } catch (error: any) {
      console.error('❌ Error downloading from S3:', error);
      throw new HttpException(
        error.message || 'Failed to download image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('s3-images')
  async deleteS3Image(@Body() body: { key: string }) {
    try {
      let { key } = body;

      if (!key) {
        throw new HttpException('No key provided', HttpStatus.BAD_REQUEST);
      }

      // If key is a full URL, extract just the key part
      if (key.startsWith('http')) {
        try {
          const url = new URL(key);
          // Extract key from URL path (remove leading slash and bucket name if present)
          const pathname = url.pathname;
          // Format is usually: /sweetrobo-phonecase-designs/designs/sessionId/timestamp.tif
          // or just: /designs/sessionId/timestamp.tif
          const parts = pathname.split('/');
          // Find 'designs' and take everything from there
          const designsIndex = parts.indexOf('designs');
          if (designsIndex !== -1) {
            key = parts.slice(designsIndex).join('/');
          } else {
            key = pathname.substring(1); // Just remove leading slash
          }
        } catch (e) {
          console.error('Failed to parse URL:', e);
        }
      }

      console.log('🗑️ Deleting S3 file:', key);

      const bucketName =
        process.env.AWS_S3_BUCKET || 'sweetrobo-phonecase-designs';

      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      console.log('✅ Deleted from S3:', key);

      return {
        success: true,
        message: `Deleted ${key}`,
      };
    } catch (error: any) {
      console.error('❌ Error deleting S3 object:', error);
      console.error('Key that failed:', body.key);
      throw new HttpException(
        error.message || 'Failed to delete S3 image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get AI usage statistics
   * GET /api/admin/ai-usage
   * Optional query params: machineId (filter by machine)
   */
  @Get('ai-usage')
  async getAIUsage(@Query('machineId') machineId?: string) {
    try {
      console.log(
        '📊 AI Usage stats requested',
        machineId ? `for machine: ${machineId}` : '(all machines)',
      );

      if (machineId) {
        // Get stats for specific machine
        const stats = await aiUsageService.getMachineStats(machineId);

        if (!stats) {
          return {
            success: true,
            machineId,
            message: 'No AI usage data found for this machine',
            stats: {
              total: { edits: 0, generations: 0, cost: 0 },
              daily: {},
              weekly: {},
              monthly: {},
            },
          };
        }

        return {
          success: true,
          machineId,
          stats,
        };
      } else {
        // Get stats for all machines
        const summary = await aiUsageService.getAllStats();

        return {
          success: true,
          summary: {
            totalEdits: summary.totalEdits,
            totalGenerations: summary.totalGenerations,
            totalCost: summary.totalCost,
            formattedCost: `$${summary.totalCost.toFixed(2)}`,
          },
          machines: summary.machines.map((m) => {
            const now = new Date();
            const todayDate = now.toISOString().split('T')[0];
            const thisMonthKey = todayDate.substring(0, 7); // YYYY-MM
            // Calculate ISO week number
            const d = new Date(
              Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
            );
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil(
              ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
            );
            const thisWeekKey = `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;

            // Debug logging for date matching
            console.log(`📅 AI Usage date debug for ${m.machineId}:`);
            console.log(`   Today (UTC): ${todayDate}`);
            console.log(`   This Week: ${thisWeekKey}`);
            console.log(`   This Month: ${thisMonthKey}`);
            console.log(
              `   Available daily keys: ${Object.keys(m.daily).join(', ') || 'none'}`,
            );
            console.log(
              `   Available weekly keys: ${Object.keys(m.weekly).join(', ') || 'none'}`,
            );
            console.log(
              `   Available monthly keys: ${Object.keys(m.monthly).join(', ') || 'none'}`,
            );

            return {
              machineId: m.machineId,
              total: m.total,
              formattedCost: `$${m.total.cost.toFixed(2)}`,
              // Include current period stats (fixed to use correct keys)
              today: m.daily[todayDate] || {
                edits: 0,
                generations: 0,
                cost: 0,
              },
              thisWeek: m.weekly[thisWeekKey] || {
                edits: 0,
                generations: 0,
                cost: 0,
              },
              thisMonth: m.monthly[thisMonthKey] || {
                edits: 0,
                generations: 0,
                cost: 0,
              },
            };
          }),
        };
      }
    } catch (error: any) {
      console.error('Error fetching AI usage stats:', error);
      throw new HttpException(
        error.message || 'Failed to fetch AI usage statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Health check for AI usage tracking (DynamoDB)
   * GET /api/admin/ai-usage/health
   */
  @Get('ai-usage/health')
  async aiUsageHealth() {
    try {
      const health = await aiUsageService.healthCheck();
      return {
        success: true,
        ...health,
        message: health.tableExists
          ? 'DynamoDB table is ready'
          : 'DynamoDB table does not exist. Run: node scripts/setup-dynamodb.js',
      };
    } catch (error: any) {
      return {
        success: false,
        healthy: false,
        tableExists: false,
        error: error.message,
      };
    }
  }
}
