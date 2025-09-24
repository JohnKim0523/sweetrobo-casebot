# Admin API Usage Guide

## Security Updates Implemented ✅

### 1. **Admin Endpoint Authentication**
All admin endpoints now require Bearer token authentication.

**Your Admin Token:**
```
1e969f1c6a953a9e188c09ffff181be22c42b40966089c04377db4d1600a28f5
```

### 2. **Rate Limiting**
- 30 requests per minute per IP address
- Applies to all API endpoints globally
- Returns 429 (Too Many Requests) when exceeded

### 3. **Security Headers (Helmet.js)**
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- And more security headers automatically applied

### 4. **Dynamic Machine Configuration**
- Machine IDs now loaded from `AVAILABLE_MACHINES` environment variable
- Update in `.env` when you get real machine IDs from Chitu

## How to Use Admin Endpoints

### List S3 Images
```bash
curl -H "Authorization: Bearer 1e969f1c6a953a9e188c09ffff181be22c42b40966089c04377db4d1600a28f5" \
  http://localhost:3001/api/admin/s3-images
```

### Delete S3 Images (Cleanup)
```bash
curl -X DELETE \
  -H "Authorization: Bearer 1e969f1c6a953a9e188c09ffff181be22c42b40966089c04377db4d1600a28f5" \
  -H "Content-Type: application/json" \
  -d '{"authToken": "cleanup-sweetrobo-2025-xY9kL3mN8pQ2wR5t", "olderThanHours": 24}' \
  http://localhost:3001/api/admin/s3-cleanup
```

## Using in Frontend Admin Dashboard

```javascript
// Example: Fetching images in admin dashboard
const response = await fetch('http://localhost:3001/api/admin/s3-images', {
  headers: {
    'Authorization': 'Bearer 1e969f1c6a953a9e188c09ffff181be22c42b40966089c04377db4d1600a28f5'
  }
});
```

## Security Best Practices

1. **Never expose the admin token in frontend code**
   - Store it securely server-side
   - Use environment variables in production

2. **Rotate the admin token regularly**
   - Generate new token: `openssl rand -hex 32`
   - Update `ADMIN_AUTH_TOKEN` in `.env`

3. **Monitor rate limit violations**
   - Check logs for 429 responses
   - May indicate attack attempts

4. **Production Deployment**
   - Use HTTPS only
   - Store tokens in secure key management service
   - Enable CORS for specific domains only
   - Use reverse proxy (nginx) for additional security

## Testing the Security

### Test Authentication (should fail)
```bash
# Without token - should return 401
curl http://localhost:3001/api/admin/s3-images

# With wrong token - should return 401
curl -H "Authorization: Bearer wrong-token" \
  http://localhost:3001/api/admin/s3-images
```

### Test Rate Limiting
```bash
# Send 31 requests in 1 minute - 31st should fail with 429
for i in {1..31}; do
  curl -H "Authorization: Bearer YOUR_TOKEN" \
    http://localhost:3001/api/admin/s3-images
  echo "Request $i"
done
```

## Environment Variables Updated

```env
# New/Updated in backend/.env
ADMIN_AUTH_TOKEN=1e969f1c6a953a9e188c09ffff181be22c42b40966089c04377db4d1600a28f5
AVAILABLE_MACHINES=machine-1,machine-2,machine-3
```

Update `AVAILABLE_MACHINES` when you receive real machine IDs from Chitu.