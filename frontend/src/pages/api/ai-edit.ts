import type { NextApiRequest, NextApiResponse } from 'next';
import Replicate from 'replicate';

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Model configurations with working versions
const MODELS = {
  // Working SDXL models for image editing
  SDXL_GENERATE: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
  SDXL_INPAINTING: "stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3",
  SDXL_IMG2IMG: "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
  
  // Working ControlNet for better image control
  CONTROLNET_SDXL: "lucataco/sdxl-controlnet:db2ffdbdc7f6cb4d6dab512434679ee8d7101baded7e6a369d0e82165b0e02cf",
  
  // Other working models
  REAL_ESRGAN: "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b",
  REMBG: "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
  
  // Legacy (not recommended but keeping for fallback)
  INSTRUCT_PIX2PIX: "timothybrooks/instruct-pix2pix:30c1d0b916a6f8efce20493f5d61ee27491ab2a60437c13c588468b9810ec23f",
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// Analyze prompt to determine which model to use
function selectModel(prompt: string, hasMask: boolean): { model: string, params: any } {
  const lowerPrompt = prompt.toLowerCase();
  
  // If user provided a mask, use appropriate inpainting model
  if (hasMask) {
    // Check if it's a removal task
    if (lowerPrompt.match(/remove|delete|erase|get rid of|clear/i)) {
      // For removal, describe what should be there INSTEAD
      // This is more effective than trying to use specialized removal models
      let replacementPrompt = "clean background, seamless continuation of surrounding area";
      
      // Try to infer what should replace the removed object
      if (lowerPrompt.includes('tree') || lowerPrompt.includes('object')) {
        replacementPrompt = "empty grass field, blue sky, natural landscape without objects";
      } else if (lowerPrompt.includes('person') || lowerPrompt.includes('people')) {
        replacementPrompt = "empty background, natural scenery";
      } else if (lowerPrompt.includes('text') || lowerPrompt.includes('writing')) {
        replacementPrompt = "clean surface, no text";
      }
      
      console.log('Removal detected - converting prompt');
      console.log('Original prompt:', prompt);
      console.log('Replacement prompt:', replacementPrompt);
      
      return {
        model: MODELS.SDXL_INPAINTING,
        params: {
          prompt: replacementPrompt,
          negative_prompt: "objects, people, text, words, letters, artifacts, tree, trees",
          guidance_scale: 7.5,
          num_inference_steps: 40,
          strength: 1.0,  // Full strength for complete replacement
        }
      };
    } else {
      // For adding/changing content, intelligently rephrase the prompt
      let inpaintPrompt = prompt;
      
      // If user says "add X", change to "X in this area"
      if (lowerPrompt.includes('add ')) {
        inpaintPrompt = prompt.replace(/add /i, '') + ', high quality, detailed';
      }
      // If user says "change to X", use "X"
      else if (lowerPrompt.includes('change to ')) {
        inpaintPrompt = prompt.replace(/change to /i, '') + ', high quality';
      }
      
      return {
        model: MODELS.SDXL_INPAINTING,
        params: {
          prompt: inpaintPrompt,
          negative_prompt: "ugly, blurry, poor quality, text, words, letters",
          guidance_scale: 7.5,
          num_inference_steps: 30,
          strength: 0.99,
        }
      };
    }
  }
  
  // Background removal
  if (lowerPrompt.includes('remove background') || lowerPrompt.includes('remove bg')) {
    return {
      model: MODELS.REMBG,
      params: {
        model: 'u2net',
      }
    };
  }
  
  // Adding objects to image - use SDXL img2img for much better quality
  if (lowerPrompt.match(/add|insert|place|put|include|give/i) && !hasMask) {
    // SDXL img2img produces much better results than InstructPix2Pix
    return {
      model: MODELS.SDXL_IMG2IMG,
      params: {
        prompt: `${prompt}, high quality, photorealistic, detailed, 8k uhd`,
        negative_prompt: "ugly, distorted, blurry, low quality, artifacts, extra limbs, bad anatomy",
        image: true,  // Flag to indicate we're using the image
        num_inference_steps: 30,
        guidance_scale: 7.5,
        prompt_strength: 0.65,  // Balance between prompt and preserving original (0.5-0.8)
        scheduler: "K_EULER",
        num_outputs: 1,
        refine: "expert_ensemble_refiner",
        high_noise_frac: 0.8,
        apply_watermark: false,
      }
    };
  }
  
  // Object removal - use InstructPix2Pix
  if (lowerPrompt.match(/remove|delete|erase|get rid of/i) && !hasMask) {
    return {
      model: MODELS.INSTRUCT_PIX2PIX,
      params: {
        prompt: prompt,
        negative_prompt: "distorted, blurry, low quality, artifacts",
        num_inference_steps: 25,
        guidance_scale: 10,
        image_guidance_scale: 1.5,
      }
    };
  }
  
  // Quality enhancement
  if (lowerPrompt.match(/enhance|upscale|sharpen|quality|clearer|hd|4k/i)) {
    return {
      model: MODELS.REAL_ESRGAN,
      params: {
        scale: 2,
        face_enhance: lowerPrompt.includes('face'),
      }
    };
  }
  
  // General text-based editing (default) - use SDXL img2img for best quality
  return {
    model: MODELS.SDXL_IMG2IMG,
    params: {
      prompt: `${prompt}, high quality, photorealistic, detailed`,
      negative_prompt: "ugly, distorted, blurry, low quality, artifacts",
      image: true,
      num_inference_steps: 25,
      guidance_scale: 7.5,
      prompt_strength: 0.7,
      scheduler: "K_EULER",
      num_outputs: 1,
      refine: "expert_ensemble_refiner",
      high_noise_frac: 0.8,
      apply_watermark: false,
    }
  };
}

// Get nearest supported dimensions for SDXL (must be divisible by 8)
function getNearestSupportedDimensions(idealWidth: number = 1024, idealHeight: number = 1024): { width: number, height: number } {
  // SDXL supports these dimensions well
  const supportedSizes = [
    { width: 1024, height: 1024 },
    { width: 1152, height: 896 },
    { width: 896, height: 1152 },
    { width: 1216, height: 832 },
    { width: 832, height: 1216 },
    { width: 1344, height: 768 },
    { width: 768, height: 1344 },
    { width: 1536, height: 640 },
    { width: 640, height: 1536 },
  ];
  
  const aspectRatio = idealWidth / idealHeight;
  
  // Find the closest aspect ratio
  let bestMatch = supportedSizes[0];
  let minDiff = Math.abs((bestMatch.width / bestMatch.height) - aspectRatio);
  
  for (const size of supportedSizes) {
    const diff = Math.abs((size.width / size.height) - aspectRatio);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = size;
    }
  }
  
  return bestMatch;
}

