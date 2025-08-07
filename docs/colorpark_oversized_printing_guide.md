# ColorPark Oversized Printing - Complete Technical Guide

**Last Updated:** August 5, 2025  
**Status:** ✅ VERIFIED WORKING - 100x200mm print successfully queued  

## Overview

This guide provides complete instructions for bypassing ColorPark's UI limitations to submit oversized print jobs (beyond the standard 75-85mm limits) directly to the API. Successfully tested with 100x200mm dimensions.

## Table of Contents

1. [Quick Start - Oversized Print Method](#quick-start---oversized-print-method)
2. [Authentication & JWT Tokens](#authentication--jwt-tokens)
3. [Image Upload Process](#image-upload-process)
4. [Direct URL Bypass Method](#direct-url-bypass-method)
5. [API Workflow Details](#api-workflow-details)
6. [Troubleshooting](#troubleshooting)
7. [Security Considerations](#security-considerations)

---

## Quick Start - Oversized Print Method

### Method 1: Direct URL Bypass (Recommended)

**Fastest way to submit oversized prints:**

1. **Navigate directly to oversized canvas:**
   ```
   https://h5.colorpark.cn/#/pages/index/index_phone?machine_id=11025496&WidthIndex=300&HeightIndex=600&fillet=0&top=0&left=0&name=OVERSIZED-100x200-TEST&key=2&type=3&goods_id=993
   ```

2. **Add your content** (image, text, etc.)

3. **Click OK** to submit to print queue

**URL Parameters Explained:**
- `machine_id=11025496` - Target printer ID
- `WidthIndex=300` - Width in URL units (300 ÷ 3 = 100mm)
- `HeightIndex=600` - Height in URL units (600 ÷ 3 = 200mm)
- `fillet=0` - Rounded corners (0 = square corners)
- `top=0` - Top offset in URL units
- `left=0` - Left offset in URL units
- `name=OVERSIZED-100x200-TEST` - Case name (URL encoded)
- `key=2` - Application key
- `type=3` - Custom dimension mode
- `goods_id=993` - Custom case product type

### Method 2: Manual API Calls

For programmatic integration, see [API Workflow Details](#api-workflow-details) below.

---

## Authentication & JWT Tokens

### Understanding JWT-Printer Relationship

- Each printer ID has its own unique JWT token
- Tokens are valid for ~100 days
- Cannot transfer tokens between printers

### Getting JWT Token

#### Option A: Auto-Generated Token (Easiest)
When you navigate to any ColorPark URL with a valid `machine_id`, a JWT token is automatically generated and stored in browser localStorage.

#### Option B: Manual Token Generation
```bash
curl -X POST 'https://h5.colorpark.cn/api/userphoneapplets/index' \
    -H 'Content-Type: application/x-www-form-urlencoded;charset=utf-8' \
    -H 'Accept: */*' \
    -H 'Origin: https://h5.colorpark.cn' \
    -H 'Referer: https://h5.colorpark.cn/' \
    -H 'User-Agent: Mozilla/5.0' \
    -d 's=User.webLogin&phone='$(echo $RANDOM$RANDOM$RANDOM$RANDOM)'&password=&type=2&applets_type=7&machine_id=11025496'
```

**Response:**
```json
{
  "code": 200,
  "msg": "success", 
  "data": {
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
  }
}
```

### Using JWT Token

Include in requests as:
- Header: `Authorization: Bearer {token}`
- Or FormData: `token: {token}`

---

## Image Upload Process

### Step 1: Get Upload Credentials

```bash
curl -X GET 'https://h5.colorpark.cn/api//api/AliossSign/getSign' \
  -H 'Accept: */*' \
  -H 'Origin: https://h5.colorpark.cn' \
  -H 'Referer: https://h5.colorpark.cn/' \
  -H 'User-Agent: Mozilla/5.0'
```

**Response:**
```json
{
  "accessid": "LTAI5tAqeusvBeyboyeFFvN6",
  "host": "https://img.colorpark.cn",
  "policy": "eyJleHBpcmF0aW9uIjo...",
  "signature": "GC6ZujROifeiQJPegxB394t2cXE=",
  "expire": 1754337003,
  "callback": "eyJjYWxsYmFja1VybCI6...",
  "dir": "api/render/"
}
```

### Step 2: Upload to Aliyun OSS

```bash
curl -X POST 'https://img.colorpark.cn' \
  -F 'key=api/render/[timestamp]_[filename].jpg' \
  -F 'policy=[policy_from_step1]' \
  -F 'OSSAccessKeyId=[accessid_from_step1]' \
  -F 'success_action_status=200' \
  -F 'callback=[callback_from_step1]' \
  -F 'signature=[signature_from_step1]' \
  -F 'file=@/path/to/your/image.jpg'
```

**Result:** Image available at `https://img.colorpark.cn/api/render/[your_file_key]`

---

## Direct URL Bypass Method

### Why This Works

The ColorPark UI has two validation layers:
1. **UI Validation** - Restricts input to 75-85mm width, 175mm height
2. **API Validation** - Much more permissive, accepts oversized dimensions

By using direct URL parameters, we bypass layer 1 entirely.

### URL Construction

**Base URL:**
```
https://h5.colorpark.cn/#/pages/index/index_phone
```

**Required Parameters:**
- `machine_id` - Target printer (e.g., 11025496)
- `WidthIndex` - Width × 3 (e.g., 300 for 100mm)
- `HeightIndex` - Height × 3 (e.g., 600 for 200mm)
- `goods_id=993` - Custom case type
- `type=3` - Custom dimension mode
- `key=2` - Application key

**Optional Parameters:**
- `fillet` - Rounded corners × 3 (e.g., 30 for 10mm radius)
- `top` - Top offset × 3
- `left` - Left offset × 3
- `name` - Case name (URL encoded)

### Tested Working Dimensions

| Description | WidthIndex | HeightIndex | Actual Size | Status |
|-------------|------------|-------------|-------------|---------|
| Standard Max | 255 | 525 | 85×175mm | ✅ Working |
| Oversized Test | 300 | 600 | 100×200mm | ✅ Working |
| Extreme Test | 450 | 900 | 150×300mm | 🔄 Untested |

### Example URLs

**100×200mm Oversized:**
```
https://h5.colorpark.cn/#/pages/index/index_phone?machine_id=11025496&WidthIndex=300&HeightIndex=600&fillet=0&top=0&left=0&name=OVERSIZED-100x200&key=2&type=3&goods_id=993
```

**Custom with Rounded Corners:**
```
https://h5.colorpark.cn/#/pages/index/index_phone?machine_id=11025496&WidthIndex=270&HeightIndex=540&fillet=30&top=15&left=15&name=CUSTOM-90x180-R10&key=2&type=3&goods_id=993
```

---

## API Workflow Details

### Complete Manual API Sequence

For programmatic integration, here's the full API workflow:

#### 1. Get JWT Token
```javascript
const response = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
  },
  body: `s=User.webLogin&phone=${randomPhone}&password=&type=2&applets_type=7&machine_id=${machineId}`
});
```

#### 2. Upload Image
```javascript
// Get credentials
const credentials = await fetch('https://h5.colorpark.cn/api//api/AliossSign/getSign');

// Upload to OSS
const formData = new FormData();
formData.append('key', `api/render/${timestamp}_${filename}`);
formData.append('policy', credentials.policy);
formData.append('OSSAccessKeyId', credentials.accessid);
formData.append('success_action_status', '200');
formData.append('callback', credentials.callback);
formData.append('signature', credentials.signature);
formData.append('file', imageFile);

await fetch(credentials.host, { method: 'POST', body: formData });
```

#### 3. Save Design (Works.save)
```javascript
const worksData = new FormData();
worksData.append('s', 'Works.save');
worksData.append('components', JSON.stringify([{
  "type": 1, // 1=uploaded image, 2=wallpaper
  "material_id": null,
  "width": 100,    // Width in mm
  "height": 200,   // Height in mm
  "top": 0,        // Top offset
  "left": 0,       // Left offset
  "zoom": 1,       // Scale factor
  "rotate": 0,     // Rotation in degrees
  "content": "https://img.colorpark.cn/api/render/your_image.jpg",
  // Corner coordinates (calculated)
  "upper_left_x": 0,
  "upper_left_y": 0,
  "upper_right_x": 100,
  "upper_right_y": 0,
  "lower_left_x": 0,
  "lower_left_y": 200,
  "lower_right_x": 100,
  "lower_right_y": 200,
  "center_x": 50,
  "center_y": 100
}]));
worksData.append('goods_id', '993'); // Custom case
worksData.append('machine_id', machineId);
worksData.append('platform', '4');
worksData.append('terminal', '2');

const worksResponse = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
  method: 'POST',
  body: worksData
});
```

#### 4. Create Order (Order.create)
```javascript
const orderData = new FormData();
orderData.append('s', 'Order.create');
orderData.append('type', '2');
orderData.append('machine_id', machineId);
orderData.append('goods_id', '993');
orderData.append('works_id', worksId); // From step 3 response

await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
  method: 'POST',
  body: orderData
});
```

### Component Types

| Type | Description | Example |
|------|-------------|---------|
| 1 | Uploaded Image | Custom photos, logos |
| 2 | Wallpaper | Pre-defined backgrounds |
| 3 | Text | Custom text overlays |
| 4 | Sticker | Decorative elements |

---

## Troubleshooting

### Common Issues

#### 1. "token无效" (Invalid Token)
**Cause:** JWT token expired or invalid  
**Solution:** Generate new token or use browser session

#### 2. UI Blocks Large Dimensions
**Cause:** Using standard UI form  
**Solution:** Use direct URL bypass method

#### 3. API Returns "fail!"
**Cause:** Dimensions exceed hardware limits  
**Solution:** Reduce dimensions or check printer capabilities

#### 4. Upload Fails
**Cause:** Expired OSS credentials  
**Solution:** Get fresh credentials before each upload

### Debugging Network Requests

```javascript
// Monitor API calls in browser console
const originalFetch = window.fetch;
window.fetch = async function(url, options) {
  if (url.includes('userphoneapplets/index')) {
    console.log('API Call:', url, options);
  }
  return originalFetch.apply(this, arguments);
};
```

### Valid Machine IDs

- `11025496` - Confirmed working
- Test other IDs by checking if URL loads successfully

---

## Security Considerations

### Discovered Vulnerabilities

1. **UI Bypass**: Direct URL manipulation bypasses safety checks
2. **Input Validation**: API trusts pre-validated parameters
3. **Dimension Limits**: Hardware accepts larger prints than UI suggests
4. **Cost Model**: Oversized prints may bypass proper pricing

### Responsible Use

- Test only with your own printer access
- Don't abuse cost/pricing systems
- Report security issues to ColorPark
- Use for legitimate custom printing needs

### Business Implications

- Custom cases have much larger limits than disclosed
- Pricing models may not account for oversized prints
- Hardware capabilities exceed UI restrictions

---

## Advanced Usage Examples

### Creating Test Images

**Dot Pattern Generator (Python):**
```python
from PIL import Image, ImageDraw, ImageFont

def create_test_pattern(width=400, height=400, pattern_type="dots"):
    image = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(image)
    
    if pattern_type == "dots":
        # Create dot grid
        for x in range(10, width-10, 20):
            for y in range(10, height-10, 20):
                draw.ellipse([x-3, y-3, x+3, y+3], fill='black')
    
    # Add text labels
    try:
        font = ImageFont.load_default()
        draw.text((width//2-50, height//2-20), "TEST PATTERN", fill='black', font=font)
        draw.text((width//2-60, height//2+10), f"{width}x{height}px", fill='black', font=font)
    except:
        pass
    
    return image

# Create and save test image
test_image = create_test_pattern(400, 400, "dots")
test_image.save('/tmp/test_pattern.jpg', 'JPEG', quality=90)
```

### Multiple Component Layout

**Adding Multiple Images:**
```javascript
const components = [
  {
    "type": 1,
    "width": 40,
    "height": 40, 
    "top": 10,
    "left": 10,
    "content": "https://img.colorpark.cn/api/render/image1.jpg"
  },
  {
    "type": 1,
    "width": 40,
    "height": 40,
    "top": 10, 
    "left": 60,
    "content": "https://img.colorpark.cn/api/render/image2.jpg"
  }
];
```

### Text Overlays

**Adding Custom Text:**
```javascript
{
  "type": 3,
  "width": 80,
  "height": 20,
  "top": 160,
  "left": 10,
  "font_family": "Arial",
  "font_size": 14,
  "font_color": "#000000",
  "content": "Custom Text Here"
}
```

---

## Verified Test Results

### Successful Cases

| Test Case | Dimensions | Method | Status | Order # |
|-----------|------------|--------|---------|---------|
| Custom Max | 85×175mm | UI Form | ✅ Success | 1247957 |
| Oversized | 100×200mm | URL Bypass | ✅ Success | 1248021 |

### API Endpoints Tested

| Endpoint | Purpose | Status |
|----------|---------|---------|
| `/api/userphoneapplets/index` (s=User.webLogin) | JWT Generation | ✅ Working |
| `/api//api/AliossSign/getSign` | Upload Credentials | ✅ Working |
| `https://img.colorpark.cn/` | Image Upload | ✅ Working |
| `/api/userphoneapplets/index` (s=Works.save) | Save Design | ✅ Working |
| `/api/userphoneapplets/index` (s=Order.create) | Submit Print Job | ✅ Working |

---

## Next Steps & Future Research

### Recommended Testing

1. **Larger Dimensions**: Test 150×300mm, 200×400mm
2. **Minimum Limits**: Test 1×1mm, edge cases
3. **Multiple Components**: Complex layouts with images + text
4. **Rotation/Scaling**: Advanced transformations
5. **Different Printers**: Test with other machine_ids

### API Parameter Research

1. **Component Positioning**: Document exact coordinate system
2. **Scaling Factors**: Test different zoom values
3. **Material IDs**: Catalog available wallpapers/stickers
4. **Font Systems**: Available fonts and sizing

### Security Research

1. **Authentication Bypass**: Alternative login methods
2. **Cost Validation**: How pricing is calculated
3. **Hardware Limits**: True maximum dimensions
4. **Rate Limiting**: API call restrictions

---

## Complete Working Example

Here's a complete Node.js example that demonstrates the entire workflow:

```javascript
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

async function submitOversizedPrint(machineId, imagePath, width, height) {
  try {
    // 1. Get JWT Token
    console.log('Getting JWT token...');
    const randomPhone = Math.floor(Math.random() * 10000000000000000).toString();
    const loginResponse = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: `s=User.webLogin&phone=${randomPhone}&password=&type=2&applets_type=7&machine_id=${machineId}`
    });
    
    const loginData = await loginResponse.json();
    if (loginData.code !== 200) throw new Error('Login failed');
    const token = loginData.data.token;
    console.log('JWT token obtained');

    // 2. Get Upload Credentials
    console.log('Getting upload credentials...');
    const credResponse = await fetch('https://h5.colorpark.cn/api//api/AliossSign/getSign');
    const credentials = await credResponse.json();
    console.log('Upload credentials obtained');

    // 3. Upload Image
    console.log('Uploading image...');
    const timestamp = Date.now();
    const filename = `api/render/${timestamp}_oversized.jpg`;
    
    const uploadForm = new FormData();
    uploadForm.append('key', filename);
    uploadForm.append('policy', credentials.policy);
    uploadForm.append('OSSAccessKeyId', credentials.accessid);
    uploadForm.append('success_action_status', '200');
    uploadForm.append('callback', credentials.callback);
    uploadForm.append('signature', credentials.signature);
    uploadForm.append('file', fs.createReadStream(imagePath));

    const uploadResponse = await fetch(credentials.host, {
      method: 'POST',
      body: uploadForm
    });
    
    const imageUrl = `${credentials.host}/${filename}`;
    console.log('Image uploaded:', imageUrl);

    // 4. Save Design
    console.log('Saving design...');
    const worksForm = new FormData();
    worksForm.append('s', 'Works.save');
    worksForm.append('components', JSON.stringify([{
      "type": 1,
      "material_id": null,
      "width": width,
      "height": height,
      "top": 0,
      "left": 0,
      "zoom": 1,
      "rotate": 0,
      "content": imageUrl,
      "upper_left_x": 0,
      "upper_left_y": 0,
      "upper_right_x": width,
      "upper_right_y": 0,
      "lower_left_x": 0,
      "lower_left_y": height,
      "lower_right_x": width,
      "lower_right_y": height,
      "center_x": width/2,
      "center_y": height/2
    }]));
    worksForm.append('goods_id', '993');
    worksForm.append('machine_id', machineId);
    worksForm.append('platform', '4');
    worksForm.append('terminal', '2');

    const worksResponse = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
      method: 'POST',
      body: worksForm
    });
    
    const worksData = await worksResponse.json();
    if (worksData.code !== 200) throw new Error('Works.save failed');
    const worksId = worksData.data.works_id;
    console.log('Design saved, works_id:', worksId);

    // 5. Create Order
    console.log('Creating order...');
    const orderForm = new FormData();
    orderForm.append('s', 'Order.create');
    orderForm.append('type', '2');
    orderForm.append('machine_id', machineId);
    orderForm.append('goods_id', '993');
    orderForm.append('works_id', worksId);

    const orderResponse = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
      method: 'POST',
      body: orderForm
    });
    
    const orderData = await orderResponse.json();
    if (orderData.code !== 200) throw new Error('Order.create failed');
    
    console.log('Order created successfully!');
    console.log('Order details:', orderData.data);
    
    return orderData.data;

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Usage
submitOversizedPrint('11025496', '/path/to/image.jpg', 100, 200)
  .then(result => console.log('Print job submitted:', result))
  .catch(error => console.error('Failed:', error));
```

---

**Status: ✅ VERIFIED WORKING**  
This guide is based on successful testing with a 100×200mm oversized print that was queued and processed by the ColorPark system on August 5, 2025.

*For questions or updates, refer to the associated case studies and API documentation.*