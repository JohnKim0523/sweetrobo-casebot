import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { vertexAIService } from '../services/vertexAI.service';

@Controller('api')
export class AiController {
  /**
   * AI Edit endpoint - Edit images using Gemini 2.5 Flash Image
   * POST /api/ai-edit
   */
  @Post('ai-edit')
  async aiEdit(@Body() body: {
    image: string;
    prompt: string;
    mask?: string;
    userId?: string;
    width?: number;
    height?: number;
  }) {
    try {
      console.log('📥 AI Edit request received (Vertex AI)');
      console.log(`📝 Prompt: ${body.prompt}`);
      console.log(`🎭 Has mask: ${!!body.mask}`);
      console.log(`📐 Target dimensions: ${body.width || 'auto'}x${body.height || 'auto'}`);
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

      throw new HttpException(
        error instanceof Error ? error.message : 'AI processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * AI Create endpoint - Generate images from text using Imagen 3
   * POST /api/ai-create
   */
  @Post('ai-create')
  async aiCreate(@Body() body: {
    prompt: string;
    negativePrompt?: string;
    stylePreset?: string;
    width?: number;
    height?: number;
    userId?: string;
  }) {
    try {
      console.log('📥 AI Create request received (Imagen 3)');
      console.log(`📝 Prompt: ${body.prompt}`);
      console.log(`📐 Dimensions: ${body.width || 1024}x${body.height || 1024}`);
      console.log(`👤 User ID: ${body.userId || 'anonymous'}`);

      if (!body.prompt) {
        throw new HttpException(
          'Prompt is required',
          HttpStatus.BAD_REQUEST,
        );
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
        throw new HttpException(
          result.error || 'AI generation failed',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      console.log('✅ AI generation successful (Imagen 3)');
      return {
        success: true,
        imageUrl: result.generatedImageUrl,
      };
    } catch (error) {
      console.error('💥 AI Create error:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        error instanceof Error ? error.message : 'AI generation failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