// Convert base64 to URL for Replicate
async function base64ToUrl(base64String: string): Promise<string> {
  // Remove data:image/xxx;base64, prefix
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
  
  // For development, we'll use a data URI directly
  // In production, you might want to upload to a temporary storage
  return base64String;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, prompt, mask } = req.body;

    if (!image || !prompt) {
      return res.status(400).json({ error: 'Image and prompt are required' });
    }

    console.log('AI Edit Request:', { 
      prompt, 
      hasMask: !!mask,
      imageSize: image.length,
      maskSize: mask ? mask.length : 0 
    });
    
    // Debug: Check mask format
    if (mask) {
      console.log('Mask data preview:', mask.substring(0, 50));
      console.log('Mask appears to be:', mask.startsWith('data:image') ? 'valid image' : 'invalid format');
    }

    // Select the appropriate model based on the prompt
    const { model, params } = selectModel(prompt, !!mask);
    console.log('Selected model:', model.split(':')[0].split('/')[1]);

    // Prepare input based on model
    let input: any = { ...params };
    
    if (model === MODELS.SDXL_IMG2IMG) {
      // SDXL img2img model
      input.image = image;
      delete params.image;  // Remove the flag
      
      // Map prompt_strength to the correct parameter name
      if (params.prompt_strength) {
        input.prompt_strength = params.prompt_strength;
      }
    } else if (model === MODELS.SDXL_GENERATE) {
      // SDXL text-to-image (shouldn't be used for editing but keeping for completeness)
      delete input.image;
    } else if (model === MODELS.CONTROLNET_SDXL) {
      // ControlNet needs special handling
      input.image = image;
      input.condition_scale = params.condition_scale || 0.5;
    } else if (model === MODELS.INSTRUCT_PIX2PIX) {
      input.image = image;
    } else if (model === MODELS.LAMA || model === MODELS.ERASER) {
      // These inpainting models need image and mask
      input.image = image;
      input.mask = mask;
      if (params.prompt) {
        input.prompt = params.prompt;
      }
    } else if (model === MODELS.CONTROLNET_CANNY) {
      // ControlNet needs the image as control input
      input.image = image;
      input.prompt = params.prompt || prompt;
      input.a_prompt = "best quality, extremely detailed";
      input.n_prompt = params.negative_prompt || "longbody, lowres, bad anatomy, bad hands, missing fingers";
    } else if (model === MODELS.SDXL_INPAINTING) {
      input.image = image;
      if (mask) {
        input.mask = mask;
        console.log('Adding mask to SDXL_INPAINTING input');
      } else {
        console.log('WARNING: No mask provided for SDXL_INPAINTING');
      }
      input.prompt = params.prompt || prompt;
      input.negative_prompt = params.negative_prompt || "ugly, distorted, blurry";
      
      // Use supported dimensions - don't specify width/height, let model handle it
      // The model will preserve the original image dimensions
      
      input.num_inference_steps = params.num_inference_steps || 30;
      input.guidance_scale = params.guidance_scale || 7.5;
      input.strength = params.strength || 1.0;
      input.refine = "expert_ensemble_refiner";
      input.scheduler = "K_EULER";
      input.seed = Math.floor(Math.random() * 1000000);
      console.log('SDXL_INPAINTING full input params:', {
        hasImage: !!input.image,
        hasMask: !!input.mask,
        prompt: input.prompt,
        strength: input.strength
      });
    } else if (model === MODELS.REAL_ESRGAN) {
      input.img = image;
    } else if (model === MODELS.REMBG) {
      input.image = image;
    } else {
      input.image = image;
    }

    // Run the model with retry logic for false NSFW detections
    console.log('Running Replicate model...');
    let output;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        output = await replicate.run(model as `${string}/${string}:${string}`, { input });
        break; // Success, exit the retry loop
      } catch (error: any) {
        // Check if it's a false NSFW detection
        if (error.message?.includes('NSFW content detected') && retryCount < maxRetries) {
          console.log(`False NSFW detection (attempt ${retryCount + 1}/${maxRetries + 1}), retrying with modified seed...`);
          retryCount++;
          
          // Modify the input slightly to bypass false positive
          if ('seed' in input) {
            input.seed = Math.floor(Math.random() * 1000000);
          }
          if ('prompt' in input) {
            // Add a safety prefix to the prompt
            input.prompt = `family-friendly, safe for work, ${input.prompt}`;
          }
          if ('negative_prompt' in input) {
            input.negative_prompt = `nsfw, adult content, inappropriate, ${input.negative_prompt}`;
          }
          
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          // Re-throw if it's not an NSFW error or we've exhausted retries
          throw error;
        }
      }
    }
    
    if (!output) {
      throw new Error('Failed to generate image after multiple attempts');
    }

    console.log('Raw output from Replicate:', typeof output, output);

    // Handle different output formats from different models
    let resultImage = '';
    
    // Helper function to check if object is a ReadableStream
    const isReadableStream = (obj: any): boolean => {
      return obj && typeof obj === 'object' && typeof obj.getReader === 'function';
    };
    
    // Helper function to handle ReadableStream
    const handleStream = async (stream: any): Promise<string> => {
      if (isReadableStream(stream)) {
        // This is a ReadableStream, we need to read it
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          
          // Combine chunks and convert to string
          const fullArray = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
          let offset = 0;
          for (const chunk of chunks) {
            fullArray.set(chunk, offset);
            offset += chunk.length;
          }
          
          // Convert to base64 data URL
          const base64 = Buffer.from(fullArray).toString('base64');
          console.log('Converted stream to base64, length:', base64.length);
          
          // Try to detect image type from first bytes
          let mimeType = 'image/png';
          if (fullArray[0] === 0xFF && fullArray[1] === 0xD8) {
            mimeType = 'image/jpeg';
          } else if (fullArray[0] === 0x89 && fullArray[1] === 0x50) {
            mimeType = 'image/png';
          }
          
          console.log('Detected MIME type:', mimeType);
          return `data:${mimeType};base64,${base64}`;
        } catch (error) {
          console.error('Error reading stream:', error);
          throw error;
        }
      }
      return '';
    };
    
    // Check various possible output formats
    if (typeof output === 'string') {
      // Direct string URL
      resultImage = output;
    } else if (Array.isArray(output) && output.length > 0) {
      // Array - check if first element is a stream or string
      const firstElement = output[0];
      if (typeof firstElement === 'string') {
        resultImage = firstElement;
      } else if (isReadableStream(firstElement)) {
        console.log('Processing ReadableStream from array...');
        resultImage = await handleStream(firstElement);
      } else {
        console.log('Unknown array element type:', typeof firstElement, firstElement);
      }
    } else if (output && typeof output === 'object') {
      // Check if it's a ReadableStream directly
      if (isReadableStream(output)) {
        console.log('Processing ReadableStream directly...');
        resultImage = await handleStream(output);
      } else if ('output' in output) {
        resultImage = (output as any).output;
      } else if ('image' in output) {
        resultImage = (output as any).image;
      } else if ('uri' in output) {
        resultImage = (output as any).uri;
      } else if ('url' in output) {
        resultImage = (output as any).url;
      } else {
        // Try to find any string value in the object
        const values = Object.values(output);
        const stringValue = values.find(v => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:')));
        if (stringValue) {
          resultImage = stringValue as string;
        }
      }
    }

    if (!resultImage) {
      console.error('Failed to extract image from output:', output);
      throw new Error('No output received from model. Output format: ' + JSON.stringify(output).substring(0, 200));
    }

    console.log('AI edit completed successfully');
    console.log('Result image type:', typeof resultImage);
    console.log('Result image length:', resultImage.length);
    console.log('Result image preview:', resultImage.substring(0, 100));

    return res.status(200).json({
      success: true,
      editedImage: resultImage,
      modelUsed: model.split(':')[0],
      prompt: prompt,
    });

  } catch (error: any) {
    console.error('AI Edit Error:', error);
    
    // Handle specific Replicate errors
    if (error.message?.includes('NSFW content detected')) {
      return res.status(500).json({
        success: false,
        error: 'The AI safety filter was triggered incorrectly. Please try again with a slightly different prompt, or add words like "family-friendly" or "cartoon" to your prompt.',
      });
    }
    
    if (error.response) {
      return res.status(500).json({
        success: false,
        error: `Replicate API error: ${error.response.status} - ${error.response.data?.detail || 'Unknown error'}`,
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process image',
    });
  }
}