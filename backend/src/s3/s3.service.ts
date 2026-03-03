import { Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import * as sharp from 'sharp';

@Injectable()
export class S3Service {
  private s3: AWS.S3;
  private bucketName: string;

  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.bucketName =
      process.env.AWS_BUCKET_NAME || 'sweetrobo-phonecase-designs';

    console.log('🔐 S3 Service initialized (backup storage only)');

    // Run cleanup once on startup (delayed 30s to let app finish initializing)
    setTimeout(() => {
      this.cleanupOldDesigns().catch((err) =>
        console.error('❌ S3 cleanup failed on startup:', err),
      );
    }, 30000);

    // Schedule cleanup every 6 hours
    setInterval(
      () => {
        this.cleanupOldDesigns().catch((err) =>
          console.error('❌ S3 scheduled cleanup failed:', err),
        );
      },
      6 * 60 * 60 * 1000,
    );
    console.log('🗑️ S3 cleanup scheduled: every 6 hours (7-day retention for designs/)');
  }

  async uploadImage(
    buffer: Buffer,
    key: string,
    convertForPrint: boolean = false,
  ): Promise<string> {
    // For Chitu printer: Upload PNG for printing with 300 DPI and 90° rotation
    if (convertForPrint) {
      console.log('🔄 Converting image to PNG (300 DPI) for Chitu printer...');

      // Get base key without extension
      const baseKey = key.replace(/\.(png|jpg|jpeg|tif)$/i, '');
      const displayPngKey = `${baseKey}_display.png`;
      const printPngKey = `${baseKey}.png`;

      // 1. Upload PNG for display (original, no rotation)
      console.log('📤 Uploading PNG for machine display...');
      const displayParams = {
        Bucket: this.bucketName,
        Key: displayPngKey,
        Body: buffer,
        ContentType: 'image/png',
      };
      await this.s3.upload(displayParams).promise();
      console.log('✅ Display PNG uploaded:', displayPngKey);

      // 2. Create PNG for printing (rotated 90° clockwise, 300 DPI)
      console.log('🔄 Creating print PNG with 90° rotation and 300 DPI...');
      const printBuffer = await sharp(buffer)
        .rotate(90) // Rotate 90° clockwise
        .withMetadata({ density: 300 }) // Set 300 DPI
        .png({ quality: 100 })
        .toBuffer();

      const printParams = {
        Bucket: this.bucketName,
        Key: printPngKey,
        Body: printBuffer,
        ContentType: 'image/png',
      };
      const printResult = await this.s3.upload(printParams).promise();
      console.log('✅ Print PNG uploaded (rotated 90°, 300 DPI):', printPngKey);

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

  async cleanupOldDesigns(): Promise<void> {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
    let deletedCount = 0;
    let continuationToken: string | undefined;

    console.log(`🗑️ Starting S3 cleanup: deleting designs/ older than ${cutoff.toISOString()}`);

    do {
      const params: AWS.S3.ListObjectsV2Request = {
        Bucket: this.bucketName,
        Prefix: 'designs/',
        ContinuationToken: continuationToken,
      };

      const result = await this.s3.listObjectsV2(params).promise();
      const objects = result.Contents || [];

      for (const obj of objects) {
        if (obj.LastModified && obj.LastModified < cutoff && obj.Key) {
          await this.s3
            .deleteObject({ Bucket: this.bucketName, Key: obj.Key })
            .promise();
          deletedCount++;
        }
      }

      continuationToken = result.IsTruncated
        ? result.NextContinuationToken
        : undefined;
    } while (continuationToken);

    console.log(`🗑️ S3 cleanup complete: deleted ${deletedCount} old design(s)`);
  }

  async getWatermarkUrl(machineId: string): Promise<string | null> {
    const key = `watermarks/${machineId}.png`;
    try {
      await this.s3
        .headObject({ Bucket: this.bucketName, Key: key })
        .promise();
      return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
    } catch (err: any) {
      if (err.code === 'NotFound' || err.code === 'NoSuchKey') {
        return null;
      }
      throw err;
    }
  }
}
