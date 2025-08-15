import type { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

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

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('🔍 Submit design API called:', req.method);
  console.log('🔍 Environment check:', {
    hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasAwsSecret: !!process.env.AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    s3Bucket: process.env.AWS_S3_BUCKET || 'NOT_SET',
    dynamoTable: process.env.AWS_DYNAMODB_TABLE || 'NOT_SET',
  });
  
  if (req.method === 'POST') {
    try {
      const { design, debugData, timestamp: clientTimestamp, machineId, sessionId } = req.body;
      console.log('🔍 Received submission:', {
        hasDesign: !!design,
        designLength: design?.length,
        hasDebugData: !!debugData,
        timestamp: clientTimestamp,
        machineId: machineId || 'no-machine',
        sessionId: sessionId || 'no-session'
      });
      
      // Check required environment variables
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('AWS credentials not configured in environment variables');
      }
      
      if (!process.env.AWS_S3_BUCKET) {
        throw new Error('AWS S3 bucket not configured in environment variables');
      }
      
      if (!process.env.AWS_DYNAMODB_TABLE) {
        throw new Error('AWS DynamoDB table not configured in environment variables');
      }
      
      // Generate unique ID and timestamp
      const designId = uuidv4();
      const timestamp = clientTimestamp || Date.now();
      const filename = `designs/${designId}.png`;
      
      // Convert base64 to buffer
      const base64Data = design.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      console.log('📊 Buffer size:', buffer.length, 'bytes');
      
      // Upload to S3
      console.log('📤 Uploading to S3 bucket:', process.env.AWS_S3_BUCKET);
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: 'image/png',
        Metadata: {
          designId: designId,
          machineId: machineId || 'no-machine',
          timestamp: timestamp.toString(),
        }
      });
      
      try {
        await s3Client.send(uploadCommand);
        console.log('✅ S3 upload successful');
      } catch (s3Error: any) {
        console.error('❌ S3 upload failed:', {
          message: s3Error.message,
          code: s3Error.Code,
          statusCode: s3Error.$metadata?.httpStatusCode,
          requestId: s3Error.$metadata?.requestId,
        });
        throw new Error(`S3 upload failed: ${s3Error.message}`);
      }
      
      // Generate the public URL
      const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${filename}`;
      
      // Save design metadata to DynamoDB
      console.log('💾 Saving design to DynamoDB table:', process.env.AWS_DYNAMODB_TABLE);
      const designItem = {
        id: `design_${designId}`,
        type: 'design',
        designId: designId,
        timestamp: timestamp,
        imageUrl: imageUrl,
        machineId: machineId || 'no-machine',
        sessionId: sessionId || 'no-session',
        status: 'completed',
        submittedAt: new Date().toISOString(),
        imageSize: base64Data.length,
        debugData: debugData || {},
      };
      
      const putCommand = new PutCommand({
        TableName: process.env.AWS_DYNAMODB_TABLE,
        Item: designItem,
      });
      
      try {
        await docClient.send(putCommand);
        console.log('✅ Design saved to DynamoDB');
        
        // Update the session record to mark it as completed
        if (sessionId && sessionId !== 'no-session') {
          console.log('📝 Marking session as completed:', sessionId);
          
          // Just overwrite/create the session record with completed status
          // This works whether the session exists or not
          const sessionItem = {
            id: `session_${sessionId}`,
            sessionId: sessionId,
            machineId: machineId || 'no-machine',
            type: 'session',
            status: 'completed',
            createdAt: Date.now(),
            expiresAt: Math.floor((Date.now() + 30 * 60 * 1000) / 1000), // Keep expiry for TTL
            submittedAt: new Date().toISOString(),
            designId: designId,
            timestamp: Date.now()
          };
          
          try {
            const putSessionCommand = new PutCommand({
              TableName: process.env.AWS_DYNAMODB_TABLE,
              Item: sessionItem,
            });
            
            await docClient.send(putSessionCommand);
            console.log('✅ Session marked as completed');
          } catch (updateError: any) {
            console.error('⚠️ Failed to mark session as completed:', {
              message: updateError.message,
              code: updateError.Code || updateError.name,
              sessionId: sessionId
            });
            // Continue even if session update fails
          }
        }
      } catch (dynamoError: any) {
        console.error('❌ DynamoDB save failed:', {
          message: dynamoError.message,
          code: dynamoError.Code,
          statusCode: dynamoError.$metadata?.httpStatusCode,
          requestId: dynamoError.$metadata?.requestId,
        });
        throw new Error(`DynamoDB save failed: ${dynamoError.message}`);
      }
      
      res.status(200).json({ 
        success: true, 
        designId: designId,
        filename: filename,
        url: imageUrl,
        message: 'Design submitted successfully!'
      });
      
    } catch (error: any) {
      console.error('❌ Error submitting design:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to save design',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}