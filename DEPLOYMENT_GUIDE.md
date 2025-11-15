# 🚀 SweetRobo Deployment Guide

## Quick Deploy (20 minutes)

This guide will deploy your app to:
- **Frontend**: Vercel (Free tier - Global CDN)
- **Backend**: Railway (Free $5/month credit)
- **Database**: Railway PostgreSQL (Included)
- **Redis**: Railway Redis (Included)

---

## Prerequisites

1. **GitHub Account** ✅ (Already set up: https://github.com/JohnKim0523/sweetrobo-casebot.git)
2. **Vercel Account** (Sign up with GitHub: https://vercel.com)
3. **Railway Account** (Sign up with GitHub: https://railway.app)

---

## Step 1: Push Latest Code to GitHub (2 min)

```bash
git add .
git commit -m "Add database and Redis support for deployment"
git push origin main
```

---

## Step 2: Deploy Backend to Railway (8 min)

### 2.1 Create Railway Project
1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose: `JohnKim0523/sweetrobo-casebot`
5. Select **"Deploy Now"**

### 2.2 Add PostgreSQL Database
1. In your Railway project, click **"+ New"**
2. Select **"Database" → "PostgreSQL"**
3. Railway will auto-create `DATABASE_URL` environment variable

### 2.3 Add Redis
1. Click **"+ New"** again
2. Select **"Database" → "Redis"**
3. Railway will auto-create `REDIS_URL` environment variable

### 2.4 Configure Backend Service
1. Click on your backend service
2. Go to **"Settings" → "Root Directory"**
3. Set to: `backend`
4. Go to **"Variables"** tab
5. Add these environment variables:

```env
# Railway auto-provides these:
# DATABASE_URL (from PostgreSQL addon)
# REDIS_URL (from Redis addon)

# You need to add these manually:
PORT=3001
NODE_ENV=production

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
S3_BUCKET_NAME=your-bucket-name

# Google Vertex AI
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project
GOOGLE_APPLICATION_CREDENTIALS=./vertex-ai-key.json
VERTEX_AI_LOCATION=us-central1

# Chitu Printer API
CHITU_APP_ID=your_chitu_app_id
CHITU_APP_SECRET=your_chitu_app_secret
CHITU_API_URL=https://www.gzchitu.cn
CHITU_DEFAULT_PRODUCT_ID=dZesWMYqBIuCwV1qr6Ugxw==
CHITU_DEFAULT_PAY_TYPE=nayax

# MQTT
CHITU_MQTT_BROKER=open-mqtt.gzchitu.cn
CHITU_MQTT_PORT=1883
CHITU_MQTT_USERNAME=your_chitu_app_id
CHITU_MQTT_PASSWORD=your_mqtt_password

# Available Machines
AVAILABLE_MACHINES=CT0700046

# Security Tokens
ADMIN_AUTH_TOKEN=your-secure-admin-token
CLEANUP_AUTH_TOKEN=your-secure-cleanup-token
PRINTER_AUTH_TOKENS=printer123,printer456,printer789

# Frontend URL (will update after Vercel deployment)
FRONTEND_URL=https://your-app.vercel.app
```

### 2.5 Upload Vertex AI Credentials
1. In Railway, go to **"Settings" → "Data"**
2. Upload your `vertex-ai-key.json` file
3. Or use Railway CLI to upload:
```bash
railway up vertex-ai-key.json
```

### 2.6 Get Backend URL
1. Go to **"Settings" → "Networking"**
2. Click **"Generate Domain"**
3. Copy the URL (e.g., `https://sweetrobo-backend-production.up.railway.app`)
4. **Save this URL - you'll need it for frontend!**

---

## Step 3: Deploy Frontend to Vercel (5 min)

### 3.1 Import Project
1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select: `JohnKim0523/sweetrobo-casebot`
4. Click **"Import"**

### 3.2 Configure Build Settings
- **Framework Preset**: Next.js (auto-detected)
- **Root Directory**: `frontend`
- **Build Command**: `npm run build` (auto-detected)
- **Output Directory**: `.next` (auto-detected)

### 3.3 Add Environment Variables
Click **"Environment Variables"** and add:

```env
NEXT_PUBLIC_API_URL=https://your-backend-url.up.railway.app
```
*(Replace with your Railway backend URL from Step 2.6)*

### 3.4 Deploy
1. Click **"Deploy"**
2. Wait 2-3 minutes for build
3. Copy your Vercel URL (e.g., `https://sweetrobo-casebot.vercel.app`)

---

## Step 4: Update CORS Settings (2 min)

### 4.1 Update Backend FRONTEND_URL
1. Go back to Railway
2. Update the `FRONTEND_URL` environment variable to your Vercel URL:
```env
FRONTEND_URL=https://sweetrobo-casebot.vercel.app
```
3. Railway will auto-redeploy

---

## Step 5: Test Deployment (3 min)

### 5.1 Access Your App
Open your Vercel URL: `https://sweetrobo-casebot.vercel.app`

### 5.2 Test Multi-User
1. Open app in Chrome
2. Open same app in incognito/Firefox
3. Both users should be able to:
   - Select phone models
   - Upload/generate images
   - Submit print jobs
   - See orders in queue

### 5.3 Verify Database
1. Railway dashboard → PostgreSQL
2. Check "Tables" - should see `orders` and `sessions`

### 5.4 Verify Redis
1. Railway dashboard → Redis
2. Check "Metrics" - should see active connections

---

## 🎉 You're Live!

### Your Live URLs:
- **Frontend**: `https://sweetrobo-casebot.vercel.app`
- **Backend API**: `https://your-backend.up.railway.app`
- **Admin Panel**: `https://sweetrobo-casebot.vercel.app/admin`

### Share with Testers:
Send them the Vercel URL and they can start testing immediately!

---

## Monitoring & Logs

### Vercel (Frontend)
- **Logs**: Vercel Dashboard → Your Project → "Logs"
- **Analytics**: Free tier includes basic analytics
- **Errors**: Real-time error tracking

### Railway (Backend)
- **Logs**: Railway Dashboard → Backend Service → "Logs"
- **Metrics**: CPU, Memory, Network usage
- **Database**: Query performance, connection pool

---

## Costs

### Free Tier Limits:
- **Vercel**: Unlimited bandwidth, 100GB-hours/month
- **Railway**: $5/month credit (≈500 hours runtime)
- **PostgreSQL**: 1GB storage, 100 concurrent connections
- **Redis**: 100MB storage

### When You'll Need to Pay:
- Railway: After $5 credit exhausted (~3-4 weeks with moderate traffic)
- Cost: ~$10-20/month for backend + database + Redis

---

## Troubleshooting

### Backend Won't Start
1. Check Railway logs for errors
2. Verify all environment variables are set
3. Check PostgreSQL and Redis are running

### Frontend Can't Connect to Backend
1. Verify `NEXT_PUBLIC_API_URL` in Vercel
2. Check CORS settings in backend
3. Verify backend is running (check Railway logs)

### Database Connection Failed
1. Ensure `DATABASE_URL` is set by Railway
2. Check PostgreSQL service is running
3. Verify SSL settings (Railway uses SSL)

### Redis Connection Failed
1. Ensure `REDIS_URL` or `REDIS_HOST/PORT` is set
2. Check Redis service is running
3. Verify password if required

---

## Next Steps

### Production Hardening:
1. **Custom Domain**: Add your domain in Vercel settings
2. **SSL Certificate**: Auto-provided by Vercel
3. **Monitoring**: Add Sentry for error tracking
4. **Backups**: Enable Railway PostgreSQL backups
5. **Scaling**: Railway auto-scales based on traffic

### Security:
1. Rotate all auth tokens before going live
2. Enable Railway's IP whitelist for admin endpoints
3. Add rate limiting (already configured)
4. Review and restrict CORS origins

---

## Support

- **Railway Docs**: https://docs.railway.app
- **Vercel Docs**: https://vercel.com/docs
- **Issues**: https://github.com/JohnKim0523/sweetrobo-casebot/issues
