import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { vertexAIService } from './services/vertexAI.service';
import { aiUsageService } from './services/ai-usage.service';

interface EditImageDto {
  imageUrl: string;
  prompt: string;
  userId?: string;
  machineId?: string; // For AI usage tracking
  sessionId?: string; // For AI usage tracking
}

@Controller('api/vertex-ai')
export class VertexAIController {
  /**
   * Edit an image using Gemini 2.0 Flash
   * POST /api/vertex-ai/edit-image
   */
  @Post('edit-image')
  async editImage(@Body() dto: EditImageDto) {
    try {
      console.log('📥 Received edit-image request:', {
        imageUrlLength: dto.imageUrl?.length,
        prompt: dto.prompt,
        userId: dto.userId,
      });

      if (!dto.imageUrl || !dto.prompt) {
        throw new HttpException(
          'imageUrl and prompt are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await vertexAIService.editImage({
        imageUrl: dto.imageUrl,
        prompt: dto.prompt,
        userId: dto.userId || 'anonymous',
      });

      console.log('🔄 Service result:', {
        success: result.success,
        error: result.error,
        hasEditedImage: !!result.editedImageUrl,
      });

      if (!result.success) {
        console.error('❌ Service returned error:', result.error);
        throw new HttpException(
          result.error || 'Failed to edit image',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Log AI usage to DynamoDB (non-blocking)
      aiUsageService
        .logUsage({
          machineId: dto.machineId || 'unknown',
          type: 'edit',
          sessionId: dto.sessionId || 'unknown',
          prompt: dto.prompt,
        })
        .catch((err) => console.error('Failed to log AI usage:', err));

      return {
        success: true,
        editedImageUrl: result.editedImageUrl,
      };
    } catch (error) {
      console.error('💥 Error in editImage endpoint:', error);
      console.error(
        'Error stack:',
        error instanceof Error ? error.stack : 'No stack trace',
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        error instanceof Error ? error.message : 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get usage statistics for a user
   * GET /api/vertex-ai/usage/:userId
   */
  @Get('usage/:userId')
  getUserUsage(@Param('userId') userId: string) {
    try {
      const stats = vertexAIService.getUserStats(userId);

      return {
        success: true,
        stats: {
          requestsUsed: stats.requestsUsed,
          requestsRemaining: stats.requestsRemaining,
          resetTime: new Date(stats.resetTime).toISOString(),
        },
      };
    } catch (error) {
      console.error('Error in getUserUsage endpoint:', error);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get cost statistics
   * GET /api/vertex-ai/costs
   */
  @Get('costs')
  getCostStats() {
    try {
      const stats = vertexAIService.getCostStats();

      return {
        success: true,
        costs: {
          totalCost: `$${stats.totalCost.toFixed(2)}`,
          totalRequests: stats.totalRequests,
          breakdown: {
            edits: {
              cost: `$${stats.editCost.toFixed(2)}`,
              requests: stats.editRequests,
              costPerRequest: `$${stats.costPerEdit.toFixed(3)}`,
            },
            generations: {
              cost: `$${stats.generateCost.toFixed(2)}`,
              requests: stats.generateRequests,
              costPerRequest: `$${stats.costPerGenerate.toFixed(3)}`,
            },
          },
          estimatedDailyCost: `$${stats.totalCost.toFixed(2)}`,
          estimatedMonthlyCost: `$${(stats.totalCost * 30).toFixed(2)}`,
        },
      };
    } catch (error) {
      console.error('Error in getCostStats endpoint:', error);
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Health check endpoint
   * GET /api/vertex-ai/health
   */
  @Get('health')
  async healthCheck() {
    try {
      const isHealthy = await vertexAIService.healthCheck();

      return {
        success: true,
        healthy: isHealthy,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        success: false,
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
