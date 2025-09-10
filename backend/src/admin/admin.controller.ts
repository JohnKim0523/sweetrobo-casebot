import {
  Controller,
  Get,
  Delete,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { S3Service } from '../s3/s3.service';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

@Controller('api/admin')
export class AdminController {
  private s3Client: S3Client;

  constructor(private readonly s3Service: S3Service) {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  @Get('s3-images')
  async listS3Images() {
    try {
      const bucketName = process.env.AWS_S3_BUCKET || 'sweetrobo-phonecase-designs';
      
      // List all objects in the designs folder
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'designs/',
        MaxKeys: 100,
      });

      const response = await this.s3Client.send(command);
      
      const images = (response.Contents || []).map(item => ({
        key: item.Key,
        url: `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${item.Key}`,
        size: item.Size,
        lastModified: item.LastModified,
      }));

      return { 
        success: true, 
        images: images.reverse(), // Show newest first
        count: images.length 
      };
    } catch (error: any) {
      console.error('Error listing S3 objects:', error);
      throw new HttpException(
        error.message || 'Failed to list S3 images',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('s3-images')
  async deleteS3Image(@Body() body: { key: string }) {
    try {
      const { key } = body;
      
      if (!key) {
        throw new HttpException('No key provided', HttpStatus.BAD_REQUEST);
      }

      const bucketName = process.env.AWS_S3_BUCKET || 'sweetrobo-phonecase-designs';
      
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      
      return { 
        success: true, 
        message: `Deleted ${key}` 
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