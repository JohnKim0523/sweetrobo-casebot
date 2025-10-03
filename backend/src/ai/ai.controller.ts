import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { S3Service } from '../s3/s3.service';
import * as fal from '@fal-ai/serverless-client';

@Controller('api')
export class AiController {
  constructor(private readonly s3Service: S3Service) {
    // Initialize FAL client with API key from environment
    if (process.env.FAL_KEY) {
      fal.config({
        credentials: process.env.FAL_KEY,
      });
    }
  }

  @Post('ai-edit')
  async aiEdit(@Body() body: { 
    image: string; 
    prompt: string;
    mask?: string;
  }) {
    try {
      console.log('🎨 AI Edit request received');
      console.log(`📝 Prompt: ${body.prompt}`);
      console.log(`🎭 Has mask: ${!!body.mask}`);
      
      if (!process.env.FAL_KEY) {
        throw new HttpException(
          'AI service not configured',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      if (!body.image || !body.prompt) {
        throw new HttpException(
          'Image and prompt are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Prepare the request based on whether we have a mask
      let result;
      
      if (body.mask) {
        // Inpainting with mask using Flux Fill Pro
        console.log('🎭 Using Flux Fill Pro for inpainting with mask');
        result = await fal.subscribe('fal-ai/flux-pro/v1.1/fill', {
          input: {
            image_url: body.image,
            mask_url: body.mask,
            prompt: body.prompt,
            guidance_scale: 30,
            num_inference_steps: 50,
            seed: Math.floor(Math.random() * 1000000),
            safety_tolerance: 2,
          },
        });
      } else {
        // Image-to-image without mask using Flux Redux Pro
        console.log('🖼️ Using Flux Redux Pro for image-to-image transformation');
        result = await fal.subscribe('fal-ai/flux-pro/v1.1/redux', {
          input: {
            prompt: body.prompt,
            image_url: body.image,
            guidance_scale: 3.5,
            num_inference_steps: 50,
            seed: Math.floor(Math.random() * 1000000),
            safety_tolerance: 2,
          },
        });
      }

      const typedResult = result as any;
      if (typedResult.images && typedResult.images.length > 0) {
        console.log('✅ AI edit successful');
        return {
          success: true,
          imageUrl: typedResult.images[0].url,
          width: typedResult.images[0].width,
          height: typedResult.images[0].height,
        };
      } else {
        throw new Error('No image generated');
      }
    } catch (error) {
      console.error('AI Edit error:', error);

      // Check for specific error types
      if (error.body?.detail?.includes('balance') || error.body?.detail?.includes('Exhausted balance')) {
        throw new HttpException(
          'Insufficient funds. Exhausted balance. Please top up at fal.ai/dashboard/billing.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      if (error.message?.includes('safety')) {
        throw new HttpException(
          'Content blocked by safety filter. Please try a different prompt.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      if (error.message?.includes('rate limit')) {
        throw new HttpException(
          'Rate limit exceeded. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new HttpException(
        error.message || 'AI processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('ai-create')
  async aiCreate(@Body() body: {
    prompt: string;
    negativePrompt?: string;
    stylePreset?: string;
    width?: number;
    height?: number;
  }) {
    try {
      console.log('🎨 AI Create request received');
      console.log(`📝 Prompt: ${body.prompt}`);
      console.log(`📐 Dimensions: ${body.width}x${body.height}`);

      if (!process.env.FAL_KEY) {
        throw new HttpException(
          'AI service not configured',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      if (!body.prompt) {
        throw new HttpException(
          'Prompt is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Determine image size based on provided dimensions or default to square
      let imageSize = "square";
      if (body.width && body.height) {
        const aspectRatio = body.width / body.height;
        if (aspectRatio > 1.2) {
          imageSize = "landscape_16_9";
        } else if (aspectRatio < 0.8) {
          imageSize = "portrait_16_9";
        } else {
          imageSize = "square";
        }
        console.log(`📏 Calculated aspect ratio: ${aspectRatio.toFixed(2)}, using size: ${imageSize}`);
      }

      const result = await fal.subscribe('fal-ai/stable-diffusion-v3-medium', {
        input: {
          prompt: body.prompt,
          negative_prompt: body.negativePrompt || "ugly, deformed, noisy, blurry, distorted, grainy, low quality, nsfw, nude, explicit",
          image_size: imageSize,
          num_inference_steps: 28,
          guidance_scale: 7.5,
          num_images: 1,
          seed: Math.floor(Math.random() * 1000000),
        },
      });

      const typedResult = result as any;
      if (typedResult.images && typedResult.images.length > 0) {
        console.log('✅ AI creation successful');
        
        // Optionally save to S3
        const imageUrl = typedResult.images[0].url;
        
        return {
          success: true,
          imageUrl,
          width: typedResult.images[0].width,
          height: typedResult.images[0].height,
        };
      } else {
        throw new Error('No image generated');
      }
    } catch (error) {
      console.error('AI Create error:', error);

      // Check for balance issues
      if (error.body?.detail?.includes('balance') || error.body?.detail?.includes('Exhausted balance')) {
        throw new HttpException(
          'Insufficient funds. Exhausted balance. Please top up at fal.ai/dashboard/billing.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      if (error.message?.includes('safety')) {
        throw new HttpException(
          'Content blocked by safety filter. Please try a different prompt.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      throw new HttpException(
        error.message || 'AI generation failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}