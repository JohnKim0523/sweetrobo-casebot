import type { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results = {
    environmentVariables: {
      AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: !!process.env.AWS_SECRET_ACCESS_KEY,
      AWS_REGION: process.env.AWS_REGION,
      AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
      AWS_DYNAMODB_TABLE: process.env.AWS_DYNAMODB_TABLE,
    },
    s3Test: { status: 'not_tested', error: null },
    dynamoTest: { status: 'not_tested', error: null },
  };

  // Test S3 Connection
  try {
    console.log('Testing S3 connection...');
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET,
      MaxKeys: 5,
    });

    const s3Response = await s3Client.send(listCommand);
    results.s3Test = {
      status: 'success',
      objectCount: s3Response.Contents?.length || 0,
      error: null,
    };
    console.log('S3 test successful');
  } catch (error: any) {
    console.error('S3 test failed:', error);
    results.s3Test = {
      status: 'failed',
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode,
      },
    };
  }

  // Test DynamoDB Connection
  try {
    console.log('Testing DynamoDB connection...');
    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    const docClient = DynamoDBDocumentClient.from(dynamoClient);

    const scanCommand = new ScanCommand({
      TableName: process.env.AWS_DYNAMODB_TABLE,
      Limit: 1,
    });

    const dynamoResponse = await docClient.send(scanCommand);
    results.dynamoTest = {
      status: 'success',
      itemCount: dynamoResponse.Count || 0,
      error: null,
    };
    console.log('DynamoDB test successful');
  } catch (error: any) {
    console.error('DynamoDB test failed:', error);
    results.dynamoTest = {
      status: 'failed',
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode,
      },
    };
  }

  return res.status(200).json({
    success: true,
    message: 'AWS connectivity test results',
    results: results,
    timestamp: new Date().toISOString(),
  });
}