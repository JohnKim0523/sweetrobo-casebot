import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
}

// Constants
const PRINTER_API_URL = "https://h5.colorpark.cn/api/userphoneapplets/index";
const MACHINE_ID = "11025496";
// GOODS_ID mapping:
// - 4159: iPhone cases (shows iPhone template) ❌
// - 993: "自定义型号" (Custom Model) - for custom canvas prints ✅
const GOODS_ID = "993"; // Custom canvas/substrate - no template overlay!

// Cache for credentials to avoid excessive API calls
let credentialsCache: {
  token: string;
  userId: number;
  ossCredentials?: {
    accessKeyId: string;
    policy: string;
    signature: string;
  };
  expiresAt: number;
} | null = null;

// Login to ColorPark and get authentication token with retry logic
async function loginToColorPark(retries = 3): Promise<{ token: string; userId: number }> {
  // Check cache first
  if (credentialsCache && credentialsCache.expiresAt > Date.now()) {
    console.log('Using cached credentials');
    return {
      token: credentialsCache.token,
      userId: credentialsCache.userId
    };
  }

  console.log('Fetching new credentials from ColorPark...');
  
  // Generate random phone number (16 digits)
  const randomPhone = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
  
  const formData = new URLSearchParams({
    's': 'User.webLogin',
    'phone': randomPhone,
    'password': '',
    'type': '2',
    'applets_type': '7',
    'machine_id': MACHINE_ID
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Login attempt ${attempt} of ${retries}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const response = await fetch(PRINTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          'Accept': '*/*',
          'Origin': 'https://h5.colorpark.cn',
          'Referer': 'https://h5.colorpark.cn/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: formData.toString(),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // ColorPark API returns code:0 for success (not ret:200)
      if ((data.code !== 0 && data.ret !== 200) || !data.data?.token) {
        throw new Error(`Login failed: ${JSON.stringify(data)}`);
      }

      // Cache credentials for 30 minutes
      credentialsCache = {
        token: data.data.token,
        userId: data.data.user_id || data.data.uid || data.data.id,
        expiresAt: Date.now() + (30 * 60 * 1000)
      };

      console.log('Login successful, user ID:', credentialsCache.userId);
      return {
        token: credentialsCache.token,
        userId: credentialsCache.userId
      };
    } catch (error: any) {
      console.error(`Login attempt ${attempt} failed:`, error.message);
      
      if (attempt === retries) {
        console.error('All login attempts failed');
        throw new Error(`Failed to authenticate with ColorPark after ${retries} attempts: ${error.message}`);
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw new Error('Failed to authenticate with ColorPark');
}

// Get available products for the machine
async function getAvailableProducts(token: string): Promise<any> {
  try {
    console.log('Fetching available products...');
    
    const response = await fetch(PRINTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'token': token,
        'Origin': 'https://h5.colorpark.cn',
        'Referer': 'https://h5.colorpark.cn/pages/print/index'
      },
      body: JSON.stringify({
        's': 'Product.getCustomize',
        'machine_id': MACHINE_ID,
        'goods_category_id': 57  // From machine details
      })
    });

    const data = await response.json();
    console.log('Available products response:', JSON.stringify(data, null, 2));
    
    // Also try to get machine settings which might have product info
    const machineResponse = await fetch(PRINTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'token': token,
        'Origin': 'https://h5.colorpark.cn',
        'Referer': 'https://h5.colorpark.cn/pages/print/index'
      },
      body: JSON.stringify({
        's': 'Machine.getBaseSetting',
        'machine_id': MACHINE_ID
      })
    });
    
    const machineData = await machineResponse.json();
    console.log('Machine settings response:', JSON.stringify(machineData, null, 2));
    
    return { products: data, machineSettings: machineData };
  } catch (error) {
    console.error('Error fetching products:', error);
    return null;
  }
}

