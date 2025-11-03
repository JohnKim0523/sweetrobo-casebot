# ⚡ Quick Deploy Checklist

## Prerequisites ✅
- [x] Code pushed to GitHub: `https://github.com/JohnKim0523/sweetrobo-casebot.git`
- [ ] Railway account: https://railway.app (sign up with GitHub)
- [ ] Vercel account: https://vercel.com (sign up with GitHub)

---

## Step 1: Railway Backend (10 min)

### 1.1 Create Project
1. Go to https://railway.app/new
2. Click **"Deploy from GitHub repo"**
3. Select: `JohnKim0523/sweetrobo-casebot`
4. Click **"Deploy"**

### 1.2 Set Root Directory
1. Click your service → **Settings**
2. **Root Directory**: `backend`
3. Save

### 1.3 Add Database & Redis
1. Click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Click **"+ New"** → **"Database"** → **"Redis"**

### 1.4 Add Environment Variables
Click **"Variables"** tab and paste:

```env
PORT=3001
NODE_ENV=production

# AWS S3 (Required)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket
S3_BUCKET_NAME=your-bucket

# Google Vertex AI (Required)
GOOGLE_CLOUD_PROJECT_ID=your_project
VERTEX_AI_LOCATION=us-central1

# Chitu (Required)
CHITU_APP_ID=your_app_id
CHITU_APP_SECRET=your_app_secret
CHITU_API_URL=https://www.gzchitu.cn
CHITU_MQTT_BROKER=open-mqtt.gzchitu.cn
CHITU_MQTT_PORT=1883
CHITU_MQTT_USERNAME=your_app_id
CHITU_MQTT_PASSWORD=your_mqtt_password
AVAILABLE_MACHINES=CT0700026

# Security
ADMIN_AUTH_TOKEN=your_secure_token
CLEANUP_AUTH_TOKEN=your_cleanup_token
PRINTER_AUTH_TOKENS=token1,token2

# Frontend (add after Vercel deployment)
FRONTEND_URL=https://your-app.vercel.app
```

### 1.5 Upload Vertex AI Key
```bash
# In Railway CLI or Settings → Data
Upload: vertex-ai-key.json
```

### 1.6 Generate Domain
1. **Settings** → **Networking**
2. Click **"Generate Domain"**
3. **COPY THIS URL** → `https://sweetrobo-backend-production.up.railway.app`

---

## Step 2: Vercel Frontend (5 min)

### 2.1 Import Project
1. Go to https://vercel.com/new
2. Select `JohnKim0523/sweetrobo-casebot`
3. Click **"Import"**

### 2.2 Configure
- **Root Directory**: `frontend`
- **Framework**: Next.js (auto-detected)

### 2.3 Add Environment Variable
```env
NEXT_PUBLIC_API_URL=https://your-railway-backend-url.up.railway.app
```
*(Use the URL from Step 1.6)*

### 2.4 Deploy
1. Click **"Deploy"**
2. Wait 2-3 minutes
3. **COPY YOUR URL** → `https://sweetrobo.vercel.app`

---

## Step 3: Update CORS (2 min)

1. Go back to **Railway**
2. Update **FRONTEND_URL** variable to your Vercel URL
3. Railway auto-redeploys

---

## 🎉 DONE!

### Your Live App:
- **Frontend**: `https://your-app.vercel.app`
- **Backend**: `https://your-backend.up.railway.app`
- **Admin**: `https://your-app.vercel.app/admin`

### Test Multi-User:
1. Open app in Chrome
2. Open same app in incognito
3. Both should work simultaneously!

---

## Need Help?

📖 **Full Guide**: See `DEPLOYMENT_GUIDE.md`
🐛 **Issues**: https://github.com/JohnKim0523/sweetrobo-casebot/issues
