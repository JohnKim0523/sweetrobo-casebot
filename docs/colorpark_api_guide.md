# ColorPark API Integration Guide

This guide provides instructions for integrating with the ColorPark printer API, including authentication (JWT tokens) and image upload functionality.

## Table of Contents
- [JWT Authentication](#jwt-authentication)
- [Image Upload Process](#image-upload-process)
- [Important Notes](#important-notes)

## JWT Authentication

### Understanding JWT-Printer Relationship

**Critical Finding**: Each printer ID has its own unique JWT token. You cannot use a JWT from one printer to submit jobs to another printer.

- Each printer (machine_id) gets a unique user account
- Username format: `{printer_id}{timestamp}{random_numbers}`
- JWT tokens are valid for ~100 days
- The JWT contains a user ID (uid) that is tied to a specific printer

### Getting a JWT Token

#### Method 1: API Endpoint (Recommended)

Generate a new JWT token for a specific printer using the webLogin endpoint with an auto-generated phone number:

```bash
curl -X POST 'https://h5.colorpark.cn/api/userphoneapplets/index' \
    -H 'Content-Type: application/x-www-form-urlencoded;charset=utf-8' \
    -H 'Accept: */*' \
    -H 'Origin: https://h5.colorpark.cn' \
    -H 'Referer: https://h5.colorpark.cn/' \
    -H 'User-Agent: Mozilla/5.0' \
    -d 's=User.webLogin&phone='$(echo $RANDOM$RANDOM$RANDOM$RANDOM)'&password=&type=2&applets_type=7&machine_id=11025496'
```

**Parameters:**
- `s=User.webLogin` - The service method for login
- `phone` - A random phone number (can be auto-generated)
- `password` - Empty for visitor/guest login
- `type=2` - Login type (2 appears to be for visitor/auto-registration)
- `applets_type=7` - Application type
- `machine_id` - The printer ID you want to authenticate with

**Response:**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": 371858,
    "username": "1234567890123456",
    "phone": "1234567890123456",
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
  }
}
```

#### Method 2: Browser-Based Auto-Login

When you navigate to the app with a valid machine_id, it automatically creates a visitor account and generates a JWT:

```
https://h5.colorpark.cn/#/pages/index/index_phone?machine_id=11025496
```

The JWT is stored in localStorage under the keys `bindWx` and `globalData`.

### JWT Token Structure

Example decoded JWT payload:
```json
{
  "iss": "http://www.refinecolor.com",     // Issuer
  "aud": "refinecolor",                    // Audience  
  "iat": 1754335174,                       // Issued At
  "nbf": 1754335174,                       // Not Before
  "exp": 1762975174,                       // Expiration (~100 days)
  "uid": 371851                            // User ID (tied to printer)
}
```

### Using the JWT Token

Include the JWT in your API requests (exact header/parameter TBD):
```javascript
// Likely one of these formats:
headers: {
  'Authorization': 'Bearer {jwt_token}'
  // OR
  'token': '{jwt_token}'
}
```

## Image Upload Process

The upload process uses Aliyun OSS (Object Storage Service) directly, bypassing the main API server.

### Step 1: Get Signing Credentials

Request temporary upload credentials from the API:

```bash
curl -X GET 'https://h5.colorpark.cn/api//api/AliossSign/getSign' \
  -H 'Accept: */*' \
  -H 'Origin: https://h5.colorpark.cn' \
  -H 'Referer: https://h5.colorpark.cn/' \
  -H 'User-Agent: Mozilla/5.0'
```

Response:
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

Upload directly to the CDN using the credentials from Step 1:

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

### Upload Response

After successful upload, Aliyun OSS will:
1. Store the file at the CDN
2. Call back to the ColorPark server with file details
3. Return the file URL and metadata

The uploaded file will be accessible at:
```
https://img.colorpark.cn/api/render/[your_file_key]
```

## Important Notes

### Security Considerations

1. **JWT tokens are printer-specific**: Each printer requires its own JWT token
2. **Signing credentials expire**: Get fresh credentials before each upload session
3. **Access keys are public**: The Aliyun access key is exposed in the API response

### Limitations

1. **Machine ID validation**: Some machine_ids may not be valid or active (e.g., 11025496 works, 99999999 doesn't)
2. **Upload directory**: Files must be uploaded with the `api/render/` prefix
3. **Print job submission**: The endpoint for submitting print jobs after upload still needs to be discovered

### Example Implementation

```javascript
// Step 1: Get JWT token for a printer
async function getJWTToken(printerId) {
  const randomPhone = Math.floor(Math.random() * 10000000000000000).toString();
  
  const response = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      'Accept': '*/*',
      'Origin': 'https://h5.colorpark.cn',
      'Referer': 'https://h5.colorpark.cn/',
      'User-Agent': 'Mozilla/5.0'
    },
    body: `s=User.webLogin&phone=${randomPhone}&password=&type=2&applets_type=7&machine_id=${printerId}`
  });
  
  const data = await response.json();
  if (data.code === 200) {
    return data.data.token;
  }
  throw new Error('Failed to get JWT token');
}

// Step 2: Get upload credentials
async function getUploadCredentials() {
  const response = await fetch('https://h5.colorpark.cn/api//api/AliossSign/getSign');
  return await response.json();
}

// Step 3: Upload image
async function uploadImage(file, credentials) {
  const formData = new FormData();
  const timestamp = Date.now();
  const filename = `api/render/${timestamp}_${file.name}`;
  
  formData.append('key', filename);
  formData.append('policy', credentials.policy);
  formData.append('OSSAccessKeyId', credentials.accessid);
  formData.append('success_action_status', '200');
  formData.append('callback', credentials.callback);
  formData.append('signature', credentials.signature);
  formData.append('file', file);
  
  const response = await fetch(credentials.host, {
    method: 'POST',
    body: formData
  });
  
  return await response.json();
}

// Complete workflow example
async function printWorkflow(printerId, imageFile) {
  try {
    // Get JWT for the specific printer
    const jwtToken = await getJWTToken(printerId);
    console.log('JWT obtained:', jwtToken);
    
    // Get upload credentials
    const credentials = await getUploadCredentials();
    console.log('Upload credentials obtained');
    
    // Upload the image
    const uploadResult = await uploadImage(imageFile, credentials);
    console.log('Image uploaded:', uploadResult);
    
    // TODO: Submit print job using JWT and uploaded image URL
    // This endpoint needs to be discovered
    
    return uploadResult;
  } catch (error) {
    console.error('Workflow failed:', error);
    throw error;
  }
}
```

## Additional API Endpoints

Other discovered endpoints that may be useful:

- `POST /api/userphoneapplets/index` - Main API gateway
  - `s=Product.getBrands` - Get product brands
  - `s=Machine.getBaseSetting` - Get machine settings
  - `s=Product.getCustomize` - Get customization options
  - `s=Ad.list` - Get advertisements
  - `s=User.verifyToken` - Verify JWT token

- `POST /api//api/material/mchineFontFamilyList` - Get available fonts
- `POST /api//api/MachinePrivacy/MachinePrivacy` - Machine privacy settings

## Next Steps

To fully integrate with the API, you'll need to:

1. **Determine the exact auto-login API call** - Monitor network traffic during initial page load
2. **Test JWT usage** - Confirm which headers/parameters accept the JWT token
3. **Implement print job submission** - Discover the API endpoint for submitting print jobs
4. **Handle callbacks** - Implement webhook handlers for upload and print callbacks

---

*Last updated: February 2025*
*Note: This documentation is based on reverse engineering and may be incomplete or subject to change.*