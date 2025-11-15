# SweetRobo Casebot API Documentation

## API Status Summary

### ✅ Working Endpoints
- **Chitu API Connection**: Successfully connected to MQTT broker
- **Machine Management**: Can retrieve machine list and details
- **Queue System**: Queue stats accessible (currently empty)
- **Order Management**: Order endpoints functional (no orders yet)
- **Health Check**: Base endpoint responding

### ⚠️ Current Issues
1. **AWS SDK**: Using deprecated v2, needs upgrade to v3
2. **Admin Endpoints**: Protected with auth (401 Unauthorized)
3. **Order Creation**: Product ID error (needs valid product catalog)

### 🔒 Exhibition Machine Notice
**IMPORTANT**: The connected machine (CT0700046) is in the exhibition hall. Per Chitu's request:
- ❌ DO NOT modify product prices
- ❌ DO NOT modify inventory
- ✅ Can perform read-only tests
- ✅ Can test print workflows (with caution)

---

## Complete Endpoint Reference

### Base URL
- Development: `http://localhost:3001`
- Production: TBD

### Authentication
- Admin endpoints require Bearer token
- Public endpoints are currently open (needs auth for production)

---

## 1. Chitu Printer API (`/api/chitu`)

### GET `/api/chitu/test`
**Purpose**: Test connection to Chitu API and verify authentication
**Response**:
```json
{
  "timestamp": "2025-09-24T18:53:59.397Z",
  "config": {
    "baseUrl": "https://www.gzchitu.cn",
    "appId": "✅ Configured",
    "appSecret": "✅ Configured"
  },
  "steps": [...]
}
```

### GET `/api/chitu/machines`
**Purpose**: List all available printing machines
**Response**:
```json
{
  "success": true,
  "count": 10,
  "machines": [
    {
      "device_code": "CT0700046",
      "name": "phone case print26",
      "machine_model": "CT-sjk360",
      "online_status": false
    }
  ]
}
```

### GET `/api/chitu/machines/:deviceId`
**Purpose**: Get details for specific machine by device ID
**Parameters**:
- `deviceId`: Encrypted device ID

### GET `/api/chitu/machine/:deviceCode`
**Purpose**: Get machine details by device code
**Parameters**:
- `deviceCode`: Machine code (e.g., "CT0700046")
**Response**:
```json
{
  "success": true,
  "machine": {
    "device_code": "CT0700046",
    "device_name": "phone case print26",
    "machine_model": "CT-sjk360",
    "online_status": false,
    "working_status": "offline",
    "inventory": {
      "paper": 0,
      "ink_cyan": 100,
      "ink_magenta": 100,
      "ink_yellow": 100,
      "ink_black": 100
    }
  }
}
```

### GET `/api/chitu/products/:deviceCode`
**Purpose**: Get product catalog (phone models) for a machine
**Parameters**:
- `deviceCode`: Machine code (e.g., "CT0700046")
**Query Params**:
- `type`: "diy" (phone cases) or "default" (pre-made designs)
- `status`: 1 (active) or 0 (inactive)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 100)
**Response**:
```json
{
  "success": true,
  "count": 99,
  "brands": [
    {
      "id": "B1NfXaFCwjTWFg9n/hfnXw==",
      "name_cn": "苹果",
      "name_en": "Apple",
      "modelList": [
        {
          "name_cn": "iPhone 15 Pro",
          "name_en": "iPhone 15 Pro",
          "show_img": "https://print-oss.gzchitu.cn/iphone/iphone15pro.png",
          "print_img": "https://print-oss.gzchitu.cn/iphone/iphone15pro-print.png",
          "price": "0.00",
          "product_id": "VNr7tjfBrF7P4iJ45I3pPA==",
          "stock": 0
        }
      ]
    }
  ]
}
```
**Note**: The `print_img` URL contains the template with exact dimensions to use for your designs.

### POST `/api/chitu/print`
**Purpose**: Submit print job to queue
**Body**:
```json
{
  "imageUrl": "https://...",
  "phoneModel": "iPhone_15_Pro",
  "caseType": "hard",
  "quantity": 1,
  "deviceCode": "CT0700046"
}
```

### GET `/api/chitu/queue/stats`
**Purpose**: Get print queue statistics
**Response**:
```json
{
  "success": true,
  "stats": {
    "waiting": 0,
    "processing": 0,
    "completed": 0,
    "failed": 0,
    "total": 0,
    "activeJobs": 0,
    "machineLoads": {
      "CT0700046": 0
    }
  }
}
```

### GET `/api/chitu/queue/job/:jobId`
**Purpose**: Get status of specific print job
**Parameters**:
- `jobId`: Job identifier

### POST `/api/chitu/queue/cancel/:jobId`
**Purpose**: Cancel a print job
**Parameters**:
- `jobId`: Job identifier
**Body**:
```json
{
  "reason": "User requested cancellation"
}
```

### GET `/api/chitu/orders/:orderId`
**Purpose**: Get order status
**Parameters**:
- `orderId`: Order identifier

### GET `/api/chitu/orders`
**Purpose**: List all orders
**Response**:
```json
{
  "success": true,
  "count": 0,
  "orders": []
}
```

