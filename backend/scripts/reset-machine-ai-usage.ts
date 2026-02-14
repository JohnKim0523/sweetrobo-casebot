/**
 * Script to reset AI usage statistics for specific machines
 * Usage: npx ts-node scripts/reset-machine-ai-usage.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const TABLE_NAME = 'sweetrobo-ai-usage';

// Machines to reset
const MACHINES_TO_RESET = ['CT0700046', 'CT0700055'];

async function resetMachineUsage(machineId: string): Promise<number> {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  // First, query all items for this machine
  console.log(`\n📋 Querying all records for machine: ${machineId}`);

  const queryResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'machineId = :machineId',
      ExpressionAttributeValues: {
        ':machineId': machineId,
      },
    }),
  );

  const items = queryResult.Items || [];
  console.log(`   Found ${items.length} records`);

  if (items.length === 0) {
    console.log(`   No records to delete for ${machineId}`);
    return 0;
  }

  // Delete each item
  let deletedCount = 0;
  for (const item of items) {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            machineId: item.machineId,
            timestamp: item.timestamp,
          },
        }),
      );
      deletedCount++;
      process.stdout.write(`\r   Deleted ${deletedCount}/${items.length} records`);
    } catch (error) {
      console.error(`\n   ❌ Failed to delete record: ${item.timestamp}`, error);
    }
  }

  console.log(`\n   ✅ Successfully deleted ${deletedCount} records for ${machineId}`);
  return deletedCount;
}

async function main() {
  console.log('🔧 AI Usage Reset Script');
  console.log('========================');
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Machines to reset: ${MACHINES_TO_RESET.join(', ')}`);

  // Check for AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('\n❌ AWS credentials not found in environment variables');
    console.error('   Make sure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in .env');
    process.exit(1);
  }

  let totalDeleted = 0;

  for (const machineId of MACHINES_TO_RESET) {
    try {
      const deleted = await resetMachineUsage(machineId);
      totalDeleted += deleted;
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        console.error(`\n❌ Table '${TABLE_NAME}' not found`);
      } else {
        console.error(`\n❌ Error resetting ${machineId}:`, error.message);
      }
    }
  }

  console.log('\n========================');
  console.log(`✅ Total records deleted: ${totalDeleted}`);
  console.log('Done!');
}

main().catch(console.error);
