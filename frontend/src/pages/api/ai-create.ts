import type { NextApiRequest, NextApiResponse } from 'next';
import Replicate from 'replicate';

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Model for text-to-image generation
const TEXT_TO_IMAGE_MODEL = "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('AI Create Request:', { prompt });

    // Enhance the prompt for better quality
    const enhancedPrompt = `${prompt}, high quality, detailed, sharp focus, 8k resolution`;

    // Generate image using SDXL
    const input = {
      prompt: enhancedPrompt,
      negative_prompt: "ugly, blurry, poor quality, distorted, deformed, low resolution, bad anatomy",
      width: 1024,
      height: 1024,
      num_inference_steps: 30,
      guidance_scale: 7.5,
      scheduler: "K_EULER",
      seed: Math.floor(Math.random() * 1000000),
      refine: "expert_ensemble_refiner",
      high_noise_frac: 0.8,
    };

    console.log('Generating image with SDXL...');
    const output = await replicate.run(TEXT_TO_IMAGE_MODEL, { input });

    console.log('Raw output from Replicate:', typeof output, output);

    // Helper function to check if object is a ReadableStream
    const isReadableStream = (obj: any): boolean => {
      return obj && typeof obj === 'object' && typeof obj.getReader === 'function';
    };
    
    // Helper function to handle ReadableStream
    const handleStream = async (stream: any): Promise<string> => {
      if (isReadableStream(stream)) {
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          
          const fullArray = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
          let offset = 0;
          for (const chunk of chunks) {
            fullArray.set(chunk, offset);
            offset += chunk.length;
          }
          
          // Detect image type
          let mimeType = 'image/png';
          if (fullArray[0] === 0xFF && fullArray[1] === 0xD8) {
            mimeType = 'image/jpeg';
          }
          
          const base64 = Buffer.from(fullArray).toString('base64');
          console.log('Converted stream to base64, length:', base64.length);
          return `data:${mimeType};base64,${base64}`;
        } catch (error) {
          console.error('Error reading stream:', error);
          throw error;
        }
      }
      return '';
    };

    // Handle different output formats
    let resultImage = '';
    
    if (typeof output === 'string') {
      resultImage = output;
    } else if (Array.isArray(output) && output.length > 0) {
      const firstElement = output[0];
      if (typeof firstElement === 'string') {
        resultImage = firstElement;
      } else if (isReadableStream(firstElement)) {
        console.log('Processing ReadableStream from array...');
        resultImage = await handleStream(firstElement);
      }
    } else if (output && typeof output === 'object') {
      if (isReadableStream(output)) {
        console.log('Processing ReadableStream directly...');
        resultImage = await handleStream(output);
      }
    }

    if (!resultImage) {
      console.error('Failed to extract image from output:', output);
      throw new Error('No output received from model');
    }

    console.log('AI image generation completed successfully');
    console.log('Result image type:', typeof resultImage);
    console.log('Result image length:', resultImage.length);

    return res.status(200).json({
      success: true,
      generatedImage: resultImage,
      prompt: prompt,
    });

  } catch (error: any) {
    console.error('AI Create Error:', error);
    
    if (error.response) {
      return res.status(500).json({
        success: false,
        error: `Replicate API error: ${error.response.status} - ${error.response.data?.detail || 'Unknown error'}`,
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate image',
    });
  }
}