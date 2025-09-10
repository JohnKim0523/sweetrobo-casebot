import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';

interface ChituConfig {
  appId: string;
  appSecret: string;
  baseUrl: string;
  isTest: boolean;
}

export interface ChituResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export interface MachineDetails {
  device_id: string;
  device_name: string;
  device_code: string;
  online_status: boolean;
  working_status: 'idle' | 'printing' | 'error' | 'maintenance';
  error_code?: string;
  error_message?: string;
  case_inventory?: number;
  ink_level?: number;
}

export interface UploadResponse {
  file_id: string;
  url: string;
  size: number;
}

export interface CreateOrderResponse {
  order_id: string;
  status: string;
  estimated_time?: number;
  queue_position?: number;
}

@Injectable()
export class ChituService {
  private config: ChituConfig;
  private apiClient: AxiosInstance;

  constructor() {
    // Load credentials from environment variables only
    this.config = {
      appId: process.env.CHITU_APP_ID || '',
      appSecret: process.env.CHITU_APP_SECRET || '',
      baseUrl: process.env.CHITU_API_URL || 'https://www.gzchitu.cn',
      isTest: process.env.CHITU_TEST_MODE !== 'false',
    };

    // Validate required configuration
    if (!this.config.appId || !this.config.appSecret) {
      console.warn('⚠️ WARNING: Chitu API credentials not configured');
      console.warn('Please set CHITU_APP_ID and CHITU_APP_SECRET in .env file');
    }

    this.apiClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('🤖 Chitu API Service initialized');
    console.log(`📍 Mode: ${this.config.isTest ? 'TEST' : 'PRODUCTION'}`);
    console.log(`🔑 App ID: ${this.config.appId}`);
  }

  /**
   * Generate signature for API requests
   * SHA256(sorted params + access_token=appSecret)
   */
  private generateSignature(params: Record<string, any>): string {
    // Remove sign field if present
    const cleanParams = { ...params };
    delete cleanParams.sign;

    // Sort parameters alphabetically
    const sortedKeys = Object.keys(cleanParams).sort();
    
    // Build string: key1=value1&key2=value2...
    const paramString = sortedKeys
      .map(key => `${key}=${cleanParams[key]}`)
      .join('&');
    
    // Append access_token
    const signString = `${paramString}&access_token=${this.config.appSecret}`;
    
    // Generate SHA256 signature
    const sign = crypto
      .createHash('sha256')
      .update(signString)
      .digest('hex');
    
    console.log(`🔐 Generated signature for: ${sortedKeys.join(', ')}`);
    return sign;
  }

