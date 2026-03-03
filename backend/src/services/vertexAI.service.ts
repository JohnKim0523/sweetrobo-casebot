import { VertexAI } from '@google-cloud/vertexai';
import * as sharp from 'sharp';

class ConcurrencySemaphore {
  private running = 0;
  private waitQueue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(
    private maxConcurrent: number = 10,
    private queueTimeout: number = 60000,
  ) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waitQueue.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waitQueue.splice(idx, 1);
        reject(new Error('QUEUE_TIMEOUT'));
      }, this.queueTimeout);

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      clearTimeout(next.timer);
      next.resolve();
    } else {
      this.running--;
    }
  }

  getStats(): { running: number; queued: number; maxConcurrent: number } {
    return {
      running: this.running,
      queued: this.waitQueue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

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

  // Concurrency control
  private semaphore = new ConcurrencySemaphore(10, 60000);

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
   * Execute a function with concurrency control
   */
  private async withConcurrencyControl<T>(fn: () => Promise<T>): Promise<T> {
    await this.semaphore.acquire();
    try {
      return await fn();
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * Get concurrency stats
   */
  getConcurrencyStats(): { running: number; queued: number; maxConcurrent: number } {
    return this.semaphore.getStats();
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

      // Strip any white/near-white margins the AI may have generated,
      // then resize to fill the target case dimensions edge-to-edge.
      // Flatten ensures a solid rectangle with no transparency (phone mask handles corner rounding)
      const trimmed = await sharp(imageBuffer)
        .trim({ threshold: 30 })
        .toBuffer();

      const resizedBuffer = await sharp(trimmed)
        .resize(targetWidth, targetHeight, {
          fit: 'cover',
          position: 'center',
        })
        .flatten()
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
    // This happens randomly and retrying usually fixes it
    if (
      error.message?.includes('No edited image returned') ||
      error.message?.includes('No generated image returned') ||
      error.message?.includes('could not generate') ||
      error.message?.includes('could not edit') ||
      error.message?.includes('not able to create') ||
      error.message?.includes('not able to generate') ||
      error.message?.includes('unable to create') ||
      error.message?.includes('unable to generate')
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

      // Wrap the entire API call AND response parsing in retry logic with concurrency control
      let retryAttempt = 0;
      const editedImageBase64 = await this.withConcurrencyControl(() => this.retryWithBackoff(async () => {
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
          const reason = candidate.finishReason || 'UNKNOWN';
          console.error(`❌ No parts in candidate response. finishReason: ${reason}`);
          const errorMessages: Record<string, string> = {
            'IMAGE_PROHIBITED_CONTENT': 'This prompt references copyrighted or trademarked content (e.g. movie characters, brand logos). Try describing the style you want instead.',
            'SAFETY': 'This prompt was blocked by safety filters. Try rephrasing with different words.',
            'RECITATION': 'This prompt was blocked because it may reproduce copyrighted material. Try a more original description.',
            'BLOCKED_REASON_UNSPECIFIED': 'This prompt was blocked for an unspecified reason. Try rephrasing.',
            'PROHIBITED_CONTENT': 'This prompt contains prohibited content. Try a different description.',
            'OTHER': 'The AI could not process this prompt. Try rephrasing.',
          };
          throw new Error(errorMessages[reason] || `AI edit failed (${reason}). Try a different prompt.`);
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
          const textResponse = parts.map((p) => p.text).join('').trim();
          console.log('📝 Gemini response (text only):', textResponse);
          throw new Error(
            'The AI couldn\'t edit this image. This may be due to copyrighted content, real people/celebrities, or safety filters. Please try again or rephrase your prompt.',
          );
        }

        // Return the image data (this will be retried if it fails)
        return foundImageBase64;
      }));

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

      // Wrap the entire API call + response validation in retry logic
      // This ensures text-refusals (model returns text instead of image) get retried automatically
      const generatedImageBase64 = await this.withConcurrencyControl(() => this.retryWithBackoff(async () => {
        // Get the Gemini model for image generation
        const imagenModel = this.vertexAI!.getGenerativeModel({
          model: this.generateModel,
        });

        // Build the prompt with orientation guidance based on aspect ratio
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
        const result = await this.executeWithTimeout(
          imagenModel.generateContent(requestContent),
          this.REQUEST_TIMEOUT,
        );

        const response = result.response;

        // Extract generated image from response
        const candidates = response.candidates;
        if (!candidates || candidates.length === 0) {
          console.error('❌ No candidates in response. Prompt may have been blocked.');
          const reason = response.promptFeedback?.blockReason || 'UNKNOWN';
          const errorMessages: Record<string, string> = {
            'IMAGE_PROHIBITED_CONTENT': 'This prompt references copyrighted or trademarked content (e.g. movie characters, brand logos). Try describing the style you want instead.',
            'SAFETY': 'This prompt was blocked by safety filters. Try rephrasing with different words.',
            'RECITATION': 'This prompt was blocked because it may reproduce copyrighted material. Try a more original description.',
            'BLOCKED_REASON_UNSPECIFIED': 'This prompt was blocked for an unspecified reason. Try rephrasing.',
            'PROHIBITED_CONTENT': 'This prompt contains prohibited content. Try a different description.',
          };
          throw new Error(errorMessages[reason] || `AI generation failed (${reason}). Try a different prompt.`);
        }

        const candidate = candidates[0];
        const parts = candidate.content?.parts;

        if (!parts || parts.length === 0) {
          const reason = candidate.finishReason || 'UNKNOWN';
          console.error(`❌ No parts in candidate response. finishReason: ${reason}`);
          const errorMessages: Record<string, string> = {
            'IMAGE_PROHIBITED_CONTENT': 'This prompt references copyrighted or trademarked content (e.g. movie characters, brand logos). Try describing the style you want instead.',
            'SAFETY': 'This prompt was blocked by safety filters. Try rephrasing with different words.',
            'RECITATION': 'This prompt was blocked because it may reproduce copyrighted material. Try a more original description.',
            'BLOCKED_REASON_UNSPECIFIED': 'This prompt was blocked for an unspecified reason. Try rephrasing.',
            'PROHIBITED_CONTENT': 'This prompt contains prohibited content. Try a different description.',
            'OTHER': 'The AI could not process this prompt. Try rephrasing.',
          };
          throw new Error(errorMessages[reason] || `AI generation failed (${reason}). Try a different prompt.`);
        }

        // Look for image data in response
        for (const part of parts) {
          if (part.inlineData) {
            console.log(`✅ Found image data: ${part.inlineData.data.length} characters`);
            return part.inlineData.data;
          }
        }

        // No image found — model returned text instead (retryable)
        const textResponse = parts.map((p) => p.text).join('').trim();
        console.log('📝 Model returned text instead of image:', textResponse);
        throw new Error('No generated image returned — model returned text instead of image');
      }));

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
   * Outpaint an image using Imagen 3 - extends the image to fill masked areas
   * This preserves the original image exactly and only fills in the masked (black) areas
   */
  async outpaintImage(request: {
    imageBase64: string; // Base64 encoded image (padded canvas with image)
    maskBase64: string; // Base64 encoded mask (white=preserve, black=fill)
    prompt?: string; // Optional prompt describing what to fill with
    userId?: string;
  }): Promise<ImageEditResponse> {
    // Initialize Vertex AI if not already done
    this.initialize();

    const userId = request.userId || 'anonymous';

    if (!this.projectId) {
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
      console.log(`🖼️ Outpainting image for user ${userId}...`);
      console.log(`   Prompt: ${request.prompt || '(empty - auto extend)'}`);
      console.log(`   Rate limit: ${rateLimit.remaining} requests remaining`);

      // Wrap entire outpaint API call in concurrency control
      const outputImageBase64 = await this.withConcurrencyControl(async () => {
        // Use Imagen 3 REST API for outpainting
        const apiEndpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/imagen-3.0-capability-001:predict`;

        // Get access token
        const { GoogleAuth } = await import('google-auth-library');

        // Handle credentials from environment variable (Railway deployment)
        const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
        let auth: any;

        if (credentialsJson) {
          const credentials = JSON.parse(credentialsJson);
          auth = new GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          });
        } else {
          auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          });
        }

        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        // Prepare the request body for Imagen 3 outpainting
        const requestBody = {
          instances: [
            {
              prompt: request.prompt || '', // Empty string = AI extends intelligently
              referenceImages: [
                {
                  referenceType: 'REFERENCE_TYPE_RAW',
                  referenceId: 1,
                  referenceImage: {
                    bytesBase64Encoded: request.imageBase64.replace(/^data:image\/\w+;base64,/, ''),
                  },
                },
                {
                  referenceType: 'REFERENCE_TYPE_MASK',
                  referenceId: 2,
                  referenceImage: {
                    bytesBase64Encoded: request.maskBase64.replace(/^data:image\/\w+;base64,/, ''),
                  },
                  maskImageConfig: {
                    maskMode: 'MASK_MODE_USER_PROVIDED',
                    dilation: 0.03, // Recommended for outpainting to avoid visible seams
                  },
                },
              ],
            },
          ],
          parameters: {
            editConfig: {
              baseSteps: 35, // Start at 35, increase if quality needs improvement
            },
            editMode: 'EDIT_MODE_OUTPAINT',
            sampleCount: 1, // Just generate 1 image
            personGeneration: 'allow_all',
          },
        };

        console.log('🚀 Sending outpaint request to Imagen 3...');

        const response = await this.executeWithTimeout(
          fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          }),
          this.REQUEST_TIMEOUT,
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Imagen 3 API error:', response.status, errorText);
          // Parse Google's error for a user-friendly message
          let userMessage = `Background fill failed (error ${response.status}). Please try again.`;
          try {
            const errorJson = JSON.parse(errorText);
            const msg = errorJson?.error?.message || '';
            if (msg.includes('Person Generation')) {
              userMessage = 'Background fill blocked: the image contains people. This should not happen — please report this issue.';
            } else if (msg.includes('blocked')) {
              userMessage = 'Background fill was blocked by safety filters. Try a different image or prompt.';
            } else if (msg) {
              userMessage = msg;
            }
          } catch {}
          throw new Error(userMessage);
        }

        const result = await response.json();
        console.log('📥 Imagen 3 response received');

        // Extract the generated image from the response
        if (!result.predictions || result.predictions.length === 0) {
          throw new Error('No predictions returned from Imagen 3');
        }

        const prediction = result.predictions[0];

        // Imagen 3 returns base64 encoded image in bytesBase64Encoded field
        const imageBase64 = prediction.bytesBase64Encoded;

        if (!imageBase64) {
          console.error('❌ No image data in prediction:', prediction);
          throw new Error('No image data returned from Imagen 3');
        }

        return imageBase64;
      });

      // Track cost (same as generation)
      this.totalGenerateRequests++;
      this.totalGenerateCost += this.COST_PER_GENERATE;

      console.log(`✅ Outpainting successful for user ${userId}`);
      console.log(`💰 Cost: $${this.COST_PER_GENERATE.toFixed(3)} this request`);

      return {
        success: true,
        editedImageUrl: `data:image/png;base64,${outputImageBase64}`,
      };
    } catch (error) {
      console.error('❌ Error outpainting image with Imagen 3:', error);
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
