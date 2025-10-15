import { VertexAI } from '@google-cloud/vertexai';
import * as sharp from 'sharp';

interface ImageEditRequest {
  imageUrl: string;
  prompt: string;
  userId?: string;
  width?: number;
  height?: number;
}

interface ImageEditResponse {
  success: boolean;
  editedImageUrl?: string;
  error?: string;
}

interface ImageGenerateRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  userId?: string;
}

interface ImageGenerateResponse {
  success: boolean;
  generatedImageUrl?: string;
  error?: string;
}

class VertexAIService {
  private vertexAI: VertexAI | null = null;
  private projectId: string | null = null;
  private location: string | null = null;
  private editModel: string = 'gemini-2.5-flash-image';
  private generateModel: string = 'gemini-2.5-flash-image'; // Same model can both edit and generate
  private initialized: boolean = false;

  // Rate limiting: Track requests per user
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly MAX_REQUESTS_PER_HOUR = 50;
  private readonly RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

  // Retry configuration
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_RETRY_DELAY = 1000; // 1 second
  private readonly MAX_RETRY_DELAY = 10000; // 10 seconds
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  // Cost tracking
  private readonly COST_PER_EDIT = 0.039; // $0.039 per edit (Gemini Flash Image)
  private readonly COST_PER_GENERATE = 0.04; // $0.04 per generation (Imagen 3)
  private totalEditCost: number = 0;
  private totalGenerateCost: number = 0;
  private totalEditRequests: number = 0;
  private totalGenerateRequests: number = 0;

  constructor() {
    // Don't initialize here - will be done lazily on first use
  }

  /**
   * Initialize Vertex AI client (lazy initialization)
   */
  private initialize() {
    if (this.initialized) {
      return;
    }

    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || null;
    this.location = process.env.VERTEX_AI_LOCATION || 'us-central1';

    if (this.projectId) {
      // Initialize Vertex AI client
      this.vertexAI = new VertexAI({
        project: this.projectId,
        location: this.location,
      });

      console.log(`✅ Vertex AI initialized: Project=${this.projectId}, Location=${this.location}`);
      this.initialized = true;
    } else {
      console.warn('⚠️  Vertex AI not initialized: GOOGLE_CLOUD_PROJECT_ID not set');
      this.initialized = true; // Mark as initialized to avoid repeated warnings
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Resize image to specific dimensions
   * Uses 'cover' fit to fill entire area (crops if needed to avoid white bars)
   */
  private async resizeImage(
    base64Image: string,
    targetWidth: number,
    targetHeight: number,
  ): Promise<string> {
    try {
      // Remove data URL prefix if present
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Resize image to fill target dimensions (crop if needed to avoid white bars)
      const resizedBuffer = await sharp(imageBuffer)
        .resize(targetWidth, targetHeight, {
          fit: 'cover',  // Fill entire area, crop if needed (no white bars)
          position: 'center',  // Center the image when cropping
        })
        .png()
        .toBuffer();

      return resizedBuffer.toString('base64');
    } catch (error) {
      console.error('Error resizing image:', error);
      throw error;
    }
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retryCount: number = 0,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retryCount >= this.MAX_RETRIES) {
        throw error;
      }

      // Check if error is retryable
      const isRetryable = this.isRetryableError(error);
      if (!isRetryable) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        this.INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
        this.MAX_RETRY_DELAY,
      );

      console.log(`⏳ Retry attempt ${retryCount + 1}/${this.MAX_RETRIES} after ${delay}ms`);
      await this.sleep(delay);

      return this.retryWithBackoff(fn, retryCount + 1);
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    if (error.message?.includes('429') || error.message?.includes('quota')) {
      return true; // Rate limit - retry
    }

    if (error.message?.includes('503') || error.message?.includes('500')) {
      return true; // Server errors - retry
    }

    return false;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Check rate limit for a user
   */
  private checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const userLimit = this.requestCounts.get(userId);

    // Clean up old entries
    if (userLimit && now > userLimit.resetTime) {
      this.requestCounts.delete(userId);
    }

    const currentLimit = this.requestCounts.get(userId);

    if (!currentLimit) {
      // First request
      this.requestCounts.set(userId, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW,
      });
      return { allowed: true, remaining: this.MAX_REQUESTS_PER_HOUR - 1 };
    }