// Get OSS upload credentials
async function getOSSCredentials(token: string): Promise<{
  accessKeyId: string;
  policy: string;
  signature: string;
  callback?: string;
  dir?: string;
}> {
  // Check cache first
  if (credentialsCache?.ossCredentials && credentialsCache.expiresAt > Date.now()) {
    console.log('Using cached OSS credentials');
    return credentialsCache.ossCredentials;
  }

  console.log('Fetching fresh OSS credentials from ColorPark...');
  
  try {
    // Use the discovered AliossSign/getSign endpoint
    const response = await fetch('https://h5.colorpark.cn/api//api/AliossSign/getSign', {
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'Origin': 'https://h5.colorpark.cn',
        'Referer': 'https://h5.colorpark.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'token': token  // Include token in case it's needed
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get OSS credentials: ${response.status}`);
    }

    const data = await response.json();
    
    // The API returns data in this format:
    // {
    //   "accessid": "LTAI5tAqeusvBeyboyeFFvN6",
    //   "host": "https://img.colorpark.cn",
    //   "policy": "eyJleHBpcmF0aW9uIjo...",
    //   "signature": "GC6ZujROifeiQJPegxB394t2cXE=",
    //   "expire": 1754337003,
    //   "callback": "eyJjYWxsYmFja1VybCI6...",
    //   "dir": "api/render/"
    // }
    
    if (data.accessid && data.policy && data.signature) {
      const ossCredentials = {
        accessKeyId: data.accessid,
        policy: data.policy,
        signature: data.signature,
        callback: data.callback,
        dir: data.dir || 'api/render/'
      };
      
      // Cache the credentials until they expire
      if (credentialsCache) {
        credentialsCache.ossCredentials = ossCredentials;
        // Update expiration if the API provides one
        if (data.expire) {
          credentialsCache.expiresAt = data.expire * 1000; // Convert to milliseconds
        }
      }
      
      console.log('Successfully fetched OSS credentials');
      return ossCredentials;
    } else {
      throw new Error('Invalid OSS credential response format');
    }
  } catch (error) {
    console.error('Error fetching OSS credentials:', error);
    
    // Fallback to hardcoded credentials if dynamic fetch fails
    console.warn('Using fallback OSS credentials - these may expire!');
    return {
      accessKeyId: 'LTAI5tAqeusvBeyboyeFFvN6',
      policy: 'eyJleHBpcmF0aW9uIjoiMjAyNS0wOC0wNFQyMzo0NDo1OFoiLCJjb25kaXRpb25zIjpbWyJjb250ZW50LWxlbmd0aC1yYW5nZSIsMCwxMDQ4NTc2MDAwXSxbInN0YXJ0cy13aXRoIiwiJGtleSIsImFwaVwvcmVuZGVyXC8iXV19',
      signature: 'sFD2nqAnJqqxsfFZLrmUsTDN7Fk='
    };
  }
}


async function uploadImageToColorPark(imageBase64: string, token: string, canvasData: any): Promise<string> {
  try {
    // Get OSS credentials
    const ossCredentials = await getOSSCredentials(token);
    
    // Use the original canvas image directly - no backdrop needed
    const finalImage = imageBase64;
    
    // Debug: Check if we received a valid image
    if (!imageBase64.startsWith('data:image/')) {
      console.error('Invalid image data received:', imageBase64.substring(0, 100));
      throw new Error('Invalid image data format');
    }
    
    // Convert base64 to buffer while preserving format
    const base64Data = finalImage.replace(/^data:image\/(png|jpeg);base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    console.log('Image buffer size:', imageBuffer.length, 'bytes');
    console.log('First 20 bytes of image:', imageBuffer.slice(0, 20));
    
    // Detect actual image format
    const isJPEG = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8;
    const isPNG = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50;
    console.log('Image format check - JPEG:', isJPEG, 'PNG:', isPNG);
    
    // Use appropriate file extension based on actual format
    const imageFormat = isPNG ? 'png' : 'jpeg';
    const contentType = isPNG ? 'image/png' : 'image/jpeg';
    
    // Debug logging without saving files
    console.log('🔍 Image format detected:', imageFormat);
    console.log('🔍 Content type:', contentType);
    console.log('🔍 Buffer size:', imageBuffer.length, 'bytes');
    
    // Generate timestamp for unique filename with proper extension
    const timestamp = Date.now();
    const filename = `api/render/${timestamp}.${imageFormat}`;
    
    // Build multipart form data manually
    const boundary = `----WebKitFormBoundary${Math.random().toString(16).slice(2)}`;
    const formParts: string[] = [];
    
    // Add key field
    formParts.push(
      `--${boundary}`,
      'Content-Disposition: form-data; name="key"',
      '',
      filename
    );
    
    // Add OSSAccessKeyId field
    formParts.push(
      `--${boundary}`,
      'Content-Disposition: form-data; name="OSSAccessKeyId"',
      '',
      ossCredentials.accessKeyId
    );
    
    // Add policy field
    formParts.push(
      `--${boundary}`,
      'Content-Disposition: form-data; name="policy"',
      '',
      ossCredentials.policy
    );
    
    // Add signature field
    formParts.push(
      `--${boundary}`,
      'Content-Disposition: form-data; name="signature"',
      '',
      ossCredentials.signature
    );
    
    // Add callback field if provided
    if (ossCredentials.callback) {
      formParts.push(
        `--${boundary}`,
        'Content-Disposition: form-data; name="callback"',
        '',
        ossCredentials.callback
      );
    }
    
    // Add success_action_status field
    formParts.push(
      `--${boundary}`,
      'Content-Disposition: form-data; name="success_action_status"',
      '',
      '200'
    );
    
    // Add file field (must be last for OSS)
    formParts.push(
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${timestamp}.${imageFormat}"`,
      `Content-Type: ${contentType}`,
      ''
    );
    
    // Combine text parts with proper line endings
    const textPart = formParts.join('\r\n') + '\r\n';
    const textEncoder = new TextEncoder();
    const textBuffer = textEncoder.encode(textPart);
    
    // Add ending boundary
    const endingBoundary = textEncoder.encode(`\r\n--${boundary}--\r\n`);
    
    // Combine all parts
    const bodyParts = [textBuffer, imageBuffer, endingBoundary];
    const bodyLength = bodyParts.reduce((acc, part) => acc + part.length, 0);
    const body = new Uint8Array(bodyLength);
    let offset = 0;
    for (const part of bodyParts) {
      body.set(part, offset);
      offset += part.length;
    }
    
    // Upload to ColorPark CDN
    console.log('Uploading to ColorPark CDN with filename:', filename);
    const uploadResponse = await fetch('https://img.colorpark.cn/', {
      method: 'POST',
      body: body,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      }
    });
    
    console.log('Upload response status:', uploadResponse.status);
    
    // OSS typically returns 204 No Content or 200 on success
    if (uploadResponse.status === 204 || uploadResponse.status === 200) {
      // Success - return the hosted image URL
      const imageUrl = `https://img.colorpark.cn/${filename}`;
      console.log('Upload successful! Image URL:', imageUrl);
      
      // Verify the image is accessible
      try {
        const verifyResponse = await fetch(imageUrl, { method: 'HEAD' });
        console.log('Image verification - Status:', verifyResponse.status, 'OK:', verifyResponse.ok);
        if (!verifyResponse.ok) {
          console.warn('Warning: Uploaded image may not be accessible yet');
        }
      } catch (verifyError) {
        console.warn('Could not verify image accessibility:', verifyError);
      }
      
      return imageUrl;
    } else {
      const responseText = await uploadResponse.text();
      console.log('Upload response body:', responseText);
      throw new Error(`Failed to upload image to ColorPark: ${uploadResponse.status} - ${responseText}`);
    }
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { imageData, canvasData } = req.body;
    
    console.log('=== PRINTER SUBMISSION DEBUG ===');
    console.log('Received image data type:', imageData.substring(0, 30));
    console.log('Received canvas data:', {
      width: canvasData.width,
      height: canvasData.height,
      aspectRatio: canvasData.width / canvasData.height,
      objectCount: canvasData.objects.length,
      backgroundColor: canvasData.backgroundColor
    });
    
    // Check if image data is valid
    if (!imageData.startsWith('data:image/')) {
      console.error('ERROR: Invalid image data format received');
      throw new Error('Invalid image data format');
    }
    
    // Login to ColorPark and get credentials
    const { token, userId } = await loginToColorPark();
    console.log('Authenticated with ColorPark, user ID:', userId);
    
    // Using goods_id 993 for custom canvas (no iPhone template)
    
    // Upload image to ColorPark CDN with fresh credentials
    const imageUrl = await uploadImageToColorPark(imageData, token, canvasData);
    
    // Get the main image object from canvas data
    const imageObject = canvasData.objects.find((obj: any) => obj.type === 'image');
    
    if (!imageObject) {
      throw new Error('No image found in canvas data');
    }
    
    console.log('Image object from canvas:', {
      left: imageObject.left,
      top: imageObject.top,
      width: imageObject.width,
      height: imageObject.height,
      scaleX: imageObject.scaleX,
      scaleY: imageObject.scaleY,
      angle: imageObject.angle
    });
    
    // Get actual scaled dimensions
    const scaledWidth = imageObject.width * imageObject.scaleX;
    const scaledHeight = imageObject.height * imageObject.scaleY;
    
    // Use CORRECT printer dimensions: 100mm × 185mm
    const canvasWidth = canvasData.width || 100;   
    const canvasHeight = canvasData.height || 185; 
    
    // Direct 1:1 mapping - canvas dimensions map directly to printer units
    const printerWidth = canvasWidth;   // 100mm
    const printerHeight = canvasHeight; // 185mm
    
    // The printer coordinate system uses 100×185mm
    const printerCanvasWidth = 100;
    const printerCanvasHeight = 185;
    
    // Center position
    const printerCenterX = printerCanvasWidth / 2;   // 50
    const printerCenterY = printerCanvasHeight / 2;  // 92.5
    
    // For edge-to-edge printing, use oversized dimensions with negative positioning
    // We need to ensure the image covers the entire 100×185mm canvas with bleed
    const bleedAmount = 20; // 20mm bleed on each side for safety
    
    // Calculate oversized dimensions to ensure full coverage
    const designWidth = printerCanvasWidth + (bleedAmount * 2);   // 140mm total width
    const designHeight = printerCanvasHeight + (bleedAmount * 2);  // 225mm total height
    
    // Center the oversized image over the canvas using negative positioning
    const designLeft = -bleedAmount;    // -20mm (extends 20mm beyond left edge)
    const designTop = -bleedAmount;     // -20mm (extends 20mm beyond top edge)
    const designRight = printerCanvasWidth + bleedAmount;   // 120mm
    const designBottom = printerCanvasHeight + bleedAmount; // 205mm
    
    // Check what ColorPark expects vs what we're sending
    const COLORPARK_EXPECTED_WIDTH = 782;
    const COLORPARK_EXPECTED_HEIGHT = 1609;
    const COLORPARK_ASPECT = COLORPARK_EXPECTED_WIDTH / COLORPARK_EXPECTED_HEIGHT; // 0.486
    const OUR_ASPECT = designWidth / designHeight; // 0.5
    
    console.log('📐 Dimension Analysis:', {
      ourCanvas: { 
        width: designWidth, 
        height: designHeight, 
        aspectRatio: OUR_ASPECT 
      },
      colorParkExpects: { 
        width: COLORPARK_EXPECTED_WIDTH, 
        height: COLORPARK_EXPECTED_HEIGHT, 
        aspectRatio: COLORPARK_ASPECT 
      },
      aspectRatioDifference: Math.abs(OUR_ASPECT - COLORPARK_ASPECT),
      warning: Math.abs(OUR_ASPECT - COLORPARK_ASPECT) > 0.01 ? '⚠️ ASPECT RATIO MISMATCH!' : '✅ Aspect ratios match'
    });
    
    // The exported image already has rotation baked in, so don't rotate again
    const angle = 0;
    
    // Use oversized boundaries for corners to match edge-to-edge positioning
    const corners = {
      upper_left_x: designLeft,
      upper_left_y: designTop,
      upper_right_x: designRight,
      upper_right_y: designTop,
      lower_left_x: designLeft,
      lower_left_y: designBottom,
      lower_right_x: designRight,
      lower_right_y: designBottom,
    };
    
    console.log('Calculated positions for ColorPark:', {
      designLeft,
      designTop,
      designWidth,
      designHeight,
      printerCenterX,
      printerCenterY,
      angle,
      corners
    });
    
    // Step 1: Works.save - Use actual printer dimensions 100×185mm
    const worksPayload = {
      "s": "Works.save",
      "components": [{
        "is_under": 0,
        "is_discount": 0,
        "id": null,
        "type": 0,  // Type 0 = Image (matching working payload)
        "material_id": 0,
        "works_id": null,
        "original_id": 0,
        "index": 100,
        "font_family": ".ttf",
        "font_style": "regular",
        "font_size": 0,
        "font_color": "",
        "under_color": "#00000000",
        "width": designWidth,    // 162.8mm (oversized)
        "height": designHeight,  // 150.5mm
        "top": designTop,        // 17.2mm
        "left": designLeft,      // -31.4mm (negative for bleed)
        "zoom": 1,
        "rotate": 0, // Rotation is already baked into the exported image
        "content": imageUrl,
        "upper_left_x": designLeft,      // -31.4mm
        "upper_left_y": designTop,       // 17.2mm
        "upper_right_x": designRight,    // 131.4mm
        "upper_right_y": designTop,      // 17.2mm
        "lower_left_x": designLeft,      // -31.4mm
        "lower_left_y": designBottom,    // 167.7mm
        "lower_right_x": designRight,    // 131.4mm
        "lower_right_y": designBottom,   // 167.7mm
        "center_x": printerCenterX,      // 50
        "center_y": printerCenterY,      // 92.5
        "image_left": designLeft,        // -31.4mm
        "image_top": designTop,          // 17.2mm
        "image_width": designWidth,      // 162.8mm
        "image_height": designHeight     // 150.5mm
      }],
      "works_id": null,
      "goods_id": GOODS_ID,
      "template": null,
      "template_price": null,
      "template_user_id": null,
      "user_id": null,
      "platform": 4,
      "shape_image": "",
      "shape_id": "",
      "shape_price": "",
      "machine_id": MACHINE_ID,
      "terminal": 2,
      "background_color": null
    };
    
    console.log('Sending Works.save payload with image URL:', worksPayload.components[0].content);
    console.log('Component structure:', JSON.stringify(worksPayload.components[0], null, 2));
    
    const worksResponse = await fetch(PRINTER_API_URL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        "token": token,
        "Origin": "https://h5.colorpark.cn",
        "Referer": "https://h5.colorpark.cn/pages/print/index"
      },
      body: JSON.stringify(worksPayload)
    });
    
    const worksData = await worksResponse.json() as any;
    console.log('Works.save response:', JSON.stringify(worksData, null, 2));
    
    if (!worksData.data?.id) {
      console.error('Works.save failed - Full response:', worksData);
      throw new Error('Failed to save work to printer');
    }
    
    const worksId = worksData.data.id;
    console.log('Works saved with ID:', worksId);
    
    // Log the rendered image URL that ColorPark created
    if (worksData.data.image) {
      console.log('⚠️ ColorPark rendered image URL:', worksData.data.image);
      console.log('⚠️ Original uploaded image URL:', imageUrl);
      console.log('⚠️ Render dimensions:', {
        width: worksData.data.render_cove_width,
        height: worksData.data.render_cove_height,
        left: worksData.data.render_left,
        top: worksData.data.render_top
      });
      
      // Don't download images - just log the URLs
      console.log('📸 Image URLs:');
      console.log('  - Our upload:', imageUrl);
      console.log('  - ColorPark render:', worksData.data.image);
    }
    
    // Step 2: Order.create
    const orderPayload = {
      "s": "Order.create",
      "type": 2,
      "machine_id": MACHINE_ID,
      "goods_id": GOODS_ID,
      "works_id": String(worksId),
      "channel_no": null,
      "dict_id": null,
      "goods_size": null,
      "works_num": null,
      "shop_id": null,
      "sn": null,
      "coupon_id": null,
      "user_address": null,
      "surface_type": 0,
      "surface_id": 0,
      "surface_color_series_id": 0,
      "surface_color_id": 0,
      "language": "en-us",
      "support_paypal": "",
      "promoter_id": "",
      "terminal": 4,
      "customize_size_id": "",
      "create_time": Math.floor(Date.now() / 1000),
      "user_id": userId
    };
    
    const orderResponse = await fetch(PRINTER_API_URL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        "token": token,
        "Origin": "https://h5.colorpark.cn",
        "Referer": "https://h5.colorpark.cn/pages/print/index"
      },
      body: JSON.stringify(orderPayload)
    });
    
    const orderData = await orderResponse.json() as any;
    
    // Step 3: Machine.wait (check queue status)
    const machineWaitPayload = {
      "s": "Machine.wait",
      "machine_id": MACHINE_ID,
      "page": 1,
      "per_page": 20,
      "total": 0
    };
    
    const machineResponse = await fetch(PRINTER_API_URL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        "token": token,
        "Origin": "https://h5.colorpark.cn",
        "Referer": "https://h5.colorpark.cn/pages/print/index"
      },
      body: JSON.stringify(machineWaitPayload)
    });
    
    const machineData = await machineResponse.json() as any;
    
    res.status(200).json({
      success: true,
      worksId,
      orderResponse: orderData,
      queueStatus: machineData,
      message: 'Design sent to printer successfully'
    });
    
  } catch (error: any) {
    console.error('Error submitting to printer:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to submit to printer' 
    });
  }
}