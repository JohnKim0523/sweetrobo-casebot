# Phone Case Masking Implementation

## ✅ COMPLETED

### Folder Structure
```
frontend/public/phone-models/
├── thumbnails/           # WebP files for UI preview only
│   ├── iPhone 15Pro-FG.webp
│   └── iPhone-16.png
└── print-masks/          # PNG files with cutouts (BLACK=design, WHITE=transparent)
    └── iphone15pro-print.png
```

### File Roles

1. **Thumbnail (WebP)** - `thumbnailPath`
   - Used for UI preview in editor
   - NOT used for printing
   - Can be any resolution for display

2. **Print Mask (PNG)** - `printMaskPath`
   - Used to create camera cutouts
   - **BLACK areas** = Where user's design goes
   - **WHITE areas** = Camera cutout (stays transparent)
   - Exact dimensions from Chitu API (711×1471px for iPhone 15 Pro)

## Implementation Details

### 1. Updated PhoneModel Interface
```typescript
interface PhoneModel {
  // ... other fields
  thumbnailPath?: string;  // WebP for UI (optional)
  printMaskPath: string;   // PNG mask (required)
  chituProductId?: string; // For API submission
}
```

### 2. Masking Algorithm (Simplified)

**Old approach** (commented out):
- Complex edge-scanning algorithm (200+ lines)
- Tried to distinguish interior vs exterior transparent areas
- Error-prone and slow

**New approach** (current):
- Simple luminosity-based masking
- BLACK (luminosity 0) → Keep design (alpha = 255)
- WHITE (luminosity 255) → Remove design (alpha = 0)
- ~50 lines of code

**Code location**: `frontend/src/pages/editor.tsx` lines 2950-2991

### 3. Masking Process

```typescript
// Step 1: Draw user's design
ctx.drawImage(designImage, 0, 0, finalWidth, finalHeight);

// Step 2: Invert mask luminosity to alpha channel
// BLACK → opaque (255), WHITE → transparent (0)
for (let i = 0; i < pixels.length; i += 4) {
  const luminosity = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
  pixels[i + 3] = 255 - luminosity; // Invert
}

// Step 3: Apply mask using destination-in composite
ctx.globalCompositeOperation = 'destination-in';
ctx.drawImage(maskCanvas, 0, 0);

// Result: PNG with transparency (camera cutouts)
```

## Testing

### Visual Test
1. Start frontend: `cd frontend && npm run dev`
2. Go to: `http://localhost:3000/editor?machine=CT0700026`
3. Upload an image
4. Click "Print" to export
5. Check browser console logs:
   ```
   🎭 Applying print mask: /phone-models/print-masks/iphone15pro-print.png
   ✅ Print mask loaded: 711 x 1471
   ✅ Drew design at full resolution
   ✅ Inverted mask (BLACK=keep, WHITE=cutout)
   ✅ Applied mask - camera cutouts created
   ✅ Final masked image: 711 x 1471 PNG with transparency
   ```

### Verify Output
- Right-click preview image → "Save Image As..."
- Open in image editor
- Verify:
  - ✅ Image is 711×1471 pixels
  - ✅ Camera cutout area is transparent
  - ✅ Design fills BLACK areas from mask
  - ✅ PNG format with alpha channel

## Admin Dashboard (TODO)

Currently, the backend queue service receives the masked image. To show it in admin dashboard:

1. Update `SimpleQueueService` to store `imageUrl` for completed jobs
2. Add endpoint: `GET /api/admin/queue/jobs` to list recent jobs with images
3. Create admin page at `/admin/jobs` to display:
   - Job ID
   - Phone model
   - Preview of masked image
   - Status (pending/printing/completed)
   - Timestamp

## Supported Models

| Model | Dimensions | Print Mask | Product ID | Status |
|-------|-----------|------------|------------|--------|
| iPhone 15 Pro | 711×1471px | ✅ Available | VNr7tjfBrF7P4iJ45I3pPA== | ✅ Ready |
| iPhone 16 Pro | 916×1925px | ⚠️ Placeholder | jdv3DGpk66EXwbz2YA+OaQ== | ⏳ Need template |
| iPhone 16 Pro Max | 985×2097px | ⚠️ Placeholder | dZesWMYqBIuCwV1qr6Ugxw== | ⏳ Need template |

## Next Steps

1. **Download remaining templates** from Chitu:
   ```bash
   curl -o iphone16pro-print.png https://print-oss.gzchitu.cn/iphone/iphone16pro-print.png
   curl -o iphone16promax-print.png https://print-oss.gzchitu.cn/iphone/16promax-print.png
   ```

2. **Measure dimensions** and update phone-models.ts

3. **Test on real printer** to verify output matches expectations

4. **Implement admin dashboard** to view final composited images

## Key Improvements

✅ **Organized file structure** - Clear separation of thumbnails vs print masks
✅ **Simplified masking** - 50 lines instead of 200+
✅ **Correct dimensions** - 711×1471px from Chitu template (was 834×1731px)
✅ **Product ID mapping** - Correct IDs sent to printer API
✅ **Mask format** - Works with Chitu's BLACK/WHITE format