    if (currentLimit.count >= this.MAX_REQUESTS_PER_HOUR) {
      const timeUntilReset = Math.ceil((currentLimit.resetTime - now) / 1000 / 60); // minutes
      return { allowed: false, remaining: 0 };
    }

    currentLimit.count++;
    return { allowed: true, remaining: this.MAX_REQUESTS_PER_HOUR - currentLimit.count };
  }

  /**
   * Edit an image using Gemini 2.0 Flash
   */
  async editImage(request: ImageEditRequest): Promise<ImageEditResponse> {
    // Initialize Vertex AI if not already done
    this.initialize();

    const userId = request.userId || 'anonymous';

    // Check if Vertex AI is initialized
    if (!this.vertexAI || !this.projectId) {
      return {
        success: false,
        error: 'Vertex AI is not configured. Please set GOOGLE_CLOUD_PROJECT_ID environment variable.',
      };
    }

    // Check rate limit
    const rateLimit = this.checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
      };
    }

    try {
      console.log(`🎨 Editing image for user ${userId}...`);
      console.log(`   Prompt: ${request.prompt}`);
      console.log(`   Rate limit: ${rateLimit.remaining} requests remaining`);

      // Wrap the entire API call in retry and timeout logic
      const result = await this.retryWithBackoff(async () => {
        // Get the generative model
        const generativeModel = this.vertexAI!.getGenerativeModel({
          model: this.editModel,
        });

        // Fetch image from URL with timeout
        const imageResponse = await this.executeWithTimeout(
          fetch(request.imageUrl),
          10000, // 10 second timeout for image fetch
        );

        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');

        // Prepare the request with explicit editing instruction
        // For Gemini 2.5 Flash Image editing, be explicit about the task
        const editPrompt = `Edit this image: ${request.prompt}`;

        const requestContent = {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: imageBase64,
                  },
                },
                {
                  text: editPrompt,
                },
              ],
            },
          ],
        };

        // Generate content with Gemini 2.5 Flash Image (with timeout)
        return await this.executeWithTimeout(
          generativeModel.generateContent(requestContent),
          this.REQUEST_TIMEOUT,
        );
      });

      const response = result.response;

      // Debug: Log the entire response structure
      console.log('🔍 Full API Response:', JSON.stringify({
        hasCandidates: !!response.candidates,
        candidatesLength: response.candidates?.length,
        promptFeedback: response.promptFeedback,
      }, null, 2));

      // Extract edited image from response
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        console.error('❌ No candidates in response. Prompt may have been blocked.');
        console.error('Prompt feedback:', response.promptFeedback);
        throw new Error('No candidates returned from Gemini. This could be due to safety filters or the model not supporting this type of edit.');
      }

      const candidate = candidates[0];
      console.log('🔍 Candidate structure:', JSON.stringify({
        hasContent: !!candidate.content,
        hasParts: !!candidate.content?.parts,
        partsLength: candidate.content?.parts?.length,
        finishReason: candidate.finishReason,
        safetyRatings: candidate.safetyRatings,
      }, null, 2));

      const parts = candidate.content?.parts;

      if (!parts || parts.length === 0) {
        throw new Error('No parts in candidate response');
      }

      // Debug: Log each part type
      console.log('🔍 Parts breakdown:');
      parts.forEach((part, index) => {
        console.log(`  Part ${index}:`, {
          hasText: !!part.text,
          hasInlineData: !!part.inlineData,
          inlineDataMimeType: part.inlineData?.mimeType,
          inlineDataLength: part.inlineData?.data?.length,
        });
      });

      // Look for image data in response
      let editedImageBase64: string | undefined;
      for (const part of parts) {
        if (part.inlineData) {
          editedImageBase64 = part.inlineData.data;
          console.log(`✅ Found image data: ${editedImageBase64.length} characters`);
          break;
        }
      }

      if (!editedImageBase64) {
        // If no image returned, Gemini might have returned text explanation
        const textResponse = parts.map(p => p.text).join('');
        console.log('📝 Gemini response (text only):', textResponse);
        throw new Error('No edited image returned from Gemini 2.5 Flash Image. The model may have interpreted this as a vision task instead of an image editing task, or safety filters blocked the edit.');
      }

      // For edits, we don't resize - frontend sends the image at the correct size already
      // Gemini processes it and returns it at approximately the same dimensions
      // Convert base64 to data URL
      const editedImageUrl = `data:image/png;base64,${editedImageBase64}`;

      // Track cost
      this.totalEditRequests++;
      this.totalEditCost += this.COST_PER_EDIT;

      console.log(`✅ Image edited successfully for user ${userId}`);
      console.log(`💰 Edit cost: $${this.COST_PER_EDIT.toFixed(3)} this request | $${this.totalEditCost.toFixed(2)} total (${this.totalEditRequests} edits)`);

      return {
        success: true,
        editedImageUrl,
      };
    } catch (error) {
      console.error('❌ Error editing image with Vertex AI:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Generate an image using Imagen 3
   */
  async generateImage(request: ImageGenerateRequest): Promise<ImageGenerateResponse> {
    // Initialize Vertex AI if not already done
    this.initialize();

    const userId = request.userId || 'anonymous';

    // Check if Vertex AI is initialized
    if (!this.vertexAI || !this.projectId) {
      return {
        success: false,
        error: 'Vertex AI is not configured. Please set GOOGLE_CLOUD_PROJECT_ID environment variable.',
      };
    }

    // Check rate limit (same limit as editing)
    const rateLimit = this.checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
      };
    }

    try {
      console.log(`🎨 Generating image for user ${userId}...`);
      console.log(`   Prompt: ${request.prompt}`);
      console.log(`   Dimensions: ${request.width || 1024}x${request.height || 1024}`);
      console.log(`   Rate limit: ${rateLimit.remaining} requests remaining`);

      // Wrap the entire API call in retry and timeout logic
      const result = await this.retryWithBackoff(async () => {
        // Get the Gemini model for image generation
        const imagenModel = this.vertexAI!.getGenerativeModel({
          model: this.generateModel,
        });

        // Build the prompt (include negative prompt if provided)
        // Include dimensions in the prompt to guide Imagen to generate correct aspect ratio
        const dimensionText = request.width && request.height
          ? `${request.width}x${request.height}px`
          : '1024x1024px';

        let fullPrompt = `Generate an image at ${dimensionText}: ${request.prompt}`;
        if (request.negativePrompt) {
          fullPrompt += `\n\nAvoid: ${request.negativePrompt}`;
        }

        // Prepare the request - simple format for Gemini image generation
        const requestContent = {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: fullPrompt,
                },
              ],
            },
          ],
        };

        // Generate image with Gemini (with timeout)
        return await this.executeWithTimeout(
          imagenModel.generateContent(requestContent),
          this.REQUEST_TIMEOUT,
        );
      });

      const response = result.response;

      // Debug: Log the entire response structure
      console.log('🔍 Full API Response:', JSON.stringify({
        hasCandidates: !!response.candidates,
        candidatesLength: response.candidates?.length,
        promptFeedback: response.promptFeedback,
      }, null, 2));

      // Extract generated image from response
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        console.error('❌ No candidates in response. Prompt may have been blocked.');
        console.error('Prompt feedback:', response.promptFeedback);
        throw new Error('No candidates returned from Imagen 3. This could be due to safety filters or inappropriate content in the prompt.');
      }

      const candidate = candidates[0];
      console.log('🔍 Candidate structure:', JSON.stringify({
        hasContent: !!candidate.content,
        hasParts: !!candidate.content?.parts,
        partsLength: candidate.content?.parts?.length,
        finishReason: candidate.finishReason,
        safetyRatings: candidate.safetyRatings,
      }, null, 2));

      const parts = candidate.content?.parts;

      if (!parts || parts.length === 0) {
        throw new Error('No parts in candidate response');
      }

      // Debug: Log each part type
      console.log('🔍 Parts breakdown:');
      parts.forEach((part, index) => {
        console.log(`  Part ${index}:`, {
          hasText: !!part.text,
          hasInlineData: !!part.inlineData,
          inlineDataMimeType: part.inlineData?.mimeType,
          inlineDataLength: part.inlineData?.data?.length,
        });
      });

      // Look for image data in response
      let generatedImageBase64: string | undefined;
      for (const part of parts) {
        if (part.inlineData) {
          generatedImageBase64 = part.inlineData.data;
          console.log(`✅ Found image data: ${generatedImageBase64.length} characters`);
          break;
        }
      }

      if (!generatedImageBase64) {
        // If no image returned, Imagen might have returned text explanation
        const textResponse = parts.map(p => p.text).join('');
        console.log('📝 Imagen response (text only):', textResponse);
        throw new Error('No generated image returned from Imagen 3. The model may have blocked the prompt due to safety filters.');
      }

      // Resize if dimensions are specified
      let finalImageBase64 = generatedImageBase64;
      if (request.width && request.height) {
        console.log(`🔧 Resizing generated image to ${request.width}x${request.height}px...`);
        finalImageBase64 = await this.resizeImage(
          generatedImageBase64,
          request.width,
          request.height,
        );
        console.log(`✅ Generated image resized successfully`);
      }

      // Convert base64 to data URL
      const generatedImageUrl = `data:image/png;base64,${finalImageBase64}`;

      // Track cost
      this.totalGenerateRequests++;
      this.totalGenerateCost += this.COST_PER_GENERATE;

      console.log(`✅ Image generated successfully for user ${userId}`);
      console.log(`💰 Generation cost: $${this.COST_PER_GENERATE.toFixed(3)} this request | $${this.totalGenerateCost.toFixed(2)} total (${this.totalGenerateRequests} generations)`);

      return {
        success: true,
        generatedImageUrl,
      };
    } catch (error) {
      console.error('❌ Error generating image with Imagen 3:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Edit image with text prompt (simplified API)
   */
  async editWithPrompt(
    imageUrl: string,
    prompt: string,
    userId?: string
  ): Promise<ImageEditResponse> {
    return this.editImage({ imageUrl, prompt, userId });
  }

  /**
   * Get cost statistics
   */
  getCostStats(): {
    totalCost: number;
    totalRequests: number;
    editCost: number;
    generateCost: number;
    editRequests: number;
    generateRequests: number;
    costPerEdit: number;
    costPerGenerate: number;
  } {
    return {
      totalCost: this.totalEditCost + this.totalGenerateCost,
      totalRequests: this.totalEditRequests + this.totalGenerateRequests,
      editCost: this.totalEditCost,
      generateCost: this.totalGenerateCost,
      editRequests: this.totalEditRequests,
      generateRequests: this.totalGenerateRequests,
      costPerEdit: this.COST_PER_EDIT,
      costPerGenerate: this.COST_PER_GENERATE,
    };
  }

  /**
   * Get usage statistics for a user
   */
  getUserStats(userId: string): { requestsUsed: number; requestsRemaining: number; resetTime: number } {
    const userLimit = this.requestCounts.get(userId);

    if (!userLimit) {
      return {
        requestsUsed: 0,
        requestsRemaining: this.MAX_REQUESTS_PER_HOUR,
        resetTime: Date.now() + this.RATE_LIMIT_WINDOW,
      };
    }

    return {
      requestsUsed: userLimit.count,
      requestsRemaining: Math.max(0, this.MAX_REQUESTS_PER_HOUR - userLimit.count),
      resetTime: userLimit.resetTime,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Initialize if needed
      this.initialize();

      // Simple check - verify credentials are valid
      return !!this.vertexAI && !!this.projectId;
    } catch (error) {
      console.error('Vertex AI health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const vertexAIService = new VertexAIService();
export default vertexAIService;
