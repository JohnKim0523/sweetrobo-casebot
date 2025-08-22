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
      aspect_ratio: "1:1",       // Square format for case design
      output_format: "png",      // PNG for better quality
      output_quality: 100,       // Maximum quality
      safety_tolerance: 6,       // Safety filter level (1-6, 6 is most permissive)
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
    
    // Flux 1.1 Pro returns a URL string directly
    if (typeof output === 'string') {
      // Direct string URL
      resultImage = output;
    } else if (Array.isArray(output) && output.length > 0) {
      // Array of URLs, take the first one
      resultImage = output[0];
    } else if (output && typeof output === 'object') {
      // Check if it has a URL-like property
      const outputObj = output as any;
      if (outputObj.url) {
        // If url is a function, call it
        if (typeof outputObj.url === 'function') {
          try {
            const urlResult = await outputObj.url();
            resultImage = urlResult instanceof URL ? urlResult.href : String(urlResult);
          } catch (error) {
            console.error('Error calling url():', error);
          }
        } else {
          // Direct URL property
          resultImage = String(outputObj.url);
        }
      } else if (outputObj.href) {
        resultImage = String(outputObj.href);
      } else if (outputObj.output) {
        resultImage = String(outputObj.output);
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