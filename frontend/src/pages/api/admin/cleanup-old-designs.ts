import type { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

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

// This function should be called regularly (e.g., every 5 minutes via cron job)
// It will delete any designs that are older than 1 hour from their upload time
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add a simple auth check (you should use a proper auth system in production)
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.CLEANUP_AUTH_TOKEN || 'your-secret-cleanup-token';
  
  if (authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { hoursOld = 1 } = req.body; // Default to 1 hour after upload
    
    console.log(`🧹 Checking for designs older than ${hoursOld} hour(s)...`);
    
    // Calculate cutoff time (current time minus specified hours)
    const currentTime = Date.now();
    const cutoffTime = currentTime - (hoursOld * 60 * 60 * 1000);
    
    // Scan DynamoDB for designs older than cutoff time
    // The timestamp field stores when the design was uploaded
    const scanCommand = new ScanCommand({
      TableName: process.env.AWS_DYNAMODB_TABLE,
      FilterExpression: '#ts < :cutoff',
      ExpressionAttributeNames: {
        '#ts': 'timestamp',
      },
      ExpressionAttributeValues: {
        ':cutoff': cutoffTime,
      },
    });
    
    const scanResult = await docClient.send(scanCommand);
    const oldDesigns = scanResult.Items || [];
    
    console.log(`📊 Found ${oldDesigns.length} designs older than ${hoursOld} hour(s)`);
    
    let deletedCount = 0;
    const errors = [];
    const deletedDesigns = [];
    
    // Delete each old design
    for (const design of oldDesigns) {
      try {
        const ageInMinutes = Math.floor((currentTime - design.timestamp) / (1000 * 60));
        console.log(`🔍 Design ${design.id} is ${ageInMinutes} minutes old`);
        
        // Delete from S3
        const s3Key = `designs/${design.id}.png`;
        const deleteS3Command = new DeleteObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: s3Key,
        });
        
        try {
          await s3Client.send(deleteS3Command);
          console.log(`✅ Deleted from S3: ${s3Key}`);
        } catch (s3Error: any) {
          console.warn(`⚠️ S3 deletion failed for ${s3Key}:`, s3Error.message);
          // Continue anyway - S3 object might already be deleted
        }
        
        // Delete from DynamoDB
        const deleteDbCommand = new DeleteCommand({
          TableName: process.env.AWS_DYNAMODB_TABLE,
          Key: {
            id: design.id,
            timestamp: design.timestamp,
          },
        });
        
        await docClient.send(deleteDbCommand);
        console.log(`✅ Deleted from DynamoDB: ${design.id}`);
        
        deletedDesigns.push({
          id: design.id,
          ageMinutes: ageInMinutes,
          uploadedAt: new Date(design.timestamp).toISOString(),
        });
        deletedCount++;
      } catch (error: any) {
        console.error(`❌ Error deleting design ${design.id}:`, error.message);
        errors.push({ id: design.id, error: error.message });
      }
    }
    
    console.log(`🎉 Cleanup complete: ${deletedCount}/${oldDesigns.length} designs deleted`);
    
    res.status(200).json({
      success: true,
      message: `Deleted ${deletedCount} design(s) older than ${hoursOld} hour(s)`,
      currentTime: new Date(currentTime).toISOString(),
      cutoffTime: new Date(cutoffTime).toISOString(),
      totalFound: oldDesigns.length,
      deletedCount: deletedCount,
      deletedDesigns: deletedDesigns,
      errors: errors.length > 0 ? errors : undefined,
    });
    
  } catch (error: any) {
    console.error('❌ Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cleanup old designs',
    });
  }
}