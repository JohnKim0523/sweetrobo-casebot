import type { NextApiRequest, NextApiResponse } from 'next';
import Replicate from 'replicate';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if API token is set
    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(500).json({
        success: false,
        error: 'REPLICATE_API_TOKEN is not set in environment variables'
      });
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // Test with a simple prompt - no image required for initial generation
    const testInput = {
      prompt: "A simple test image of a red circle on white background",
      aspect_ratio: "1:1",
      output_format: "png",
      safety_tolerance: 2,
      prompt_upsampling: false,
      seed: 42
    };

    console.log('Testing Replicate API connection...');
    console.log('API Token length:', process.env.REPLICATE_API_TOKEN.length);
    console.log('Test input:', testInput);

    // Try to run the Flux Kontext Pro model
    const model = "black-forest-labs/flux-kontext-pro:1ed494016458f5d931b2fa3ff0ff5e41f39c7f97f96f8eeeacdfc6c88cc690e9";
    
    try {
      const output = await replicate.run(model as `${string}/${string}:${string}`, {
        input: testInput
      });

      console.log('Test successful! Output:', output);
      
      return res.status(200).json({
        success: true,
        message: 'Replicate API connection successful',
        output: output,
        tokenLength: process.env.REPLICATE_API_TOKEN.length
      });
    } catch (apiError: any) {
      console.error('API Error:', apiError);
      console.error('Error details:', JSON.stringify(apiError, Object.getOwnPropertyNames(apiError), 2));
      
      return res.status(500).json({
        success: false,
        error: 'API call failed',
        details: {
          message: apiError.message,
          status: apiError.status,
          name: apiError.name,
          stack: apiError.stack
        }
      });
    }

  } catch (error: any) {
    console.error('Test Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Test failed'
    });
  }
}