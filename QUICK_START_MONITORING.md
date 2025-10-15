# Quick Start: Monitoring Your AI Costs

## 🚨 Set Up Billing Alerts (5 minutes)

### Step 1: Go to Google Cloud Billing
https://console.cloud.google.com/billing/budgets

### Step 2: Create Budget
1. Click **CREATE BUDGET**
2. **Project:** `gemini-flash-image-475018`
3. **Services:** Select "Vertex AI API"
4. **Budget Amount:** $50/month (for testing)
5. **Alert Thresholds:**
   - 25% ($12.50)
   - 50% ($25)
   - 75% ($37.50)
   - 90% ($45)
   - 100% ($50)
6. **Email:** Your email address
7. Click **FINISH**

---

## 📊 Check Costs Anytime

### Option 1: Backend API
```bash
curl http://localhost:3001/api/vertex-ai/costs
```

### Option 2: Backend Console
Look for this in your backend terminal:
```
💰 Cost tracking: $0.039 this request | $0.12 total (3 requests)
```

### Option 3: Google Cloud Console
https://console.cloud.google.com/billing/reports

Filter by:
- **Service:** Vertex AI
- **Time Range:** Last 7 days

---

## 💰 Cost Calculator

**Formula:** Daily Users × Edits per User × $0.039 × 30 days

**Examples:**
- 50 users, 3 edits/day = **$175.50/month**
- 100 users, 3 edits/day = **$351/month**
- 200 users, 3 edits/day = **$702/month**
- 500 users, 3 edits/day = **$1,755/month**

---

## ⚠️ What to Watch For

### 1. Unusual Spikes
If costs suddenly jump, check:
- Are users making more edits than expected?
- Is someone abusing the API?
- Are there failed requests being retried too many times?

### 2. Rate Limit Warnings
Backend will log:
```
⏱️ Retry attempt 1/3 after 1000ms
```

If you see many retries, it could indicate:
- Google API rate limits being hit
- Network issues
- Need for request queuing

### 3. Timeout Errors
Frontend will show:
```
⏰ Request timed out. The AI service took too long to respond.
```

If frequent, consider:
- Increasing timeout (currently 30s)
- Smaller image sizes
- Investigating Google Cloud service health

---

## 🔧 Quick Actions

### Increase Rate Limit (Per User)
**File:** `backend/src/services/vertexAI.service.ts:24`
```typescript
private readonly MAX_REQUESTS_PER_HOUR = 50; // Change to 100, 200, etc.
```

### Increase Timeout
**File:** `backend/src/services/vertexAI.service.ts:31`
```typescript
private readonly REQUEST_TIMEOUT = 30000; // Change to 60000 (60 seconds)
```

### Change Cost Tracking
**File:** `backend/src/services/vertexAI.service.ts:34`
```typescript
private readonly COST_PER_IMAGE = 0.039; // Update if pricing changes
```

---

## 📱 Emergency: Stop All Requests

### Option 1: Disable Vertex AI Endpoint
Comment out the controller:
```typescript
// @Post('edit-image')
// async editImage(@Body() dto: EditImageDto) {
//   ...
// }
```

### Option 2: Return Error Immediately
Add at top of `editImage` method:
```typescript
return {
  success: false,
  error: 'Service temporarily unavailable. Please try again later.'
};
```

### Option 3: Disable Vertex AI API in Google Cloud
https://console.cloud.google.com/apis/api/aiplatform.googleapis.com

Click **DISABLE API** (can re-enable anytime)

---

## ✅ Daily Monitoring Checklist (First Week)

- [ ] Check cost endpoint: `curl http://localhost:3001/api/vertex-ai/costs`
- [ ] Review backend logs for errors or high retry counts
- [ ] Check Google Cloud billing: https://console.cloud.google.com/billing/reports
- [ ] Verify rate limits aren't being hit too frequently
- [ ] Monitor user complaints about timeouts or errors

**After first week:** Check 2-3 times per week, then weekly once stable.

---

## 🎯 When to Scale

### Need Redis Rate Limiting When:
- Running multiple server instances (horizontal scaling)
- Rate limits not working consistently
- Server restarts frequently

### Need Request Queuing When:
- Getting Google API rate limit errors
- Traffic spikes causing timeouts
- Need better request prioritization

### Need to Increase Budget When:
- Approaching 90% of monthly budget consistently
- User base growing rapidly
- Adding premium features with more edits

---

## 🆘 Support

### Check Logs
**Backend:** Look for emoji indicators:
- ✅ Success
- ❌ Errors
- ⏳ Retries
- 💰 Costs
- 🔍 Debug info

### Common Issues

**"Rate limit exceeded"**
- User hit 50 requests/hour limit
- Solution: Increase limit or wait 1 hour

**"Request timeout"**
- Image too large or Google API slow
- Solution: Increase timeout or reduce image size

**"No candidates returned"**
- Safety filters blocked the edit
- Solution: User needs different prompt

**Costs higher than expected**
- Check if users are making more edits than planned
- Review backend logs for request count
- Consider implementing user tiers (free: 3/day, paid: unlimited)

---

## 📞 Need Help?

1. Check backend logs for detailed error messages
2. Review `PRODUCTION_READY_SUMMARY.md` for full details
3. Check Google Cloud Console for API status
4. Review Vertex AI documentation: https://cloud.google.com/vertex-ai/docs
