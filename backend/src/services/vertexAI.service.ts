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
  private requestCounts: Map<string, { count: number; resetTime: number }> =
    new Map();
  private readonly MAX_REQUESTS_PER_HOUR = 50;
  private readonly RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

  // Retry configuration
  private readonly MAX_RETRIES = 5; // Increased to 5 retries with improved prompts
  private readonly INITIAL_RETRY_DELAY = 500; // 0.5 seconds (reduced for faster retries)
  private readonly MAX_RETRY_DELAY = 5000; // 5 seconds (reduced max delay)
  private readonly REQUEST_TIMEOUT = 40000; // 40 seconds (increased for complex edits)

  // Cost tracking
  private readonly COST_PER_EDIT = 0.05; // $0.05 per edit (Gemini Flash Image)
  private readonly COST_PER_GENERATE = 0.05; // $0.05 per generation (Imagen 3)
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
      // Handle credentials from environment variable (Railway deployment)
      // Railway can't mount files, so we read credentials from JSON string in env var
      const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      let googleAuthOptions: any = undefined;

      if (credentialsJson) {
        try {
          // Parse credentials from JSON string
          const credentials = JSON.parse(credentialsJson);
          googleAuthOptions = { credentials };
          console.log(
            `🔑 Using Vertex AI credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON`,
          );
        } catch (error) {
          console.error(
            '❌ Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:',
            error,
          );
        }
      } else {
        // Fall back to default credentials (local development with gcloud auth)
        console.log(
          `🔑 Using default Vertex AI credentials (local development mode)`,
        );
      }

      // Initialize Vertex AI client
      this.vertexAI = new VertexAI({
        project: this.projectId,
        location: this.location,
        ...(googleAuthOptions && { googleAuthOptions }),
      });

      console.log(
        `✅ Vertex AI initialized: Project=${this.projectId}, Location=${this.location}`,
      );
      this.initialized = true;
    } else {
      console.warn(
        '⚠️  Vertex AI not initialized: GOOGLE_CLOUD_PROJECT_ID not set',
      );
      this.initialized = true; // Mark as initialized to avoid repeated warnings
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

      // Resize image to target dimensions maintaining aspect ratio
      // Use 'cover' to fill the area completely while maintaining aspect ratio (minimal crop)
      const resizedBuffer = await sharp(imageBuffer)
        .resize(targetWidth, targetHeight, {
          fit: 'cover', // Maintain aspect ratio, crop minimally if needed
          position: 'center', // Center the content when cropping
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

      console.log(
        `⏳ Retry attempt ${retryCount + 1}/${this.MAX_RETRIES} after ${delay}ms`,
      );
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

    // CRITICAL: Retry when Gemini returns text instead of image
    // This happens randomly and retrying with a different prompt usually fixes it
    if (
      error.message?.includes('No edited image returned') ||
      error.message?.includes('No generated image returned')
    ) {
      return true;
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
  private checkRateLimit(userId: string): {
    allowed: boolean;
    remaining: number;
  } {
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
      const timeUntilReset = Math.ceil(
        (currentLimit.resetTime - now) / 1000 / 60,
      ); // minutes
      return { allowed: false, remaining: 0 };
    }

    currentLimit.count++;
    return {
      allowed: true,
      remaining: this.MAX_REQUESTS_PER_HOUR - currentLimit.count,
    };
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
        error:
          'Vertex AI is not configured. Please set GOOGLE_CLOUD_PROJECT_ID environment variable.',
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

      // Wrap the entire API call AND response parsing in retry logic
      let retryAttempt = 0;
      const editedImageBase64 = await this.retryWithBackoff(async () => {
        // Get the generative model with explicit system instruction for editing
        const generativeModel = this.vertexAI!.getGenerativeModel({
          model: this.editModel,
          systemInstruction: {
            role: 'system',
            parts: [
              {
                text: 'You are an image editing AI. When given an image and editing instructions, you must ALWAYS return an edited image. NEVER return text descriptions, explanations, or analyses. Your only output should be the modified image data. Do not use vision or description mode - only editing mode.',
              },
            ],
          },
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

        // Prepare the request with MAXIMUM explicit editing instruction
        // For Gemini 2.5 Flash Image editing, be EXTREMELY clear about the task
        // Key strategies to force image output:
        // 1. Use imperative commands
        // 2. Explicitly state "DO NOT describe" and "DO NOT explain"
        // 3. State the expected output format
        // 4. Vary slightly on retries for robustness
        const editPrompts = [
          `CRITICAL: This is an IMAGE EDITING task. DO NOT describe or analyze the image. DO NOT return text explanations.

TASK: Edit and modify this image according to the following instruction:
${request.prompt}

REQUIRED OUTPUT: Return the edited image as image data. Do not include any text, descriptions, or explanations.`,

          `IMAGE EDITING MODE ONLY - NO TEXT OUTPUT ALLOWED

Your task is to edit the provided image with this modification:
${request.prompt}

IMPORTANT:
- Return ONLY the edited image
- DO NOT describe what you see
- DO NOT explain the changes
- Output format: Image file only`,

          `[IMAGE MODIFICATION REQUEST]

Apply the following edit to the image:
${request.prompt}

OUTPUT REQUIREMENTS:
✓ Return edited image data
✗ Do NOT return text descriptions
✗ Do NOT analyze or explain
✗ Do NOT use vision mode`,

          `INSTRUCTION: Perform image editing operation.

Edit request: ${request.prompt}

STRICT REQUIREMENTS:
1. Output type: Image only (no text)
2. Do not describe the image
3. Do not explain your changes
4. Return the modified image file`,

          `Edit the image: ${request.prompt}

CRITICAL: Your response must be an edited image, not text. Do not activate vision/description capabilities. Editing mode only.`,
        ];
        const editPrompt = editPrompts[retryAttempt % editPrompts.length];
        retryAttempt++;

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
          // Generation config to reduce hallucination and encourage image output
          generationConfig: {
            temperature: 0.4, // Lower temperature = more focused, less creative = more likely to follow instructions
            topP: 0.8, // Slightly constrained sampling
            topK: 40, // Limit token choices
            maxOutputTokens: 8192, // Allow space for large image output
          },
        };

        // Generate content with Gemini 2.5 Flash Image (with timeout)
        const result = await this.executeWithTimeout(
          generativeModel.generateContent(requestContent),
          this.REQUEST_TIMEOUT,
        );

        const response = result.response;

        // Debug: Log the entire response structure
        console.log(
          '🔍 Full API Response:',
          JSON.stringify(
            {
              hasCandidates: !!response.candidates,
              candidatesLength: response.candidates?.length,
              promptFeedback: response.promptFeedback,
            },
            null,
            2,
          ),
        );

        // Extract edited image from response
        const candidates = response.candidates;
        if (!candidates || candidates.length === 0) {
          console.error(
            '❌ No candidates in response. Prompt may have been blocked.',
          );
          console.error('Prompt feedback:', response.promptFeedback);
          throw new Error(
            'No candidates returned from Gemini. This could be due to safety filters or the model not supporting this type of edit.',
          );
        }

        const candidate = candidates[0];
        console.log(
          '🔍 Candidate structure:',
          JSON.stringify(
            {
              hasContent: !!candidate.content,
              hasParts: !!candidate.content?.parts,
              partsLength: candidate.content?.parts?.length,
              finishReason: candidate.finishReason,
              safetyRatings: candidate.safetyRatings,
            },
            null,
            2,
          ),
        );

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
        let foundImageBase64: string | undefined;
        for (const part of parts) {
          if (part.inlineData) {
            foundImageBase64 = part.inlineData.data;
            console.log(
              `✅ Found image data: ${foundImageBase64.length} characters`,
            );
            break;
          }
        }

        if (!foundImageBase64) {
          // If no image returned, Gemini might have returned text explanation
          const textResponse = parts.map((p) => p.text).join('');
          console.log('📝 Gemini response (text only):', textResponse);
          throw new Error(
            'No edited image returned from Gemini 2.5 Flash Image. The model may have interpreted this as a vision task instead of an image editing task, or safety filters blocked the edit.',
          );
        }

        // Return the image data (this will be retried if it fails)
        return foundImageBase64;
      });

      // For edits, we don't resize - frontend sends the image at the correct size already
      // Gemini processes it and returns it at approximately the same dimensions
      // Convert base64 to data URL
      const editedImageUrl = `data:image/png;base64,${editedImageBase64}`;

      // Track cost
      this.totalEditRequests++;
      this.totalEditCost += this.COST_PER_EDIT;

      console.log(`✅ Image edited successfully for user ${userId}`);
      console.log(
        `💰 Edit cost: $${this.COST_PER_EDIT.toFixed(3)} this request | $${this.totalEditCost.toFixed(2)} total (${this.totalEditRequests} edits)`,
      );

      return {
        success: true,
        editedImageUrl,
      };
    } catch (error) {
      console.error('❌ Error editing image with Vertex AI:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Generate an image using Imagen 3
   */
  async generateImage(
    request: ImageGenerateRequest,
  ): Promise<ImageGenerateResponse> {
    // Initialize Vertex AI if not already done
    this.initialize();

    const userId = request.userId || 'anonymous';

    // Check if Vertex AI is initialized
    if (!this.vertexAI || !this.projectId) {
      return {
        success: false,
        error:
          'Vertex AI is not configured. Please set GOOGLE_CLOUD_PROJECT_ID environment variable.',
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
      console.log(
        `   Dimensions: ${request.width || 1024}x${request.height || 1024}`,
      );
      console.log(`   Rate limit: ${rateLimit.remaining} requests remaining`);

      // Wrap the entire API call in retry and timeout logic
      const result = await this.retryWithBackoff(async () => {
        // Get the Gemini model for image generation
        const imagenModel = this.vertexAI!.getGenerativeModel({
          model: this.generateModel,
        });

        // Build the prompt (include negative prompt if provided)
        // Prepend "Generate an image:" to clearly indicate we want generation, not editing
        // Add orientation guidance based on aspect ratio
        const aspectRatio =
          request.width && request.height ? request.width / request.height : 1;
        const orientationHint =
          aspectRatio < 0.8
            ? ' in vertical portrait orientation'
            : aspectRatio > 1.2
              ? ' in horizontal landscape orientation'
              : '';

        let fullPrompt = `Generate an image${orientationHint}: ${request.prompt}`;
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
      console.log(
        '🔍 Full API Response:',
        JSON.stringify(
          {
            hasCandidates: !!response.candidates,
            candidatesLength: response.candidates?.length,
            promptFeedback: response.promptFeedback,
          },
          null,
          2,
        ),
      );

      // Extract generated image from response
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        console.error(
          '❌ No candidates in response. Prompt may have been blocked.',
        );
        console.error('Prompt feedback:', response.promptFeedback);
        throw new Error(
          'No candidates returned from Imagen 3. This could be due to safety filters or inappropriate content in the prompt.',
        );
      }

      const candidate = candidates[0];
      console.log(
        '🔍 Candidate structure:',
        JSON.stringify(
          {
            hasContent: !!candidate.content,
            hasParts: !!candidate.content?.parts,
            partsLength: candidate.content?.parts?.length,
            finishReason: candidate.finishReason,
            safetyRatings: candidate.safetyRatings,
          },
          null,
          2,
        ),
      );

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
          console.log(
            `✅ Found image data: ${generatedImageBase64.length} characters`,
          );
          break;
        }
      }

      if (!generatedImageBase64) {
        // If no image returned, Imagen might have returned text explanation
        const textResponse = parts.map((p) => p.text).join('');
        console.log('📝 Imagen response (text only):', textResponse);
        throw new Error(
          'No generated image returned from Imagen 3. The model may have blocked the prompt due to safety filters.',
        );
      }

      // Resize if dimensions are specified
      let finalImageBase64 = generatedImageBase64;
      if (request.width && request.height) {
        console.log(
          `🔧 Resizing generated image to ${request.width}x${request.height}px...`,
        );
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
      console.log(
        `💰 Generation cost: $${this.COST_PER_GENERATE.toFixed(3)} this request | $${this.totalGenerateCost.toFixed(2)} total (${this.totalGenerateRequests} generations)`,
      );

      return {
        success: true,
        generatedImageUrl,
      };
    } catch (error) {
      console.error('❌ Error generating image with Imagen 3:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Edit image with text prompt (simplified API)
   */
  async editWithPrompt(
    imageUrl: string,
    prompt: string,
    userId?: string,
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
  getUserStats(userId: string): {
    requestsUsed: number;
    requestsRemaining: number;
    resetTime: number;
  } {
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
      requestsRemaining: Math.max(
        0,
        this.MAX_REQUESTS_PER_HOUR - userLimit.count,
      ),
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
