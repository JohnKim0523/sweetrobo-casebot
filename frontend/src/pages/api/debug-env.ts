import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Debug environment variables (hide actual values for security)
  const envDebug = {
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 4)}...${process.env.AWS_ACCESS_KEY_ID.slice(-4)}` : 'NOT SET',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? `${process.env.AWS_SECRET_ACCESS_KEY.substring(0, 4)}...${process.env.AWS_SECRET_ACCESS_KEY.slice(-4)}` : 'NOT SET',
    AWS_REGION: process.env.AWS_REGION || 'NOT SET',
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || 'NOT SET',
    AWS_DYNAMODB_TABLE: process.env.AWS_DYNAMODB_TABLE || 'NOT SET',
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN ? `${process.env.REPLICATE_API_TOKEN.substring(0, 4)}...${process.env.REPLICATE_API_TOKEN.slice(-4)}` : 'NOT SET',
    CLEANUP_AUTH_TOKEN: process.env.CLEANUP_AUTH_TOKEN ? `${process.env.CLEANUP_AUTH_TOKEN.substring(0, 4)}...${process.env.CLEANUP_AUTH_TOKEN.slice(-4)}` : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };

  return res.status(200).json({
    success: true,
    message: 'Environment variables debug',
    env: envDebug,
    timestamp: new Date().toISOString(),
  });
}