import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { vertexAIService } from '../services/vertexAI.service';
import { aiUsageService } from '../services/ai-usage.service';

@Controller('api')
export class AiController {
  /**
   * AI Edit endpoint - Edit images using Gemini 2.5 Flash Image
   * POST /api/ai-edit
   */
  @Post('ai-edit')
  async aiEdit(
    @Body()
    body: {
      image: string;
      prompt: string;
      mask?: string;
      userId?: string;
      width?: number;
      height?: number;
      machineId?: string; // For AI usage tracking
      sessionId?: string; // For AI usage tracking
    },
  ) {
    try {
      console.log('📥 AI Edit request received (Vertex AI)');
      console.log(`📝 Prompt: ${body.prompt}`);
      console.log(`🎭 Has mask: ${!!body.mask}`);
      console.log(
        `📐 Target dimensions: ${body.width || 'auto'}x${body.height || 'auto'}`,
      );
      console.log(`👤 User ID: ${body.userId || 'anonymous'}`);

      if (!body.image || !body.prompt) {
        throw new HttpException(
          'Image and prompt are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Call Vertex AI service for image editing
      const result = await vertexAIService.editImage({
        imageUrl: body.image,
        prompt: body.prompt,
        userId: body.userId || 'anonymous',
        width: body.width,
        height: body.height,
      });

      if (!result.success) {
        console.error('❌ Vertex AI edit failed:', result.error);
        throw new HttpException(
          result.error || 'AI edit failed',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Log AI usage to DynamoDB (non-blocking)
      aiUsageService
        .logUsage({
          machineId: body.machineId || 'unknown',
          type: 'edit',
          sessionId: body.sessionId || 'unknown',
          prompt: body.prompt,
        })
        .catch((err) => console.error('Failed to log AI usage:', err));

      console.log('✅ AI edit successful (Vertex AI)');
      return {
        success: true,
        imageUrl: result.editedImageUrl,
      };
    } catch (error) {
      console.error('💥 AI Edit error:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof Error && error.message === 'QUEUE_TIMEOUT') {
        throw new HttpException(
          'Server is busy, please try again in a moment',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw new HttpException(
        error instanceof Error ? error.message : 'AI processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * AI Outpaint endpoint - Fill in background using Imagen 3 mask-based outpainting
   * POST /api/ai-outpaint
   * This preserves the original image exactly and only fills the masked areas
   */
  @Post('ai-outpaint')
  async aiOutpaint(
    @Body()
    body: {
      image: string; // Base64 encoded canvas image (with shrunk image + blank areas)
      mask: string; // Base64 encoded mask (white=preserve, black=fill)
      prompt?: string; // Optional prompt describing what to fill with
      userId?: string;
      machineId?: string;
      sessionId?: string;
    },
  ) {
    try {
      console.log('📥 AI Outpaint request received (Imagen 3)');
      console.log(`📝 Prompt: ${body.prompt || '(empty - auto extend)'}`);
      console.log(`🎭 Has mask: ${!!body.mask}`);
      console.log(`👤 User ID: ${body.userId || 'anonymous'}`);

      if (!body.image || !body.mask) {
        throw new HttpException(
          'Image and mask are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Call Vertex AI service for outpainting
      const result = await vertexAIService.outpaintImage({
        imageBase64: body.image,
        maskBase64: body.mask,
        prompt: body.prompt,
        userId: body.userId || 'anonymous',
      });

      if (!result.success) {
        console.error('❌ Imagen 3 outpaint failed:', result.error);
        throw new HttpException(
          result.error || 'AI outpaint failed',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Log AI usage to DynamoDB (non-blocking)
      aiUsageService
        .logUsage({
          machineId: body.machineId || 'unknown',
          type: 'outpaint',
          sessionId: body.sessionId || 'unknown',
          prompt: body.prompt || 'fill background',
        })
        .catch((err) => console.error('Failed to log AI usage:', err));

      console.log('✅ AI outpaint successful (Imagen 3)');
      return {
        success: true,
        imageUrl: result.editedImageUrl,
      };
    } catch (error) {
      console.error('💥 AI Outpaint error:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof Error && error.message === 'QUEUE_TIMEOUT') {
        throw new HttpException(
          'Server is busy, please try again in a moment',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw new HttpException(
        error instanceof Error ? error.message : 'AI outpainting failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * AI Create endpoint - Generate images from text using Imagen 3
   * POST /api/ai-create
   */
  @Post('ai-create')
  async aiCreate(
    @Body()
    body: {
      prompt: string;
      negativePrompt?: string;
      stylePreset?: string;
      width?: number;
      height?: number;
      userId?: string;
      machineId?: string; // For AI usage tracking
      sessionId?: string; // For AI usage tracking
    },
  ) {
    try {
      console.log('📥 AI Create request received (Imagen 3)');
      console.log(`📝 Prompt: ${body.prompt}`);
      console.log(
        `📐 Dimensions: ${body.width || 1024}x${body.height || 1024}`,
      );
      console.log(`👤 User ID: ${body.userId || 'anonymous'}`);

      if (!body.prompt) {
        throw new HttpException('Prompt is required', HttpStatus.BAD_REQUEST);
      }

      // Call Vertex AI service for image generation using Imagen 3
      const result = await vertexAIService.generateImage({
        prompt: body.prompt,
        negativePrompt: body.negativePrompt,
        width: body.width,
        height: body.height,
        userId: body.userId || 'anonymous',
      });

      if (!result.success) {
        console.error('❌ Imagen 3 generation failed:', result.error);
        return {
          success: false,
          error: result.error || 'AI generation failed. Please try again.',
        };
      }

      // Log AI usage to DynamoDB (non-blocking)
      aiUsageService
        .logUsage({
          machineId: body.machineId || 'unknown',
          type: 'generate',
          sessionId: body.sessionId || 'unknown',
          prompt: body.prompt,
        })
        .catch((err) => console.error('Failed to log AI usage:', err));

      console.log('✅ AI generation successful (Imagen 3)');
      return {
        success: true,
        imageUrl: result.generatedImageUrl,
      };
    } catch (error) {
      console.error('💥 AI Create error:', error);

      if (error instanceof Error && error.message === 'QUEUE_TIMEOUT') {
        return {
          success: false,
          error: 'Server is busy, please try again in a moment.',
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'AI generation failed. Please try again.',
      };
    }
  }
}
