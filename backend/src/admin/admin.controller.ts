import {
  Controller,
  Get,
  Delete,
  Body,
  HttpException,
  HttpStatus,
  UseGuards,
  Query,
} from '@nestjs/common';
import { S3Service } from '../s3/s3.service';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { SimpleQueueService } from '../queue/simple-queue.service';

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
      const s3Jobs = allJobs.filter(job => job.imageUrl);

      return {
        success: true,
        images: s3Jobs, // These already have the base64 image thumbnails
        count: s3Jobs.length
      };
    } catch (error: any) {
      console.error('Error listing S3 images:', error);
      throw new HttpException(
        error.message || 'Failed to list S3 images',
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
        const url = new URL(key);
        key = url.pathname.substring(1); // Remove leading slash
      }

      console.log('🗑️ Deleting S3 files for key:', key);

      const bucketName = process.env.AWS_S3_BUCKET || 'sweetrobo-phonecase-designs';

      // Delete both TIF and PNG files (if key is .tif, also delete .png and vice versa)
      const baseKey = key.replace(/\.(tif|png)$/, '');
      const tifKey = `${baseKey}.tif`;
      const pngKey = `${baseKey}.png`;

      try {
        // Delete TIF
        const tifCommand = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: tifKey,
        });
        await this.s3Client.send(tifCommand);
        console.log('✅ Deleted TIF:', tifKey);
      } catch (err) {
        console.warn('⚠️ Could not delete TIF (might not exist):', tifKey);
      }

      try {
        // Delete PNG
        const pngCommand = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: pngKey,
        });
        await this.s3Client.send(pngCommand);
        console.log('✅ Deleted PNG:', pngKey);
      } catch (err) {
        console.warn('⚠️ Could not delete PNG (might not exist):', pngKey);
      }

      return {
        success: true,
        message: `Deleted ${baseKey}`
      };
    } catch (error: any) {
      console.error('Error deleting S3 object:', error);
      throw new HttpException(
        error.message || 'Failed to delete S3 image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}