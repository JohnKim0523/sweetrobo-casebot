# Vertex AI - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Google Cloud (5 mins)
```bash
1. Go to console.cloud.google.com
2. Create project → Enable "Vertex AI API"
3. IAM → Create Service Account → Role: "Vertex AI User"
4. Download JSON key → Save as backend/vertex-ai-key.json
5. Note your Project ID
```

### 2. Configure Backend (1 min)
Edit `backend/.env`:
```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id-here
GOOGLE_APPLICATION_CREDENTIALS=./vertex-ai-key.json
VERTEX_AI_LOCATION=us-central1
```

### 3. Test (1 min)
```bash
cd backend
npm run start:dev

# In another terminal:
curl http://localhost:3001/api/vertex-ai/health
```

## 📡 API Usage

### Edit Image
```javascript
const response = await fetch('http://localhost:3001/api/vertex-ai/edit-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageUrl: 'https://example.com/image.jpg',
    prompt: 'Make colors more vibrant',
    userId: 'user-123'
  })
});

const { success, editedImageUrl } = await response.json();
```

### Check Usage
```javascript
const response = await fetch('http://localhost:3001/api/vertex-ai/usage/user-123');
const { stats } = await response.json();

console.log(`Used: ${stats.requestsUsed}/50 per hour`);
```

## 🔒 Security Checklist
- [ ] Added `vertex-ai-key.json` to `.gitignore`
- [ ] Never committed credentials to Git
- [ ] Set up Google Cloud billing alerts
- [ ] Using HTTPS in production

## 💰 Cost Estimate
- **100 users/day × 2 edits = $12-30/month**
- **500 users/day × 2 edits = $60-150/month**

## 🎯 Example Prompts
```
"Make this image suitable for a phone case with vibrant colors"
"Remove the background and keep only the main subject"
"Add a vintage filter effect"
"Increase saturation by 20% and add warm tones"
"Create a soft blur around the edges"
```

## 📊 Rate Limits
- **50 requests per hour per user**
- Auto-resets every hour
- Returns error when exceeded

## 🐛 Common Issues

**"Failed to load credentials"**
→ Check `GOOGLE_APPLICATION_CREDENTIALS` path

**"Permission denied"**
→ Verify service account has "Vertex AI User" role

**"Model not found"**
→ Ensure Vertex AI API is enabled

## 📚 Full Documentation
See `VERTEX_AI_SETUP_GUIDE.md` for complete details

## 🎉 You're Ready!
Your Gemini 2.0 Flash integration is production-ready with:
✅ Rate limiting (50/hour per user)
✅ Error handling
✅ Usage tracking
✅ Health monitoring
