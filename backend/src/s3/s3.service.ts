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
    this.bucketName = process.env.AWS_BUCKET_NAME || 'sweetrobo-phonecase-designs';

    console.log('🔐 S3 Service initialized (backup storage only)');
  }

  async uploadImage(buffer: Buffer, key: string, convertToTif: boolean = false): Promise<string> {
    // For Chitu printer: Upload BOTH PNG and TIF with same base filename
    // PNG for display on machine, TIF for printing
    if (convertToTif) {
      console.log('🔄 Converting image to TIF format for Chitu printer...');

      // Get base key without extension
      const baseKey = key.replace(/\.(png|jpg|jpeg|tif)$/i, '');
      const pngKey = `${baseKey}.png`;
      const tifKey = `${baseKey}.tif`;

      // 1. Upload PNG for display (original, no rotation)
      console.log('📤 Uploading PNG for machine display...');
      const pngParams = {
        Bucket: this.bucketName,
        Key: pngKey,
        Body: buffer,
        ContentType: 'image/png',
      };
      await this.s3.upload(pngParams).promise();
      console.log('✅ PNG uploaded:', pngKey);

      // 2. Create TIF for printing (rotated 90° clockwise)
      console.log('🔄 Creating TIF with 90° clockwise rotation...');
      const tifBuffer = await sharp(buffer)
        .rotate(90) // Rotate 90° clockwise
        .tiff({
          compression: 'lzw', // LZW compression for smaller file size
          quality: 100,       // Maximum quality
        })
        .toBuffer();

      const tifParams = {
        Bucket: this.bucketName,
        Key: tifKey,
        Body: tifBuffer,
        ContentType: 'image/tiff',
      };
      const tifResult = await this.s3.upload(tifParams).promise();
      console.log('✅ TIF uploaded (rotated 90°):', tifKey);

      // Return TIF URL (used for printing)
      return tifResult.Location;
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
}