  /**
   * Make authenticated API request
   */
  private async request<T = any>(
    endpoint: string,
    params: Record<string, any> = {},
    method: 'GET' | 'POST' = 'POST',
  ): Promise<ChituResponse<T> | any> {
    try {
      // Add required fields
      const requestParams: Record<string, any> = {
        ...params,
        appid: this.config.appId,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        nonce_str: crypto.randomBytes(16).toString('hex'),
      };

      // Generate signature
      requestParams.sign = this.generateSignature(requestParams);

      console.log(`\n📤 Chitu API Request: ${endpoint}`);
      console.log(`📊 Parameters: ${Object.keys(params).join(', ')}`);

      const response = await this.apiClient.request<ChituResponse<T>>({
        method,
        url: endpoint,
        [method === 'GET' ? 'params' : 'data']: requestParams,
      });

      console.log(`✅ Response Code: ${response.data?.code}`);
      console.log(`💬 Message: ${response.data?.message}`);
      console.log(`📦 Full Response:`, JSON.stringify(response.data, null, 2));

      // Check if we got a valid response structure
      // Handle both {code, message, data} and {status, msg} response formats
      if (!response.data) {
        throw new HttpException(
          'No response from Chitu API',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // Handle {status, msg} error format
      const errorResponse = response.data as any;
      if (errorResponse.status && errorResponse.status !== 200) {
        console.error('❌ Chitu API Error:', errorResponse.msg);
        if (errorResponse.msg === 'appid错误' || errorResponse.msg === 'appid error') {
          throw new HttpException(
            'Invalid APP ID - Please check your Chitu API credentials. You need a real Chitu developer account.',
            HttpStatus.UNAUTHORIZED,
          );
        }
        throw new HttpException(
          `Chitu API Error: ${errorResponse.msg}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // Handle {code, message, data} format
      if (typeof response.data.code !== 'undefined' && response.data.code !== 0) {
        throw new HttpException(
          `Chitu API Error: ${response.data.message}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      return response.data;
    } catch (error) {
      console.error(`❌ Chitu API Error:`, error.message);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to call Chitu API: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get list of all machines
   */
  async getMachineList(): Promise<any> {
    console.log('\n🏭 Getting machine list...');
    const response = await this.request('/api/openApi/machineList');
    console.log(`📋 Found ${response.data?.machines?.length || 0} machines`);
    return response.data;
  }

  /**
   * Get machine details by device ID
   */
  async getMachineDetails(deviceId: string): Promise<MachineDetails> {
    console.log(`\n🔍 Getting details for machine: ${deviceId}`);
    const response = await this.request<MachineDetails>(
      '/api/openApi/machineDetails',
      { device_id: deviceId },
    );
    
    const machine = response.data;
    if (machine) {
      console.log(`📱 Machine: ${machine.device_name}`);
      console.log(`🌐 Status: ${machine.online_status ? 'Online' : 'Offline'}`);
      console.log(`⚙️ State: ${machine.working_status}`);
    }
    
    return machine!;
  }

  /**
   * Upload file to Chitu cloud (DEPRECATED - using S3 URLs instead)
   * Keeping for backwards compatibility but not used in new flow
   */
  async uploadFile(imageBuffer: Buffer, filename: string): Promise<UploadResponse> {
    console.log(`\n⚠️ DEPRECATED: uploadFile called - should use S3 URLs instead`);
    console.log(`\n📤 Uploading file: ${filename}`);
    console.log(`📊 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
    
    // Convert buffer to base64 for upload
    const base64Data = imageBuffer.toString('base64');
    
    const response = await this.request<UploadResponse>(
      '/api/openApi/uploadFile',
      {
        file_data: base64Data,
        file_name: filename,
        file_type: 'image/png',
      },
    );
    
    if (response.data) {
      console.log(`✅ File uploaded: ${response.data.file_id}`);
    }
    return response.data!;
  }

  /**
   * Create print order for phone case using image URL
   */
  async createPhoneCaseOrder(
    deviceId: string,
    imageUrl: string,
    phoneModel?: string,
    productId?: string,
    payType?: string,
  ): Promise<CreateOrderResponse> {
    console.log(`\n🖨️ Creating print order...`);
    console.log(`📱 Machine: ${deviceId}`);
    console.log(`🔗 Image URL: ${imageUrl}`);
    
    const response = await this.request<CreateOrderResponse>(
      '/api/openApi/machineCreateOrder',
      {
        device_id: deviceId,
        image_url: imageUrl,  // Use S3 URL instead of file_id
        product_id: productId || process.env.CHITU_DEFAULT_PRODUCT_ID || 'dZesWMYqBIuCwV1qr6Ugxw==',  // From Chitu docs
        pay_type: payType || process.env.CHITU_DEFAULT_PAY_TYPE || 'nayax',  // From Chitu docs
      },
    );
    
    if (response.data) {
      console.log(`✅ Order created: ${response.data.order_id}`);
      console.log(`📍 Status: ${response.data.status}`);
    }
    
    return response.data!;
  }

  /**
   * Get order list for a machine
   */
  async getOrderList(deviceId?: string): Promise<any> {
    console.log(`\n📋 Getting order list...`);
    const params: any = {};
    if (deviceId) params.device_id = deviceId;
    
    const response = await this.request('/api/openApi/machineOrderList', params);
    console.log(`📊 Found ${response.data?.orders?.length || 0} orders`);
    return response.data;
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<any> {
    console.log(`\n🔍 Checking order status: ${orderId}`);
    const response = await this.request('/api/openApi/machineOrderList', {
      order_id: orderId,
    });
    return response.data;
  }

  /**
   * Upload custom QR code to machine
   */
  async uploadQRCode(deviceId: string, qrCodeUrl: string): Promise<any> {
    console.log(`\n📱 Uploading QR code to machine: ${deviceId}`);
    console.log(`🔗 URL: ${qrCodeUrl}`);
    
    const response = await this.request('/api/openApi/machineQRCode', {
      device_id: deviceId,
      qr_code_url: qrCodeUrl,
    });
    
    console.log(`✅ QR code uploaded successfully`);
    return response.data;
  }

  /**
   * Test complete workflow
   */
  async testWorkflow(): Promise<any> {
    console.log('\n🧪 Starting Chitu API Test Workflow...\n');
    const results: any = {
      timestamp: new Date().toISOString(),
      steps: [],
    };

    try {
      // Step 1: Get machine list
      console.log('1️⃣ Testing machine list...');
      const machines = await this.getMachineList();
      results.steps.push({
        step: 'Get Machines',
        success: true,
        machineCount: machines?.machines?.length || 0,
      });

      if (!machines?.machines?.length) {
        throw new Error('No machines found');
      }

      // Step 2: Get first machine details
      const firstMachine = machines.machines[0];
      console.log(`\n2️⃣ Testing machine details for: ${firstMachine.device_id}`);
      const machineDetails = await this.getMachineDetails(firstMachine.device_id);
      results.steps.push({
        step: 'Get Machine Details',
        success: true,
        machine: {
          id: machineDetails.device_id,
          name: machineDetails.device_name,
          online: machineDetails.online_status,
          status: machineDetails.working_status,
        },
      });

      // Step 3: Create test image URL (using a placeholder image)
      console.log('\n3️⃣ Using test image URL...');
      // In production, this would be an S3 URL from your bucket
      const testImageUrl = 'https://via.placeholder.com/400x740.png?text=Test+Phone+Case';
      
      results.steps.push({
        step: 'Test Image URL',
        success: true,
        imageUrl: testImageUrl,
      });

      // Step 4: Create print order with image URL
      console.log('\n4️⃣ Testing order creation with S3 URL...');
      const order = await this.createPhoneCaseOrder(
        firstMachine.device_id,
        testImageUrl,
        'iPhone 15',
        process.env.CHITU_DEFAULT_PRODUCT_ID,
        process.env.CHITU_DEFAULT_PAY_TYPE,
      );
      results.steps.push({
        step: 'Create Order',
        success: true,
        orderId: order.order_id,
        status: order.status,
      });

      // Step 6: Check order status
      console.log('\n6️⃣ Testing order status...');
      const orderStatus = await this.getOrderStatus(order.order_id);
      results.steps.push({
        step: 'Check Order Status',
        success: true,
        orderStatus: orderStatus,
      });

      results.success = true;
      results.message = 'All tests passed successfully!';
      
    } catch (error) {
      results.success = false;
      results.error = error.message;
      console.error('❌ Test failed:', error.message);
    }

    console.log('\n📊 Test Results:', JSON.stringify(results, null, 2));
    return results;
  }

  /**
   * Encrypt password using AES-128-CBC (for password-related APIs)
   */
  private encryptPassword(password: string): string {
    const key = this.config.appSecret.substring(0, 16);
    const iv = this.config.appSecret.substring(16, 32);
    
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    let encrypted = cipher.update(password, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return encrypted;
  }
}