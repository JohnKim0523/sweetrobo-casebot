import type { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

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
  if (req.method === 'GET') {
    try {
      const { machineId, limit = 20 } = req.query;
      
      console.log('📊 Fetching designs from DynamoDB...');
      console.log('Machine ID filter:', machineId || 'all');
      
      let designs = [];
      
      if (machineId && machineId !== 'all') {
        // Query by specific machine ID
        // Note: This would be more efficient with a GSI (Global Secondary Index) on machineId
        // For now, we'll scan and filter
        const scanCommand = new ScanCommand({
          TableName: process.env.AWS_DYNAMODB_TABLE,
          FilterExpression: 'machineId = :machineId',
          ExpressionAttributeValues: {
            ':machineId': machineId,
          },
          Limit: Number(limit),
        });
        
        const result = await docClient.send(scanCommand);
        designs = result.Items || [];
      } else {
        // Get all designs
        const scanCommand = new ScanCommand({
          TableName: process.env.AWS_DYNAMODB_TABLE,
          Limit: Number(limit),
        });
        
        const result = await docClient.send(scanCommand);
        designs = result.Items || [];
      }
      
      // Sort by timestamp (newest first)
      designs.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`✅ Found ${designs.length} designs`);
      
      res.status(200).json({
        success: true,
        designs: designs,
        count: designs.length,
      });
      
    } catch (error: any) {
      console.error('❌ Error fetching designs:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch designs',
      });
    }
  } else if (req.method === 'DELETE') {
    // Optional: Add delete functionality
    const { designId } = req.body;
    // Implementation for deleting a design from S3 and DynamoDB
    res.status(501).json({ error: 'Delete not implemented yet' });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}