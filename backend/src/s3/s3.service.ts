import { Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';

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

  async uploadImage(buffer: Buffer, key: string): Promise<string> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
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