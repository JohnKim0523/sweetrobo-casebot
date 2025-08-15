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
      FilterExpression: 'sessionId = :sessionId AND #type = :type',
      ExpressionAttributeValues: {
        ':sessionId': sessionId,
        ':type': 'session'
      },
      ExpressionAttributeNames: {
        '#type': 'type'  // 'type' is a reserved word in DynamoDB
      }
    });

    const result = await docClient.send(scanCommand);
    
    console.log('🔍 Check session result:', {
      sessionId: sessionId,
      itemsFound: result.Items?.length || 0,
      items: result.Items
    });
    
    if (result.Items && result.Items.length > 0) {
      // If multiple sessions exist, prioritize 'completed' status
      const session = result.Items.length > 1 
        ? result.Items.find(item => item.status === 'completed') || result.Items[0]
        : result.Items[0];
      
      console.log('📋 Session details:', {
        status: session.status,
        expiresAt: session.expiresAt,
        id: session.id,
        totalFound: result.Items.length
      });
      
      // Check if session is expired (convert seconds back to milliseconds for comparison)
      if (session.expiresAt && Date.now() > (session.expiresAt * 1000)) {
        return res.status(200).json({ 
          status: 'expired',
          message: 'Session has expired'
        });
      }
      
      // Check if session is completed
      if (session.status === 'completed') {
        return res.status(200).json({ 
          status: 'completed',
          message: 'Session already used'
        });
      }
      
      // Session is still active
      return res.status(200).json({ 
        status: 'active',
        message: 'Session is active',
        expiresAt: session.expiresAt
      });
    }
    
    // Session doesn't exist - should not happen with new flow
    // but return expired to force new session creation
    return res.status(200).json({ 
      status: 'expired',
      message: 'Session not found'
    });
    
  } catch (error) {
    console.error('Error checking session:', error);
    return res.status(500).json({ 
      error: 'Failed to check session status'
    });
  }
}