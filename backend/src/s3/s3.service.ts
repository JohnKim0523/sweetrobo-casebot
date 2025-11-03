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
    let finalBuffer = buffer;
    let contentType = 'image/png';
    let finalKey = key;

    // Convert to TIF if requested (for Chitu printer compatibility)
    if (convertToTif) {
      console.log('🔄 Converting image to TIF format for Chitu printer...');
      finalBuffer = await sharp(buffer)
        .tiff({
          compression: 'lzw', // LZW compression for smaller file size
          quality: 100,       // Maximum quality
        })
        .toBuffer();
      contentType = 'image/tiff';
      finalKey = key.replace(/\.(png|jpg|jpeg)$/i, '.tif');
      console.log('✅ Converted to TIF format');
    }

    const params = {
      Bucket: this.bucketName,
      Key: finalKey,
      Body: finalBuffer,
      ContentType: contentType,
      // ACL removed - bucket has ACLs disabled
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