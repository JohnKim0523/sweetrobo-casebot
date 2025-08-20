import type { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Canvas dimensions (matching frontend)
const DISPLAY_WIDTH = 250;
const DISPLAY_HEIGHT = 200;

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
      sizeLimit: '50mb'  // Increased for mobile photos
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
      const { design, imageUrl, designId: clientDesignId, debugData, timestamp: clientTimestamp, machineId, sessionId, sessionTimestamp, imageSize } = req.body;
      
      // Support both old (base64) and new (S3 URL) methods
      const isDirectUpload = !!imageUrl;
      
      console.log('🔍 Received submission:', {
        isDirectUpload,
        hasDesign: !!design,
        hasImageUrl: !!imageUrl,
        designLength: design?.length,
        imageSize: imageSize,
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
      
      let finalImageUrl: string;
      let designId: string;
      let finalImageSize: number;
      let filename: string;
      const timestamp = clientTimestamp || Date.now();
      
      if (isDirectUpload) {
        // Image already uploaded directly to S3
        console.log('✅ Using direct S3 upload');
        finalImageUrl = imageUrl;
        designId = clientDesignId || uuidv4();
        finalImageSize = imageSize || 0;
        filename = `designs/${designId}.png`; // Construct filename from designId
      } else {
        // Legacy: Upload base64 to S3 (for desktop/backwards compatibility)
        designId = uuidv4();
        filename = `designs/${designId}.png`;
        
        // Convert base64 to buffer
        const base64Data = design.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        finalImageSize = buffer.length;
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
        finalImageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${filename}`;
      }
      
      // SINGLE UPDATE: Update session with ALL design info and queue for printing
      // NO SEPARATE DESIGN RECORD - Everything goes in the session record
      if (sessionId && sessionId !== 'no-session' && sessionTimestamp) {
        console.log('💾 Updating session with design data:', { sessionId, timestamp: sessionTimestamp });
        
        try {
          // ONE UPDATE with all the data
          const updateCommand = new UpdateCommand({
            TableName: process.env.AWS_DYNAMODB_TABLE,
            Key: {
              id: `session_${sessionId}`,
              timestamp: sessionTimestamp  // Sort key - must match original!
            },
            UpdateExpression: `SET 
              #status = :status, 
              imageUrl = :imageUrl, 
              imageSize = :imageSize, 
              designId = :designId, 
              printStatus = :printStatus, 
              submittedAt = :submittedAt,
              updatedAt = :now,
              uploadMethod = :uploadMethod,
              canvasWidth = :canvasWidth,
              canvasHeight = :canvasHeight,
              objectCount = :objectCount,
              #ttl = :ttl`,
            ExpressionAttributeNames: {
              '#status': 'status',
              '#ttl': 'ttl'
            },
            ExpressionAttributeValues: {
              ':status': 'completed',
              ':imageUrl': finalImageUrl,
              ':imageSize': finalImageSize,
              ':designId': designId,
              ':printStatus': 'queued',  // Automatically queue for printing
              ':submittedAt': new Date().toISOString(),
              ':now': Date.now(),
              ':uploadMethod': isDirectUpload ? 'direct' : 'base64',
              ':canvasWidth': debugData?.width || DISPLAY_WIDTH,
              ':canvasHeight': debugData?.height || DISPLAY_HEIGHT,
              ':objectCount': debugData?.objects?.length || 0,
              ':ttl': Math.floor((Date.now() / 1000) + 1800) // Extend to 30 min for printer
            },
            ReturnValues: 'ALL_NEW'
          });
          
          const result = await docClient.send(updateCommand);
          console.log('✅ Session updated with design (ONE record only!):', result.Attributes?.id);
        } catch (error: any) {
          console.error('❌ Failed to update session:', {
            message: error.message,
            name: error.name,
            sessionId: sessionId,
            timestamp: sessionTimestamp
          });
          // Don't fail the whole request if session update fails
          // But log it so we know there's an issue
        }
      } else {
        console.log('⚠️ No session to update - standalone design submission');
        // For backwards compatibility, you might want to still create a design record
        // if there's no session, but ideally all submissions should have a session
      }
      
      res.status(200).json({ 
        success: true, 
        designId: designId,
        filename: filename,
        url: finalImageUrl,  // Fixed: was using wrong variable
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