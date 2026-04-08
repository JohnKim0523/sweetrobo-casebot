import { Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import * as sharp from 'sharp';

@Injectable()
export class S3Service {
  private s3: AWS.S3;
  private bucketName: string;
  private watermarkBucketName: string;

  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      httpOptions: {
        timeout: 30000, // 30 second timeout — prevents hanging forever on slow/dead connections
        connectTimeout: 10000, // 10 second connection timeout
      },
      maxRetries: 2, // Retry up to 2 times on transient errors
    });
    this.bucketName =
      process.env.AWS_BUCKET_NAME || 'sweetrobo-phonecase-designs';
    this.watermarkBucketName =
      process.env.WATERMARK_S3_BUCKET || 'sweet-robo-public-dev';
  }

  async uploadImage(
    buffer: Buffer,
    key: string,
    convertForPrint: boolean = false,
  ): Promise<string> {
    if (convertForPrint) {
      const baseKey = key.replace(/\.(png|jpg|jpeg|tif)$/i, '');
      const displayPngKey = `${baseKey}_display.png`;
      const printPngKey = `${baseKey}.png`;

      // Upload display PNG (original, no rotation)
      await this.s3.upload({
        Bucket: this.bucketName,
        Key: displayPngKey,
        Body: buffer,
        ContentType: 'image/png',
      }).promise();

      // Upload print PNG (rotated 90° clockwise, 300 DPI)
      const printBuffer = await sharp(buffer)
        .rotate(90)
        .withMetadata({ density: 300 })
        .png({ quality: 100 })
        .toBuffer();

      const printResult = await this.s3.upload({
        Bucket: this.bucketName,
        Key: printPngKey,
        Body: printBuffer,
        ContentType: 'image/png',
      }).promise();

      // Return print PNG URL
      return printResult.Location;
    }

    // Regular upload (no TIF conversion)
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
    };

    const result = await this.s3.upload(params).promise();
    return result.Location;
  }

  async listImages(prefix?: string): Promise<any[]> {
    const params = {
      Bucket: this.bucketName,
      Prefix: prefix || 'designs/',
    };

    const result = await this.s3.listObjectsV2(params).promise();
    return result.Contents || [];
  }

  async deleteImage(key: string): Promise<void> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
    };

    await this.s3.deleteObject(params).promise();
  }

  async getWatermarkUrl(machineId: string): Promise<string | null> {
    const key = `watermarks/${machineId}.png`;
    try {
      await this.s3
        .headObject({ Bucket: this.watermarkBucketName, Key: key })
        .promise();
      return this.s3.getSignedUrl('getObject', {
        Bucket: this.watermarkBucketName,
        Key: key,
        Expires: 3600,
      });
    } catch (err: any) {
      if (err.code === 'NotFound' || err.code === 'NoSuchKey') {
        return null;
      }
      throw err;
    }
  }
}
