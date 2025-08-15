import type { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, machineId } = req.body;
  
  if (!sessionId || !machineId) {
    return res.status(400).json({ error: 'Session ID and Machine ID required' });
  }

  try {
    const now = Date.now();
    const thirtyMinutes = 1 * 60 * 1000; // TEMPORARILY 1 minute for testing
    
    // Create session record
    const sessionItem = {
      id: `session_${sessionId}`, // Prefix to differentiate from designs
      sessionId: sessionId,
      machineId: machineId,
      type: 'session',  // To identify this as a session record
      status: 'active',
      createdAt: now,
      expiresAt: Math.floor((now + thirtyMinutes) / 1000), // TTL in seconds for DynamoDB
      timestamp: now,  // For compatibility with existing queries
      submittedAt: null,
      designId: null
    };
    
    // Save to DynamoDB
    const putCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: sessionItem,
    });
    
    await docClient.send(putCommand);
    
    console.log('✅ Session registered:', sessionId);
    
    return res.status(200).json({ 
      success: true,
      sessionId: sessionId,
      expiresAt: sessionItem.expiresAt,
      message: 'Session created successfully'
    });
    
  } catch (error) {
    console.error('Error creating session:', error);
    return res.status(500).json({ 
      error: 'Failed to create session'
    });
  }
}