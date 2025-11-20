import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import {
  ChituConfig,
  ChituResponse,
  MachineListResponse,
  MachineDetails,
  CreateOrderRequest,
  CreateOrderResponse,
  ProductCatalogRequest,
  ProductCatalogResponse,
  PhoneModel,
} from './chitu.types';

@Injectable()
export class ChituService {
  private readonly config: ChituConfig;
  private readonly apiClient: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.config = {
      baseUrl: this.configService.get<string>('CHITU_BASE_URL', 'https://www.gzchitu.cn'),
      appId: this.configService.get<string>('CHITU_APP_ID') || '',
      appSecret: this.configService.get<string>('CHITU_APP_SECRET') || '',
    };

    // Validate config
    if (!this.config.appId || !this.config.appSecret) {
      console.error('❌ Chitu API credentials not configured!');
      console.error('Please set CHITU_APP_ID and CHITU_APP_SECRET in your .env file');
    }

    // Create axios instance with base configuration
    this.apiClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    console.log('🚀 Chitu Service initialized');
    console.log(`📍 Base URL: ${this.config.baseUrl}`);
    console.log(`🔑 App ID: ${this.config.appId ? this.config.appId.substring(0, 10) + '...' : 'NOT SET'}`);
  }

  /**
   * Generate signature for API request based on Chitu documentation
   * Signature = SHA256(sorted params + "&access_token=" + appSecret)
   * NO timestamp or nonce required - signatures are deterministic
   */
  private generateSignature(params: Record<string, any>): string {
    // Remove sign field if present
    const { sign, ...paramsWithoutSign } = params;

    // Sort parameters alphabetically
    const sortedKeys = Object.keys(paramsWithoutSign).sort();

    // Build parameter string
    const paramString = sortedKeys
      .map(key => `${key}=${paramsWithoutSign[key]}`)
      .join('&');

    // Add access_token
    const signString = `${paramString}&access_token=${this.config.appSecret}`;

    // Generate SHA256 signature
    const signature = crypto
      .createHash('sha256')
      .update(signString)
      .digest('hex');

    console.log(`🔐 Signature calculation:`);
    console.log(`   Parameters: ${sortedKeys.join(', ')}`);
    console.log(`   Sign string: ${signString.substring(0, 50)}...`);
    console.log(`   Signature: ${signature}`);

    return signature;
  }

  /**
   * Make authenticated API request
   * Each API endpoint has specific required fields for signature calculation
   */
  private async request<T = any>(
    endpoint: string,
    params: Record<string, any> = {},
    method: 'GET' | 'POST' = 'POST',
  ): Promise<ChituResponse<T> | any> {
    try {
      // Add appid to all requests (required by all endpoints)
      const requestParams: Record<string, any> = {
        appid: this.config.appId,
        ...params,
      };

      // Generate signature based on actual parameters (no timestamp/nonce needed)
      requestParams.sign = this.generateSignature(requestParams);

      console.log(`\n📤 Chitu API Request: ${endpoint}`);
      console.log(`📊 Parameters: ${JSON.stringify(requestParams, null, 2)}`);

      const response = await this.apiClient.request<ChituResponse<T>>({
        method,
        url: endpoint,
        data: requestParams,
      });

      console.log(`✅ Response Status: ${response.data?.status || response.data?.code}`);
      console.log(`💬 Message: ${response.data?.msg || response.data?.message}`);

      // Check for errors in response
      const errorResponse = response.data as any;
      if (errorResponse.status && errorResponse.status !== 200) {
        console.error('❌ Chitu API Error:', errorResponse.msg);
        throw new HttpException(
          `Chitu API Error: ${errorResponse.msg}`,
          HttpStatus.BAD_REQUEST,
        );
      }

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
   * Required fields: appid, page, limit
   */
  async getMachineList(page: number = 1, limit: number = 10): Promise<MachineListResponse> {
    console.log(`\n📋 Getting machine list (page: ${page}, limit: ${limit})`);

    const response = await this.request<MachineListResponse>(
      '/api/openApi/machineList',
      { page, limit },
    );

    const machines = response.data?.list || [];
    console.log(`✅ Found ${machines.length} machines`);

    return {
      machines: machines.map((m: any) => ({
        merchant_id: m.mer_id,
        name: m.name,
        device_id: m.device_id,  // Encrypted ID
        device_code: m.device_code,  // Plain text code (e.g., CT0700046)
        machine_model: m.machine_model,
        online_status: m.online_status === 'online',
        device_key: m.device_key,
      })),
      total: machines.length,
    };
  }

  /**
   * Get machine details by device_id (encrypted)
   * Required fields: appid, device_id
   * Use this when you have the encrypted device_id
   */
  async getMachineDetailsByDeviceId(deviceId: string): Promise<MachineDetails> {
    console.log(`\n🔍 Getting details for device_id: ${deviceId}`);

    const response = await this.request<MachineDetails>(
      '/api/openApi/machineDetails',
      { device_id: deviceId },
    );

    return this.parseMachineDetails(response);
  }

  /**
   * Get machine details by device_code (plain text)
   * Required fields: appid, device_code
   * Use this when you have the plain text machine code (e.g., CT0700046)
   */
  async getMachineDetailsByCode(deviceCode: string): Promise<MachineDetails> {
    console.log(`\n🔍 Getting details for device_code: ${deviceCode}`);

    const response = await this.request<MachineDetails>(
      '/api/openApi/machineDetailsTwo',
      { device_code: deviceCode },
    );

    return this.parseMachineDetails(response);
  }

  /**
   * Parse machine details response (common for both endpoints)
   */
  private parseMachineDetails(response: any): MachineDetails {
    const machine = response.data?.data || response.data;

    if (machine) {
      console.log(`📱 Machine: ${machine.name}`);
      console.log(`🌐 Status: ${machine.online_status}`);
      console.log(`⚙️ Model: ${machine.machine_model}`);
      console.log(`📍 Address: ${machine.address}`);
    }

    return {
      merchant_id: machine.mer_id,
      device_name: machine.name,
      device_id: machine.device_id,
      device_code: machine.device_code,
      machine_model: machine.machine_model,
      address: machine.address,
      online_status: machine.online_status === 'online',
      working_status: machine.online_status === 'online' ? 'idle' : 'offline',
      inventory: {
        paper: parseInt(machine.pole) || 0,
        ink_cyan: this.getInkLevel(machine, 'cyan'),
        ink_magenta: this.getInkLevel(machine, 'magenta'),
        ink_yellow: this.getInkLevel(machine, 'yellow'),
        ink_black: this.getInkLevel(machine, 'black'),
      },
      device_key: machine.device_key,
      machine_id: machine.machineId,  // For MQTT
    };
  }

  /**
   * Helper to determine ink levels based on machine model
   */
  private getInkLevel(machine: any, color: string): number {
    // For phone case printers (CT-350A, CT-360, CT-sjk360)
    if (['CT-350A', 'CT-360', 'CT-sjk360'].includes(machine.machine_model)) {
      // According to docs: white_sugar=cyan, blue_sugar=magenta, yellow_sugar=yellow, red_sugar=black
      // Values: 1=lack of ink, 0=sufficient, -1=unknown
      const mapping: Record<string, string> = {
        'cyan': machine.white_sugar,
        'magenta': machine.blue_sugar,
        'yellow': machine.yellow_sugar,
        'black': machine.red_sugar,
      };

      const value = mapping[color];
      if (value === '0') return 100;  // Sufficient
      if (value === '1') return 10;   // Lack of ink
      return 50;  // Unknown or default
    }

    // Default for other machine types
    return 50;
  }

  /**
   * Get product catalog (phone models) for a machine
   * Required fields: appid, device_id, type, status, page, limit
   * For phone case machines, use type='diy' to get the brand/model structure
   */
  async getProductCatalog(request: ProductCatalogRequest): Promise<ProductCatalogResponse> {
    console.log(`\n📦 Getting product catalog for device`);
    console.log(`📱 Device ID: ${request.device_id}`);
    console.log(`🔧 Type: ${request.type}`);

    const response = await this.request<ProductCatalogResponse>(
      '/api/openApi/machineProductList',
      {
        device_id: request.device_id,
        type: request.type,
        status: request.status,
        page: request.page,
        limit: request.limit,
      },
    );

    const data = response.data;

    if (data && data.list) {
      console.log(`✅ Found ${data.count} total products`);
      console.log(`📋 Brands: ${data.list.length}`);

      // Map 'id' field to 'product_id' for consistency with our TypeScript interface
      data.list.forEach(brand => {
        console.log(`  - ${brand.name_en} (${brand.name_cn}): ${brand.modelList.length} models`);
        brand.modelList = brand.modelList.map(model => {
          const originalId = (model as any).id;
          const mappedProductId = model.product_id || originalId;

          // Log the ID mapping and stock for debugging
          if (originalId && !model.product_id) {
            console.log(`    Mapped id -> product_id: ${originalId} for ${model.name_en} (Stock: ${model.stock})`);
          } else {
            console.log(`    ${model.name_en} - product_id: ${mappedProductId} (Stock: ${model.stock})`);
          }

          return {
            ...model,
            product_id: mappedProductId,
          };
        });
      });
    }

    return data || { count: 0, list: [] };
  }

  /**
   * Helper to get product catalog by device_code (converts to device_id)
   */
  async getProductCatalogByCode(
    deviceCode: string,
    type: 'default' | 'diy' = 'diy',
    status: 0 | 1 = 1,
    page: number = 1,
    limit: number = 100,
  ): Promise<ProductCatalogResponse> {
    const deviceId = await this.getDeviceIdFromCode(deviceCode);
    return this.getProductCatalog({
      device_id: deviceId,
      type,
      status,
      page,
      limit,
    });
  }

  /**
   * Create print order for phone case machine
   * Required fields: appid, device_id, product_id, pay_type, image_url
   * Note: Uses device_id (encrypted) not device_code
   * Image must be in TIF format
   */
  async createPrintOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    console.log(`\n🖨️ Creating print order`);
    console.log(`📱 Device ID: ${request.device_id}`);
    console.log(`🖼️ Image URL: ${request.image_url}`);

    // machineCreateOrder requires device_id (encrypted), not device_code
    const params = {
      device_id: request.device_id,  // Encrypted device ID
      product_id: request.product_id || 'default_phone_case',  // Product ID for the phone case
      pay_type: request.pay_type || 'nayax',  // Payment type
      image_url: request.image_url,  // Must be TIF format
    };

    const response = await this.request<CreateOrderResponse>(
      '/api/openApi/machineCreateOrder',
      params,
    );

    return {
      order_id: response.data?.order_id || '',
      status: response.data?.status || 'pending',
      message: response.data?.message || response.msg || '',
      estimated_time: response.data?.estimated_time || 300,
    };
  }

  /**
   * Encrypt device_key using AES-128-CBC
   * Key: first 16 chars of appSecret
   * IV: last 16 chars of appSecret
   */
  encryptDeviceKey(data: string): string {
    const key = this.config.appSecret.substring(0, 16);
    const iv = this.config.appSecret.substring(this.config.appSecret.length - 16);

    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return encrypted;
  }

  /**
   * Decrypt device_key
   */
  decryptDeviceKey(encrypted: string): string {
    const key = this.config.appSecret.substring(0, 16);
    const iv = this.config.appSecret.substring(this.config.appSecret.length - 16);

    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Helper method to get device_id from device_code
   * Since createOrder needs device_id but we often only have device_code
   */
  async getDeviceIdFromCode(deviceCode: string): Promise<string> {
    // First try to find it in the machine list
    const machines = await this.getMachineList(1, 100);  // Get more machines
    const machine = machines.machines.find(m => m.device_code === deviceCode);

    if (machine) {
      return machine.device_id;
    }

    // If not found in list, get it from machine details
    const details = await this.getMachineDetailsByCode(deviceCode);
    if (details.device_id) {
      return details.device_id;
    }

    throw new HttpException(
      `Could not find device_id for machine code: ${deviceCode}`,
      HttpStatus.NOT_FOUND,
    );
  }

  /**
   * Helper to create print order using device_code (converts to device_id)
   */
  async createPrintOrderByCode(deviceCode: string, imageUrl: string, productId?: string, payType?: string): Promise<CreateOrderResponse> {
    const deviceId = await this.getDeviceIdFromCode(deviceCode);
    return this.createPrintOrder({
      device_id: deviceId,
      image_url: imageUrl,
      product_id: productId,
      pay_type: payType,
    });
  }

  /**
   * Upload custom QR code URL to machine home screen
   * This allows users to scan QR code on machine to start designing
   */
  async uploadQRCode(deviceId: string, qrcodeUrl: string): Promise<{ success: boolean; message: string }> {
    console.log(`\n📱 Uploading QR code to machine`);
    console.log(`📱 Device ID: ${deviceId}`);
    console.log(`🔗 QR Code URL: ${qrcodeUrl}`);

    const response = await this.request(
      '/api/openApi/machineQRCode',
      {
        device_id: deviceId,
        qrcode: qrcodeUrl,
      },
    );

    return {
      success: response.status === 200,
      message: response.msg || 'QR code uploaded successfully',
    };
  }

  /**
   * Helper to upload QR code using device_code (converts to device_id)
   */
  async uploadQRCodeByCode(deviceCode: string, qrcodeUrl: string): Promise<{ success: boolean; message: string }> {
    const deviceId = await this.getDeviceIdFromCode(deviceCode);
    return this.uploadQRCode(deviceId, qrcodeUrl);
  }

  /**
   * Check if machine is online and ready to print
   * Step 1 of the correct workflow
   */
  async checkMachineStatus(deviceCode: string): Promise<{ ready: boolean; message: string; details?: MachineDetails }> {
    console.log(`\n🔍 Checking machine status for: ${deviceCode}`);

    try {
      const machineDetails = await this.getMachineDetailsByCode(deviceCode);

      if (!machineDetails.online_status) {
        return {
          ready: false,
          message: 'Machine is offline',
          details: machineDetails,
        };
      }

      if (machineDetails.working_status !== 'idle') {
        return {
          ready: false,
          message: `Machine is not idle, current status: ${machineDetails.working_status}`,
          details: machineDetails,
        };
      }

      console.log(`✅ Machine is online and ready`);
      return {
        ready: true,
        message: 'Machine is online and ready',
        details: machineDetails,
      };
    } catch (error) {
      console.error(`❌ Failed to check machine status:`, error.message);
      return {
        ready: false,
        message: `Failed to check machine status: ${error.message}`,
      };
    }
  }

  /**
   * Find product by phone model name and verify inventory
   * Step 2-3 of the correct workflow
   */
  async findProductAndVerifyInventory(
    deviceCode: string,
    phoneModelName: string
  ): Promise<{
    available: boolean;
    message: string;
    product?: PhoneModel;
    deviceId?: string;
  }> {
    console.log(`\n📦 Finding product for phone model: ${phoneModelName}`);

    try {
      // Get device_id for the catalog request
      const deviceId = await this.getDeviceIdFromCode(deviceCode);

      // Get product catalog from BOTH types and merge them
      // Some machines have products under 'default', others under 'diy', some have both
      const [defaultCatalog, diyCatalog] = await Promise.all([
        this.getProductCatalog({
          device_id: deviceId,
          type: 'default',
          status: 1,  // Active products only
          page: 1,
          limit: 100,
        }),
        this.getProductCatalog({
          device_id: deviceId,
          type: 'diy',
          status: 1,  // Active products only
          page: 1,
          limit: 100,
        }),
      ]);

      // Merge both catalogs - combine brand lists
      const allBrands = [...(defaultCatalog.list || []), ...(diyCatalog.list || [])];

      // Remove duplicates by brand ID and merge model lists from duplicate brands
      const brandMap = new Map();
      allBrands.forEach(brand => {
        if (brandMap.has(brand.id)) {
          // Brand exists, merge model lists
          const existing = brandMap.get(brand.id);
          existing.modelList = [...existing.modelList, ...brand.modelList];
        } else {
          brandMap.set(brand.id, { ...brand });
        }
      });

      const catalog = {
        count: defaultCatalog.count + diyCatalog.count,
        list: Array.from(brandMap.values()),
      };

      if (!catalog.list || catalog.list.length === 0) {
        console.log('❌ Catalog is empty or undefined');
        console.log('Catalog data:', JSON.stringify(catalog, null, 2));
        return {
          available: false,
          message: 'No products available for this machine',
        };
      }

      console.log(`🔍 Searching for "${phoneModelName}" in ${catalog.list.length} brand(s)`);

      // Normalize search term for better matching
      const normalizeString = (str: string) => {
        return str
          .toLowerCase()
          .replace(/\s+/g, ' ')  // Normalize whitespace
          .trim();
      };

      const normalizedSearch = normalizeString(phoneModelName);
      console.log(`🔍 Normalized search term: "${normalizedSearch}"`);

      // Search for the phone model across all brands
      let foundProduct: PhoneModel | undefined;

      for (const brand of catalog.list) {
        console.log(`  Checking brand: ${brand.name_en} with ${brand.modelList.length} models`);

        // Log all models for debugging
        brand.modelList.forEach(model => {
          console.log(`    - Model: ${model.name_en} (${model.name_cn}), Stock: ${model.stock}, ID: ${model.product_id}`);
        });

        // Try multiple matching strategies
        foundProduct = brand.modelList.find(model => {
          const normalizedNameEn = normalizeString(model.name_en || '');
          const normalizedNameCn = normalizeString(model.name_cn || '');

          // Strategy 1: Exact match (normalized)
          if (normalizedNameEn === normalizedSearch || normalizedNameCn === normalizedSearch) {
            console.log(`    ✅ Exact match found: ${model.name_en}`);
            return true;
          }

          // Strategy 2: Contains match
          if (normalizedNameEn.includes(normalizedSearch) || normalizedNameCn.includes(normalizedSearch)) {
            console.log(`    ✅ Partial match found: ${model.name_en}`);
            return true;
          }

          // Strategy 3: Search term contains model name (for cases like "iPhone 14" matching "iPhone 14 Plus")
          if (normalizedSearch.includes(normalizedNameEn) || normalizedSearch.includes(normalizedNameCn)) {
            console.log(`    ✅ Reverse match found: ${model.name_en}`);
            return true;
          }

          return false;
        });

        if (foundProduct) {
          console.log(`✅ Found product: ${foundProduct.name_en} (${foundProduct.name_cn})`);
          console.log(`📊 Stock: ${foundProduct.stock}`);
          console.log(`🔑 Product ID: ${foundProduct.product_id}`);
          break;
        }
      }

      if (!foundProduct) {
        console.log(`❌ Phone model "${phoneModelName}" not found after searching all brands`);
        console.log(`💡 Tip: Make sure the product exists in the machine's catalog and has stock > 0`);
        return {
          available: false,
          message: `Phone model "${phoneModelName}" not found in machine's product catalog`,
        };
      }

      // Check inventory
      if (foundProduct.stock <= 0) {
        return {
          available: false,
          message: `Product "${foundProduct.name_en}" is out of stock`,
          product: foundProduct,
          deviceId,
        };
      }

      console.log(`✅ Product is available with sufficient stock`);
      return {
        available: true,
        message: 'Product found and in stock',
        product: foundProduct,
        deviceId,
      };
    } catch (error) {
      console.error(`❌ Failed to verify product:`, error.message);
      return {
        available: false,
        message: `Failed to verify product: ${error.message}`,
      };
    }
  }

  /**
   * Complete workflow for creating a print order
   * Follows the correct process:
   * 1. Check machine status
   * 2. Get product information
   * 3. Verify inventory
   * 4. Image processing (handled by caller)
   * 5. Create order
   */
  async createPrintOrderWithValidation(params: {
    deviceCode: string;
    phoneModelName: string;
    imageUrl: string;
    orderNo?: string;
    printCount?: number;
    sessionId?: string;
  }): Promise<{ success: boolean; orderId?: string; message: string; details?: any }> {
    console.log(`\n🚀 Starting validated print order workflow`);
    console.log(`📱 Device: ${params.deviceCode}`);
    console.log(`📱 Phone Model: ${params.phoneModelName}`);

    try {
      // Step 1: Check machine status
      const statusCheck = await this.checkMachineStatus(params.deviceCode);
      if (!statusCheck.ready) {
        return {
          success: false,
          message: statusCheck.message,
          details: { step: 'status_check', ...statusCheck },
        };
      }

      // Step 2-3: Find product and verify inventory
      const productCheck = await this.findProductAndVerifyInventory(
        params.deviceCode,
        params.phoneModelName
      );

      if (!productCheck.available || !productCheck.product) {
        return {
          success: false,
          message: productCheck.message,
          details: { step: 'product_check', ...productCheck },
        };
      }

      // Step 4: Image processing is assumed to be done by caller
      // Image must be in TIF format at this point

      // Step 5: Create order with validated product_id
      console.log(`\n📝 Creating order with validated product_id: ${productCheck.product.product_id}`);

      const orderResult = await this.createOrder({
        deviceId: productCheck.deviceId!,
        productId: productCheck.product.product_id,
        imageUrl: params.imageUrl,
        orderNo: params.orderNo,
        printCount: params.printCount,
        sessionId: params.sessionId,
      });

      if (orderResult.success) {
        console.log(`✅ Order created successfully: ${orderResult.orderId}`);
        return {
          success: true,
          orderId: orderResult.orderId,
          message: 'Order created successfully',
          details: {
            product: productCheck.product,
            machine: statusCheck.details,
          },
        };
      } else {
        return {
          success: false,
          message: orderResult.message,
          details: { step: 'order_creation', ...orderResult },
        };
      }
    } catch (error) {
      console.error(`❌ Print order workflow failed:`, error.message);
      return {
        success: false,
        message: `Print order workflow failed: ${error.message}`,
        details: { error: error.message },
      };
    }
  }

  /**
   * Create print order on machine
   * This submits the design to Chitu for printing
   */
  async createOrder(params: {
    deviceId: string;
    productId: string;      // Chitu product_id from phone model catalog
    imageUrl: string;       // S3 URL to TIF image
    orderNo?: string;       // Optional external order number
    printCount?: number;    // Number of copies (default 1)
    sessionId?: string;     // For tracking
  }): Promise<{ success: boolean; orderId?: string; message: string }> {
    console.log(`\n📦 Creating Chitu order`);
    console.log(`📱 Device ID: ${params.deviceId}`);
    console.log(`🎯 Product ID: ${params.productId}`);
    console.log(`🖼️ Image URL: ${params.imageUrl}`);

    const response = await this.request(
      '/api/openApi/machineCreateOrder',  // Correct endpoint
      {
        device_id: params.deviceId,
        product_id: params.productId,
        image_url: params.imageUrl,
        pay_type: this.configService.get<string>('CHITU_DEFAULT_PAY_TYPE', 'nayax'),
      },
    );

    if (response.status === 200) {
      console.log(`✅ Order created successfully`);
      console.log(`📦 Full response data:`, JSON.stringify(response.data, null, 2));

      // Extract order_id from nested result object
      const orderId = response.data?.result?.orderId ||
                      response.data?.order_id ||
                      response.data?.orderId ||
                      response.data?.id;

      if (orderId) {
        console.log(`✅ Order ID extracted: ${orderId}`);
      } else {
        console.log(`⚠️ Warning: order_id not found in response`);
        console.log(`   Response structure:`, JSON.stringify(response.data, null, 2));
      }

      return {
        success: true,
        orderId: orderId,
        message: response.msg || 'Order created successfully',
      };
    } else {
      console.error(`❌ Order creation failed: ${response.msg}`);
      return {
        success: false,
        message: response.msg || 'Order creation failed',
      };
    }
  }

  /**
   * Helper to create order using device_code (converts to device_id)
   */
  async createOrderByCode(params: {
    deviceCode: string;
    productId: string;
    imageUrl: string;
    orderNo?: string;
    printCount?: number;
    sessionId?: string;
  }): Promise<{ success: boolean; orderId?: string; message: string }> {
    const deviceId = await this.getDeviceIdFromCode(params.deviceCode);
    return this.createOrder({
      ...params,
      deviceId,
    });
  }

  /**
   * Test connection to Chitu API
   */
  async testConnection(): Promise<any> {
    console.log('\n🧪 Testing Chitu API Connection...');

    try {
      const results = {
        timestamp: new Date().toISOString(),
        config: {
          baseUrl: this.config.baseUrl,
          appId: this.config.appId ? '✅ Configured' : '❌ Missing',
          appSecret: this.config.appSecret ? '✅ Configured' : '❌ Missing',
        },
        steps: [] as any[],
      };

      // Step 1: Get machine list
      console.log('\n1️⃣ Testing machine list API...');
      const machines = await this.getMachineList(1, 10);

      results.steps.push({
        step: 'Machine List',
        success: true,
        machineCount: machines.total,
        machines: machines.machines.map(m => ({
          code: m.device_code,
          name: m.name,
          model: m.machine_model,
          online: m.online_status,
        })),
      });

      // Step 2: Get details for our specific machine if available
      const targetMachineCode = this.configService.get<string>('AVAILABLE_MACHINES', 'CT0700046');
      const targetMachine = machines.machines.find(m => m.device_code === targetMachineCode);

      if (targetMachine) {
        console.log(`\n2️⃣ Testing machine details for: ${targetMachineCode}`);
        const machineDetails = await this.getMachineDetailsByCode(targetMachineCode);

        results.steps.push({
          step: 'Machine Details',
          success: true,
          machine: {
            code: machineDetails.device_code,
            name: machineDetails.device_name,
            online: machineDetails.online_status,
            status: machineDetails.working_status,
            model: machineDetails.machine_model,
            address: machineDetails.address,
            inventory: machineDetails.inventory,
          },
        });
      } else {
        console.log(`\n⚠️ Machine ${targetMachineCode} not found in list`);

        // Try to get details anyway (might not be in list due to pagination)
        try {
          const machineDetails = await this.getMachineDetailsByCode(targetMachineCode);
          results.steps.push({
            step: 'Machine Details',
            success: true,
            note: 'Machine not in list but details retrieved',
            machine: {
              code: machineDetails.device_code,
              name: machineDetails.device_name,
              online: machineDetails.online_status,
              model: machineDetails.machine_model,
            },
          });
        } catch (error) {
          results.steps.push({
            step: 'Machine Details',
            success: false,
            error: `Machine ${targetMachineCode} not accessible`,
          });
        }
      }

      // Step 3: Test order creation (will fail until API is ready)
      console.log('\n3️⃣ Testing order creation API...');
      try {
        // Use the helper method that converts device_code to device_id
        const testOrder = await this.createPrintOrderByCode(
          targetMachineCode,
          'https://example.com/test.tif',  // Note: Must be TIF format
          'test_phone_case',  // product_id
          'nayax'  // pay_type
        );

        results.steps.push({
          step: 'Create Order',
          success: true,
          order: testOrder,
        });
      } catch (error) {
        results.steps.push({
          step: 'Create Order',
          success: false,
          error: error.message,
          note: 'This is expected if the API is still under development',
        });
      }

      return results;
    } catch (error) {
      console.error('❌ Test failed:', error);
      throw new HttpException(
        `Chitu API test failed: ${error.message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}