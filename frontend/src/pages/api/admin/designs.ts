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
      const { machineId } = req.query;
      
      console.log('📊 Fetching designs from DynamoDB...');
      console.log('Table:', process.env.AWS_DYNAMODB_TABLE);
      console.log('Machine ID filter:', machineId || 'all');
      
      let designs = [];
      
      if (machineId && machineId !== 'all') {
        // Query by specific machine ID
        // Now looking for sessions with completed designs
        const scanCommand = new ScanCommand({
          TableName: process.env.AWS_DYNAMODB_TABLE,
          FilterExpression: 'machineId = :machineId AND #type = :type AND attribute_exists(imageUrl)',
          ExpressionAttributeValues: {
            ':machineId': machineId,
            ':type': 'session',  // Changed from 'design' to 'session'
          },
          ExpressionAttributeNames: {
            '#type': 'type'  // 'type' is a reserved word in DynamoDB
          },
        });
        
        const result = await docClient.send(scanCommand);
        designs = result.Items || [];
      } else {
        // Get all sessions that have designs (imageUrl exists)
        const scanCommand = new ScanCommand({
          TableName: process.env.AWS_DYNAMODB_TABLE,
          FilterExpression: '#type = :type AND attribute_exists(imageUrl)',
          ExpressionAttributeValues: {
            ':type': 'session',  // Changed from 'design' to 'session'
          },
          ExpressionAttributeNames: {
            '#type': 'type'  // 'type' is a reserved word in DynamoDB
          },
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