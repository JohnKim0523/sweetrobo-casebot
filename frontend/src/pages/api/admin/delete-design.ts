import type { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// Initialize AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Initialize DynamoDB Client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { designId, imageUrl, timestamp } = req.body;
    
    if (!designId || !timestamp) {
      return res.status(400).json({ error: 'Design ID and timestamp are required' });
    }
    
    console.log('🗑️ Deleting design:', designId);
    
    // Extract S3 key from the image URL
    let s3Key = '';
    if (imageUrl) {
      // URL format: https://bucket.s3.region.amazonaws.com/designs/uuid.png
      const urlParts = imageUrl.split('.com/');
      if (urlParts.length > 1) {
        s3Key = urlParts[1]; // Gets "designs/uuid.png"
      } else {
        // Fallback: construct key from designId
        s3Key = `designs/${designId}.png`;
      }
    } else {
      s3Key = `designs/${designId}.png`;
    }
    
    console.log('📦 Deleting from S3, key:', s3Key);
    
    // Delete from S3
    try {
      const deleteS3Command = new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
      });
      await s3Client.send(deleteS3Command);
      console.log('✅ Deleted from S3');
    } catch (s3Error: any) {
      console.error('⚠️ S3 deletion error (continuing):', s3Error.message);
      // Continue even if S3 deletion fails (image might already be deleted)
    }
    
    // Delete from DynamoDB
    console.log('💾 Deleting from DynamoDB...');
    const deleteDbCommand = new DeleteCommand({
      TableName: process.env.AWS_DYNAMODB_TABLE,
      Key: {
        id: designId,
        timestamp: Number(timestamp),
      },
    });
    
    await docClient.send(deleteDbCommand);
    console.log('✅ Deleted from DynamoDB');
    
    res.status(200).json({
      success: true,
      message: 'Design deleted successfully',
      deletedId: designId,
    });
    
  } catch (error: any) {
    console.error('❌ Error deleting design:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete design',
    });
  }
}