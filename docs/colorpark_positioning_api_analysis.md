# ColorPark Positioning & API Analysis - Complete Findings

**Date:** August 5, 2025  
**Analysis Focus:** Component positioning, cutoff behavior, and API data structures  

## Summary of Test Cases Completed

| Test Case | Description | Order # | Key Finding |
|-----------|-------------|---------|-------------|
| Case 1 | iPhone 14 Pro | 1247957 | Baseline positioning data |
| Case 3 | Zoom/Rotation Test | 1248047 | Component transformation handling |
| Case 4 | Text Overlay | 1248049 | Text truncation: "OVERSIZED PRINT TEST 100x200mm POSI" |
| Case 5 | Samsung Multi-Component | 1248054 | 3 components: image + sticker + text |
| Case 6 | Custom Max Dimensions | 1248021 | 100x200mm accepted via URL bypass |

## Key API Discoveries

### 1. Component Type System

```javascript
// Component types identified:
{
  1: "Uploaded Image",    // Custom photos uploaded by user
  2: "Wallpaper/Sticker", // Pre-existing materials from library
  3: "Text",              // Text overlays with font styling
  4: "Color Background",  // Solid color fills
  5: "Graffiti/Drawing"   // Hand-drawn elements
}
```

### 2. Works.save API Structure

The Works.save API accepts an array of components, each with positioning data:

```javascript
{
  "s": "Works.save",
  "components": [
    {
      // Component identification
      "type": 1,                    // Component type (1-5)
      "material_id": 123456,        // ID for library materials (stickers/wallpapers)
      "original_id": 123456,        // Original material reference
      
      // Positioning & Size
      "width": 88.60,              // Width in canvas units
      "height": 162.44,            // Height in canvas units  
      "top": 11.27,                // Top offset from canvas origin
      "left": 5.69,                // Left offset from canvas origin
      
      // Transformation
      "zoom": 1.0,                 // Scale factor (1.0 = 100%)
      "rotate": 0,                 // Rotation in degrees
      
      // Content
      "content": "https://...",    // URL for images or text content
      
      // Corner coordinates (calculated)
      "upper_left_x": 5.69,
      "upper_left_y": 11.27,
      "upper_right_x": 94.30,
      "upper_right_y": 11.27,
      "lower_left_x": 5.69,
      "lower_left_y": 173.72,
      "lower_right_x": 94.30,
      "lower_right_y": 173.72,
      
      // Center point
      "center_x": 50.0,
      "center_y": 92.5,
      
      // Text-specific properties
      "font_family": "Arial",      // Font selection
      "font_size": 14,             // Font size
      "font_color": "#000000",     // Font color (hex)
      "font_style": "regular",     // Font style
      
      // Other properties
      "support_zoom": 1,           // Allows scaling
      "support_drag": 1,           // Allows repositioning
      "is_under": 1,               // Render under other elements
      "index": 100                 // Z-index ordering
    }
  ],
  "goods_id": "993",               // Product type (993 = custom case)
  "machine_id": "11025496",        // Target printer
  "platform": 4,                   // Platform identifier
  "terminal": 2                    // Terminal type
}
```

### 3. Coordinate System Analysis

The ColorPark API uses a percentage-based coordinate system:

- **Canvas Size**: 100 units × 200 units (for 100×200mm)
- **Origin**: Top-left corner (0,0)
- **Positioning**: `top` and `left` specify component origin
- **Size**: `width` and `height` in canvas units
- **Corners**: All four corners calculated and sent
- **Center**: Center point calculated as (left + width/2, top + height/2)

### 4. Text Cutoff Behavior

**Discovery**: Text is automatically truncated when it exceeds canvas boundaries

Example:
- Input: "OVERSIZED PRINT TEST 100x200mm POSITIONING ANALYSIS"
- Display: "OVERSIZED PRINT TEST 100x200mm POSI"
- Behavior: Truncates at character boundary, not mid-character

### 5. Multi-Component Handling

When multiple components are present:
1. Each component gets its own object in the `components` array
2. Components maintain independent positioning
3. Z-ordering controlled by array order and `index` property
4. All components share the same canvas dimensions

### 6. Image Upload Process

```javascript
// Step 1: Get upload credentials
GET /api/AliossSign/getSign

// Step 2: Upload to CDN
POST https://img.colorpark.cn/
FormData: {
  key: "api/render/[timestamp].jpg",
  policy: "[from step 1]",
  OSSAccessKeyId: "[from step 1]",
  signature: "[from step 1]",
  file: [binary data]
}

// Result: Image available at
https://img.colorpark.cn/api/render/[timestamp].jpg
```

### 7. URL Parameter Scaling

For custom dimensions via URL:
- WidthIndex = desired_width_mm × 3
- HeightIndex = desired_height_mm × 3
- fillet = corner_radius_mm × 3
- top = top_offset_mm × 3
- left = left_offset_mm × 3

Example: 100×200mm = `WidthIndex=300&HeightIndex=600`

### 8. API Validation vs UI Validation

**Critical Finding**: The API is more permissive than the UI

| Validation Layer | Width Limit | Height Limit | Notes |
|-----------------|-------------|--------------|-------|
| UI Form | 75-85mm | 175mm | Enforced in input fields |
| API Backend | 100mm+ | 200mm+ | Accepts larger via direct URL |
| Hardware | Unknown | Unknown | Likely even higher |

### 9. Material Library Integration

Stickers and wallpapers use material IDs:
```javascript
{
  "type": 2,
  "material_id": 168912096764adf0c756315,
  "content": "https://img.colorpark.cn/back/168912096764adf0c756315.png"
}
```

### 10. Order Creation Flow

```javascript
// After Works.save returns works_id
{
  "s": "Order.create",
  "type": 2,
  "machine_id": "11025496",
  "goods_id": "993",      // Product type
  "works_id": "1581067"   // From Works.save response
}
```

## Security & Business Implications

1. **URL Parameter Bypass**: Direct URLs bypass UI validation entirely
2. **Oversized Printing**: 100×200mm prints accepted despite UI limits
3. **Cost Model Gap**: Pricing may not account for oversized prints
4. **API Trust**: Backend trusts pre-validated parameters
5. **Component Limits**: No apparent limit on number of components

## Recommendations for API Integration

1. **Always use URL bypass** for dimensions exceeding 85×175mm
2. **Calculate corners** - The API expects all corner coordinates
3. **Component ordering** - Add components in desired Z-order
4. **Text handling** - Account for automatic truncation
5. **Image optimization** - Upload images at appropriate resolution
6. **Batch components** - Send all components in one Works.save call

## Test Results Summary

✅ **Successful Tests:**
- 100×200mm oversized printing
- Multi-component layouts
- Text truncation behavior
- Sticker integration
- Custom positioning

❌ **Limitations Found:**
- UI enforces 75-85mm width limit
- Text truncates at canvas boundaries
- Network monitoring challenging due to redirects

## Future Research Areas

1. Maximum dimension limits (test 150×300mm, 200×400mm)
2. Component count limits
3. Rotation limits (360°? Negative values?)
4. Zoom/scale limits
5. Font size limits for text
6. Performance with many components

---

*This analysis is based on empirical testing and reverse engineering. API behavior may change.*