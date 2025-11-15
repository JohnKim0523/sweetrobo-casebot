/**
 * Chitu API Type Definitions
 */

// Base configuration
export interface ChituConfig {
  baseUrl: string;
  appId: string;
  appSecret: string;
}

// Base response structure
export interface ChituResponse<T = any> {
  code?: number;  // Some endpoints use 'code'
  status?: number;  // Some endpoints use 'status'
  message?: string;  // Some endpoints use 'message'
  msg?: string;  // Some endpoints use 'msg'
  data?: T;
}

// Machine list types
export interface MachineListResponse {
  machines: Machine[];
  total: number;
}

export interface Machine {
  merchant_id: string;
  name: string;
  device_id: string;  // Encrypted ID
  device_code: string;  // Plain text code (e.g., CT0700046)
  machine_model: string;
  online_status: boolean;
  device_key: string;
}

// Machine details types
export interface MachineDetails {
  merchant_id: string;
  device_name: string;
  device_id: string;  // Encrypted ID
  device_code: string;  // Plain text code
  machine_model: string;
  address: string;
  online_status: boolean;
  working_status: string;
  inventory: {
    paper?: number;
    ink_cyan?: number;
    ink_magenta?: number;
    ink_yellow?: number;
    ink_black?: number;
  };
  device_key: string;
  machine_id?: string;  // For MQTT
}

// Create order types
export interface CreateOrderRequest {
  device_id: string;  // IMPORTANT: Encrypted device ID (not device_code!)
  product_id?: string;  // Product ID for the phone case type
  pay_type?: string;  // Payment method (e.g., 'nayax')
  image_url: string;  // TIF format image URL
  // Legacy/helper fields
  device_code?: string;  // We can convert this to device_id if needed
  quantity?: number;
}

export interface CreateOrderResponse {
  order_id: string;
  status: string;
  message?: string;
  estimated_time?: number;  // In seconds
}

// Additional types for MQTT/real-time updates
export interface MachineStatus {
  device_code: string;
  online_status: boolean;
  working_status: 'idle' | 'printing' | 'offline' | 'error';
  current_order?: string;
  progress?: number;
}

// Product catalog types
export interface ProductCatalogRequest {
  device_id: string;  // Encrypted device ID
  type: 'default' | 'diy';  // 'diy' for phone cases
  status: 0 | 1;  // 1 = active, 0 = inactive
  page: number;
  limit: number;
}

export interface PhoneModel {
  name_cn: string;
  name_en: string;
  show_img: string;  // Preview image URL
  print_img: string;  // Template image URL with exact dimensions
  price: string;
  product_id: string;  // Use this when creating orders
  stock: number;
}

export interface ProductBrand {
  id: string;
  name_cn: string;
  name_en: string;
  modelList: PhoneModel[];
}

export interface ProductCatalogResponse {
  count: number;
  list: ProductBrand[];
}