import type { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Initialize clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});


const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.AWS_DYNAMODB_TABLE || 'sweetrobo-phonecase-designs';

/**
 * Unified Session API
 * 
 * Single record per session that tracks:
 * - Session creation
 * - Design submission
 * - Print queue status
 * - Completion
 * 
 * Status flow: created -> designing -> submitted -> queued -> printing -> completed
 */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'POST':
      return handleCreateSession(req, res);
    case 'PUT':
      return handleUpdateSession(req, res);
    case 'GET':
      return handleGetSessions(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// CREATE: Initialize a new session
async function handleCreateSession(req: NextApiRequest, res: NextApiResponse) {
  const { machineId, productType, sessionId: providedSessionId } = req.body;

  if (!machineId) {
    return res.status(400).json({ error: 'Machine ID required' });
  }

  // Use provided sessionId if available, otherwise generate new one
  const sessionId = providedSessionId || uuidv4();
  const timestamp = Date.now();

  // Check if session already exists to prevent duplicates
  try {
    const existingSession = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'sessionId = :sessionId',
      ExpressionAttributeValues: {
        ':sessionId': sessionId
      },
      Limit: 1
    }));

    if (existingSession.Items && existingSession.Items.length > 0) {
      console.log('Session already exists, returning existing:', sessionId);
      return res.status(200).json({
        success: true,
        sessionId,
        timestamp: existingSession.Items[0].timestamp,
        status: existingSession.Items[0].status,
        existing: true
      });
    }
  } catch (checkError) {
    console.error('Error checking existing session:', checkError);
  }

  const session = {
    // Composite key matching your existing structure
    id: `session_${sessionId}`,
    timestamp: timestamp,
    
    // Core data
    sessionId,
    machineId,
    productType: productType || 'phonecase',
    status: 'active',
    
    // Timestamps
    createdAt: timestamp,
    updatedAt: timestamp,
    
    // Design data (filled later)
    imageUrl: null,
    imageSize: null,
    designId: null,
    
    // Print data (filled later)
    printStatus: 'pending',
    printStartedAt: null,
    printCompletedAt: null,
    
    // Type for filtering
    type: 'session',
    
    // TTL - 5 minutes for abandoned sessions (will be extended when design submitted)
    ttl: Math.floor((timestamp / 1000) + 300),
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: session,
  }));

  return res.status(200).json({
    success: true,
    sessionId,
    timestamp,
    status: 'created'
  });
}

// UPDATE: Handle all session updates (design submission, print status, etc.)
async function handleUpdateSession(req: NextApiRequest, res: NextApiResponse) {
  const { 
    sessionId, 
    machineId, 
    timestamp,
    action,  // 'submit_design', 'queue_print', 'update_print_status'
    ...data 
  } = req.body;

  if (!sessionId || !machineId || !timestamp) {
    return res.status(400).json({ error: 'Session ID, Machine ID, and timestamp required' });
  }

  let updateExpression = 'SET updatedAt = :now';
  let expressionAttributeValues: any = {
    ':now': Date.now()
  };
  let expressionAttributeNames: any = {};

  switch (action) {
    case 'submit_design':
      // When design is submitted - extend TTL to 30 minutes for printer to poll
      updateExpression += ', #status = :status, imageUrl = :imageUrl, imageSize = :imageSize, designId = :designId, #ttl = :ttl';
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeNames['#ttl'] = 'ttl';
      expressionAttributeValues[':status'] = 'submitted';
      expressionAttributeValues[':imageUrl'] = data.imageUrl;
      expressionAttributeValues[':imageSize'] = data.imageSize || 0;
      expressionAttributeValues[':designId'] = data.designId || uuidv4();
      expressionAttributeValues[':ttl'] = Math.floor((Date.now() / 1000) + 1800); // 30 min for printer
      break;

    case 'queue_print':
      // When queued for printing
      updateExpression += ', #status = :status, printStatus = :printStatus';
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = 'queued';
      expressionAttributeValues[':printStatus'] = 'queued';
      break;

    case 'start_print':
      // When printer starts processing
      updateExpression += ', printStatus = :printStatus, printStartedAt = :startedAt';
      expressionAttributeValues[':printStatus'] = 'printing';
      expressionAttributeValues[':startedAt'] = Date.now();
      break;

    case 'complete_print':
      // When printing completes - set short TTL for cleanup
      updateExpression += ', #status = :status, printStatus = :printStatus, printCompletedAt = :completedAt, #ttl = :ttl';
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeNames['#ttl'] = 'ttl';
      expressionAttributeValues[':status'] = 'completed';
      expressionAttributeValues[':printStatus'] = 'completed';
      expressionAttributeValues[':completedAt'] = Date.now();
      expressionAttributeValues[':ttl'] = Math.floor((Date.now() / 1000) + 300); // 5 min after printing
      break;

    default:
      return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        id: `session_${sessionId}`,
        timestamp: timestamp,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));

    return res.status(200).json({
      success: true,
      session: result.Attributes
    });
  } catch (error) {
    console.error('Update failed:', error);
    return res.status(500).json({ error: 'Failed to update session' });
  }
}

// GET: Query sessions (for printer polling or admin dashboard)
async function handleGetSessions(req: NextApiRequest, res: NextApiResponse) {
  const { machineId, status, sessionId, limit = 10 } = req.query;

  try {
    // Check specific session status
    if (sessionId && !status) {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'sessionId = :sessionId',
        ExpressionAttributeValues: {
          ':sessionId': sessionId
        },
        Limit: 1
      }));
      
      const session = result.Items?.[0];
      if (session) {
        return res.status(200).json(session);
      } else {
        return res.status(404).json({ error: 'Session not found' });
      }
    }
    
    // Printer polling for queued jobs
    if (machineId && status === 'queued') {
      // Printer polling for queued jobs - use Scan since we don't have GSI
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'machineId = :machineId AND printStatus = :status AND #type = :type',
        ExpressionAttributeNames: {
          '#type': 'type'
        },
        ExpressionAttributeValues: {
          ':machineId': machineId,
          ':status': 'queued',
          ':type': 'session'
        },
        Limit: Number(limit)
      }));

      return res.status(200).json({
        success: true,
        sessions: result.Items || [],
        count: result.Count || 0
      });
    }

    // Add more query patterns as needed
    return res.status(400).json({ error: 'Invalid query parameters' });
    
  } catch (error) {
    console.error('Query failed:', error);
    return res.status(500).json({ error: 'Failed to query sessions' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};