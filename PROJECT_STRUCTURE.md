# SweetRobo CaseBot - Project Structure

## Overview
Phone case printing kiosk application with QR code scanning, image upload/generation, and direct printing to Chitu machines.

## Clean Architecture

```
sweetrobo-casebot-webapp/
├── frontend/               # Next.js frontend application
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.tsx          # Entry point - routes to upload or model selection
│   │   │   ├── select-model.tsx   # Phone model selection (for demo/testing)
│   │   │   ├── upload.tsx         # Image upload/AI generation page
│   │   │   ├── canvas-editor.tsx  # Canvas editing page
│   │   │   ├── success.tsx        # Print success confirmation
│   │   │   └── admin.tsx          # Admin dashboard
│   │   ├── styles/
│   │   └── types/
│   │       └── phone-models.ts    # Phone model configurations
│
├── backend/                # NestJS backend application
│   ├── src/
│   │   ├── chitu/         # Chitu printer integration
│   │   │   ├── chitu.service.ts      # Main printer service
│   │   │   ├── chitu.controller.ts   # API endpoints
│   │   │   ├── chitu.module.ts       # Module configuration
│   │   │   └── chitu.types.ts        # TypeScript types
│   │   ├── queue/         # Print queue management
│   │   │   └── simple-queue.service.ts
│   │   ├── s3/            # AWS S3 image storage
│   │   └── admin/         # Admin functionality
│   └── tests/             # Test scripts (organized)

## User Flow

### 1. Entry Points
- **QR Code**: `/?machine=CT0700026` → Upload page with machine ID
- **Direct Access**: `/` → Model selection → Upload page

### 2. Image Creation
- **Upload Page** (`/upload`)
  - Drag & drop image upload
  - AI image generation with prompts
  - Quick prompt suggestions
  - Stores image in sessionStorage

### 3. Image Editing
- **Canvas Editor** (`/canvas-editor`)
  - Fabric.js canvas for manipulation
  - Tools: Rotate, Scale, Flip, Center
  - Live preview on phone case outline
  - Direct print submission

### 4. Printing
- **Backend Processing**
  - Image sent to `/api/chitu/print`
  - Queued for specific machine
  - Sent to Chitu API
  - Real-time status via MQTT

### 5. Confirmation
- **Success Page** (`/success`)
  - Order confirmation display
  - Auto-redirect after 10 seconds
  - Option to create another design

## Key Features

### Multi-Machine Support
- Each kiosk has unique QR code with machine ID
- Queue management per machine
- Load balancing across machines
- Real-time machine status

### Image Processing
- Client-side canvas editing
- Base64 image encoding
- TIF format conversion for printing
- Session-based image storage

### Admin Dashboard
- View all machines and status
- Monitor print queues
- Track order history
- System statistics

## API Endpoints

### Frontend → Backend
- `POST /api/chitu/print` - Submit print job
- `GET /api/chitu/machines` - List available machines
- `GET /api/chitu/machine/:id` - Get machine details
- `GET /api/chitu/queue/stats` - Queue statistics

### Backend → Chitu API
- Machine list and status
- Create print orders
- Monitor printer status
- MQTT real-time updates

## Environment Variables

### Backend (.env)
```
CHITU_APP_ID=ct0feee2e5ad8b1913
CHITU_APP_SECRET=c1f1d8de63ed4a08b252f54d0df5eced
CHITU_BASE_URL=https://www.gzchitu.cn
AVAILABLE_MACHINES=CT0700026
```

## Development

### Start Frontend
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

### Start Backend
```bash
cd backend
npm run start:dev
# Runs on http://localhost:3001
```

### Test Machine Integration
```bash
cd backend/tests
node check-phonecase-status.js
```

## Production Deployment

### Docker Support
- Frontend: Next.js production build
- Backend: NestJS production build
- Both containerized with Docker

### Scaling Considerations
- Redis for distributed queues
- CDN for image delivery
- Load balancer for multiple instances
- Database for order persistence

## Removed Files (Cleanup Complete)
- ✅ Removed complex editor.tsx and variants
- ✅ Organized test files into tests/
- ✅ Removed duplicate phonecase-integration.service
- ✅ Cleaned up backup files and unused assets
- ✅ Simplified routing structure

## Current Status
- ✅ Clean, streamlined architecture
- ✅ Clear separation of concerns
- ✅ Simple user flow: Upload → Edit → Print
- ✅ Multi-machine ready
- ✅ Production ready