import type { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

// Configure AWS
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.AWS_DYNAMODB_TABLE || 'sweetrobo-phonecase-designs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }

  try {
    // Check if session exists in DynamoDB
    const scanCommand = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'sessionId = :sessionId',
      ExpressionAttributeValues: {
        ':sessionId': sessionId
      }
    });

    const result = await docClient.send(scanCommand);
    
    if (result.Items && result.Items.length > 0) {
      // Session exists and has been used
      const session = result.Items[0];
      
      // Check if session is expired (30 minutes)
      const sessionAge = Date.now() - session.timestamp;
      const thirtyMinutes = 30 * 60 * 1000;
      
      if (sessionAge > thirtyMinutes && session.status !== 'completed') {
        return res.status(200).json({ 
          status: 'expired',
          message: 'Session has expired'
        });
      }
      
      return res.status(200).json({ 
        status: 'completed',
        message: 'Session already used'
      });
    }
    
    // Session doesn't exist yet - it's active/new
    return res.status(200).json({ 
      status: 'active',
      message: 'Session is active'
    });
    
  } catch (error) {
    console.error('Error checking session:', error);
    return res.status(500).json({ 
      error: 'Failed to check session status'
    });
  }
}