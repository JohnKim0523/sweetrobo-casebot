import type { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId } = req.query;

  try {
    // Find all records related to this session
    const scanCommand = new ScanCommand({
      TableName: process.env.AWS_DYNAMODB_TABLE,
      FilterExpression: sessionId 
        ? 'sessionId = :sessionId OR contains(id, :sessionId)' 
        : 'attribute_exists(sessionId)',
      ExpressionAttributeValues: sessionId ? {
        ':sessionId': sessionId as string
      } : undefined,
    });

    const result = await docClient.send(scanCommand);
    const items = result.Items || [];

    // Group by type
    const grouped = {
      sessions: items.filter(i => i.type === 'session' || i.id?.startsWith('session_')),
      designs: items.filter(i => i.type === 'design' || i.id?.startsWith('design_')),
      other: items.filter(i => !['session', 'design'].includes(i.type) && !i.id?.startsWith('session_') && !i.id?.startsWith('design_'))
    };

    res.status(200).json({
      success: true,
      sessionId,
      totalRecords: items.length,
      grouped,
      details: items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    });

  } catch (error: any) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
}