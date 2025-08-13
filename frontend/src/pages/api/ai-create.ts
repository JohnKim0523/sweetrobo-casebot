import type { NextApiRequest, NextApiResponse } from 'next';
import Replicate from 'replicate';

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Model for text-to-image generation - Using Flux 1.1 Pro for better quality
const TEXT_TO_IMAGE_MODEL = "black-forest-labs/flux-1.1-pro";

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

    // Flux 1.1 Pro has better understanding, so we don't need to enhance as much
    const enhancedPrompt = `${prompt}, high quality, professional`;

    // Generate image using Flux 1.1 Pro
    // Based on the API example, Flux 1.1 Pro has simpler parameters
    const input = {
      prompt: enhancedPrompt,
      prompt_upsampling: true,  // This enhances the prompt automatically
      aspect_ratio: "1:1",       // Square format for case design
      output_format: "png",      // PNG for better quality
      output_quality: 100,       // Maximum quality
      safety_tolerance: 2,       // Safety filter level
      seed: Math.floor(Math.random() * 1000000),
    };

    console.log('Generating image with Flux 1.1 Pro...');
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

    // Handle Flux 1.1 Pro output format
    let resultImage = '';
    
    // According to the Flux 1.1 Pro API example, output has a url() method
    if (output && typeof output === 'object' && typeof output.url === 'function') {
      try {
        const urlResult = await output.url();
        console.log('Got URL from output.url():', urlResult);
        
        // Convert URL object to string if needed
        if (urlResult instanceof URL) {
          resultImage = urlResult.href;
        } else {
          resultImage = String(urlResult);
        }
      } catch (error) {
        console.error('Error getting URL from output:', error);
      }
    } else if (typeof output === 'string') {
      // Fallback: direct string URL
      resultImage = output;
    } else if (Array.isArray(output) && output.length > 0) {
      resultImage = output[0];
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