### POST `/api/chitu/qr-code`
**Purpose**: Upload QR code for payment
**Body**:
```json
{
  "orderId": "...",
  "qrCodeImage": "base64_encoded_image"
}
```

---

## 2. AI API (`/api/ai`)

### POST `/api/ai/ai-edit`
**Purpose**: Edit existing image using AI
**Body**:
```json
{
  "imageUrl": "https://...",
  "prompt": "Add a rainbow effect",
  "style": "artistic"
}
```

### POST `/api/ai/ai-create`
**Purpose**: Generate new image with AI
**Body**:
```json
{
  "prompt": "Create a sunset landscape",
  "style": "photorealistic",
  "dimensions": {
    "width": 1024,
    "height": 1024
  }
}
```

---

## 3. Admin API (`/api/admin`)

### GET `/api/admin/s3-images`
**Purpose**: List images in S3 bucket
**Headers**:
```
Authorization: Bearer <token>
```
**Response**:
```json
{
  "images": [
    {
      "key": "uploads/image.jpg",
      "size": 1024000,
      "lastModified": "2025-09-24T00:00:00Z"
    }
  ]
}
```

### DELETE `/api/admin/s3-images`
**Purpose**: Delete image from S3
**Headers**:
```
Authorization: Bearer <token>
```
**Body**:
```json
{
  "key": "uploads/image.jpg"
}
```

---

## 4. WebSocket Events

### Connection
```javascript
const socket = io('http://localhost:3001');
```

### Events
- `mqtt:connected` - MQTT broker connected
- `mqtt:message` - Message from printer
- `print:status` - Print job status update
- `machine:status` - Machine status change

---

## Missing Endpoints for Production

### Critical Priority
1. **Authentication System**
   - `POST /api/auth/register`
   - `POST /api/auth/login`
   - `POST /api/auth/logout`
   - `POST /api/auth/refresh`
   - `GET /api/auth/verify`

2. **Image Upload**
   - `POST /api/upload/image`
   - `GET /api/upload/presigned-url`
   - `POST /api/upload/validate`

3. **Payment Integration**
   - `POST /api/payment/create`
   - `GET /api/payment/status/:id`
   - `POST /api/payment/webhook`
   - `POST /api/payment/refund`

4. **User Management**
   - `GET /api/user/profile`
   - `PUT /api/user/profile`
   - `GET /api/user/orders`
   - `DELETE /api/user/account`

5. **Product Catalog**
   - `GET /api/products/phone-models`
   - `GET /api/products/case-types`
   - `GET /api/products/pricing`
   - `GET /api/products/materials`

### Medium Priority
1. **Analytics**
   - `GET /api/analytics/sales`
   - `GET /api/analytics/usage`
   - `GET /api/analytics/machines`

2. **Notifications**
   - `POST /api/notifications/email`
   - `POST /api/notifications/sms`
   - `GET /api/notifications/preferences`

3. **Support**
   - `POST /api/support/ticket`
   - `GET /api/support/tickets`
   - `POST /api/support/feedback`

---

## Error Codes

| Code | Description | Action |
|------|-------------|--------|
| 200 | Success | - |
| 400 | Bad Request | Check request format |
| 401 | Unauthorized | Provide valid auth token |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Verify endpoint/resource |
| 429 | Rate Limited | Wait before retrying |
| 500 | Server Error | Contact support |

---

## Rate Limiting
- Current: 30 requests per minute per IP
- Production: Should implement user-based limits

---

## Environment Variables Required

```env
# Chitu API
CHITU_APP_ID=
CHITU_APP_SECRET=
CHITU_BASE_URL=https://www.gzchitu.cn

# AWS
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=

# MQTT
MQTT_BROKER_URL=wss://open-mqtt.gzchitu.cn
MQTT_USERNAME=
MQTT_PASSWORD=

# Auth
JWT_SECRET=
ADMIN_TOKEN=

# Database (for production)
DATABASE_URL=

# Redis (for queue)
REDIS_HOST=
REDIS_PORT=
```

---

## Testing Checklist

### ✅ Tested & Working
- [x] Health check endpoint
- [x] Chitu API connection test
- [x] Machine list retrieval
- [x] Specific machine details
- [x] Queue statistics
- [x] Order list (empty)
- [x] MQTT connection

### ⚠️ Needs Testing with Valid Data
- [ ] Print job submission (needs valid product)
- [ ] Order creation (needs product catalog)
- [ ] QR code upload
- [ ] AI image editing
- [ ] AI image generation

### 🔒 Requires Auth Token
- [ ] S3 image listing
- [ ] S3 image deletion
- [ ] Admin functions

---

## Notes for Production Deployment

1. **Security**
   - Implement proper authentication on all endpoints
   - Use HTTPS only
   - Add request validation middleware
   - Implement API key rotation

2. **Performance**
   - Add caching layer (Redis)
   - Implement database connection pooling
   - Add CDN for static assets
   - Optimize image processing

3. **Monitoring**
   - Add APM (Application Performance Monitoring)
   - Implement error tracking (Sentry)
   - Add request logging
   - Set up health check monitoring

4. **Compliance**
   - Add GDPR compliance features
   - Implement data retention policies
   - Add audit logging
   - Ensure PCI compliance for payments