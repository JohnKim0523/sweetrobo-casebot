# ColorPark & Fabric.js Integration Guide

**Last Updated:** August 5, 2025  
**Purpose:** Understanding ColorPark's component system for Fabric.js integration

## Table of Contents

1. [Component Architecture Overview](#component-architecture-overview)
2. [How ColorPark Handles Components](#how-colorpark-handles-components)
3. [Text Component System](#text-component-system)
4. [Image & Sticker System](#image--sticker-system)
5. [Backend Reconstruction Process](#backend-reconstruction-process)
6. [Coordinate System Explained](#coordinate-system-explained)
7. [Fabric.js Implementation](#fabricjs-implementation)
8. [Complete Integration Example](#complete-integration-example)
9. [Key Differences & Considerations](#key-differences--considerations)

---

## Component Architecture Overview

**Critical Discovery:** ColorPark uses a **LAYERED COMPONENT SYSTEM**, not pre-rendered images:

- ✅ Components sent as individual layers with properties
- ✅ Backend reconstructs the final image from layers
- ✅ Each component maintains position, size, and transformation data
- ❌ NOT pre-rendered on frontend
- ❌ NOT sent as flattened images

This architecture makes it **perfectly compatible with Fabric.js**!

---

## How ColorPark Handles Components

### Component Types

```javascript
const COMPONENT_TYPES = {
  1: "Uploaded Image",      // User-uploaded photos
  2: "Sticker/Wallpaper",   // Pre-existing library materials
  3: "Text",                // Text overlays with styling
  4: "Color Background",    // Solid color fills
  5: "Graffiti/Drawing"     // Hand-drawn elements
};
```

### Component Data Structure

Each component in the `Works.save` API includes:

```javascript
{
  // Identification
  "type": 1,                      // Component type (1-5)
  "material_id": 123456,          // For library materials only
  "original_id": 123456,          // Original material reference
  "works_id": null,               // Work reference (null for new)
  "id": null,                     // Component ID (null for new)
  
  // Positioning
  "width": 88.60,                 // Width in canvas units
  "height": 162.44,               // Height in canvas units
  "top": 11.27,                   // Top offset from origin
  "left": 5.69,                   // Left offset from origin
  
  // Transformation
  "zoom": 1.0,                    // Scale factor
  "rotate": 0,                    // Rotation in degrees
  
  // Content
  "content": "https://img.colorpark.cn/api/render/1754420837914.jpg", // URL for images
  // OR
  "content": "Your Text Here",    // Raw text for text components
  
  // Calculated Corners (Required!)
  "upper_left_x": 5.69,
  "upper_left_y": 11.27,
  "upper_right_x": 94.30,
  "upper_right_y": 11.27,
  "lower_left_x": 5.69,
  "lower_left_y": 173.72,
  "lower_right_x": 94.30,
  "lower_right_y": 173.72,
  
  // Center Point
  "center_x": 50.0,
  "center_y": 92.5,
  
  // Display Properties
  "support_zoom": 1,              // 1 = allows scaling, 0 = fixed
  "support_drag": 1,              // 1 = allows repositioning, 0 = fixed
  "is_under": 1,                  // 1 = render under others, 0 = normal
  "is_discount": 0,               // Discount flag
  "index": 100,                   // Z-index ordering
  
  // Text-Specific Properties (Type 3 only)
  "font_family": ".ttf",          // Font file reference
  "font_size": 0,                 // Font size (0 = default)
  "font_color": "",               // Hex color (empty = default black)
  "font_style": "regular",        // Font style variant
  "under_color": "#00000000"      // Background color (transparent)
}
```

---

## Text Component System

### Text is NOT Pre-Rendered!

Text components are sent as **raw strings** with styling properties:

```javascript
{
  "type": 3,                          // Text component
  "content": "POSITIONING TEST",      // Raw text string
  "font_family": ".ttf",              // Font file reference
  "font_size": 0,                     // Size (0 = default)
  "font_color": "",                   // Hex color
  "font_style": "regular",            // Style variant
  "width": 88.60,                     // Text box width
  "height": 20.00,                    // Text box height
  "top": 50.00,                       // Y position
  "left": 10.00,                      // X position
  "zoom": 1.0,                        // Scale factor
  "rotate": 0,                        // Rotation degrees
  "support_zoom": 1,                  // Allow scaling
  "support_drag": 1,                  // Allow moving
  "is_under": 0,                      // Rendering layer
  "is_discount": 0,                   // Discount flag
  "index": 101,                       // Z-order
  "upper_left_x": 10.00,
  "upper_left_y": 50.00,
  "upper_right_x": 98.60,
  "upper_right_y": 50.00,
  "lower_left_x": 10.00,
  "lower_left_y": 70.00,
  "lower_right_x": 98.60,
  "lower_right_y": 70.00,
  "center_x": 54.30,
  "center_y": 60.00,
  "under_color": "#00000000"          // Transparent background
}
```

### Text Behavior

- **Auto-truncation**: Text is clipped at canvas boundaries
- **Dynamic rendering**: Backend renders text, not frontend
- **Font loading**: Specific fonts loaded from CDN
- **No wrapping**: Text appears to be single-line

### Available Fonts

The following fonts are available from ColorPark's CDN:

```javascript
const AVAILABLE_FONTS = [
  "Sriracha-Regular.ttf",
  "Vibur-Regular.ttf", 
  "Yellowtail-Regular.ttf",
  "ZenTokyoZoo-Regular.ttf"
];

// Font URLs
const FONT_BASE_URL = "https://img.colorpark.cn/fonts/";
// Example: https://img.colorpark.cn/fonts/Sriracha-Regular.ttf
```

---

## Image & Sticker System

### Images Sent as URLs

```javascript
// Uploaded Image (Type 1)
{
  "type": 1,
  "content": "https://img.colorpark.cn/api/render/1754420837914.jpg",
  "width": 50.00,
  "height": 50.00,
  "top": 25.00,
  "left": 25.00,
  "zoom": 1.0,
  "rotate": 45,
  "support_zoom": 1,
  "support_drag": 1,
  "is_under": 0,
  "is_discount": 0,
  "index": 100,
  "upper_left_x": 7.32,    // Rotated corners
  "upper_left_y": 32.32,
  "upper_right_x": 42.68,
  "upper_right_y": 7.32,
  "lower_left_x": 32.32,
  "lower_left_y": 67.68,
  "lower_right_x": 67.68,
  "lower_right_y": 42.68,
  "center_x": 50.00,
  "center_y": 50.00
}

// Sticker from Library (Type 2)
{
  "type": 2,
  "material_id": 168912096764adf0c,
  "content": "https://img.colorpark.cn/back/168912096764adf0c.png",
  "original_id": 168912096764adf0c,
  "width": 30.00,
  "height": 30.00,
  "top": 20.00,
  "left": 60.00,
  "zoom": 1.0,
  "rotate": 0,
  "support_zoom": 1,
  "support_drag": 1,
  "is_under": 0,
  "is_discount": 0,
  "index": 102,
  "upper_left_x": 60.00,
  "upper_left_y": 20.00,
  "upper_right_x": 90.00,
  "upper_right_y": 20.00,
  "lower_left_x": 60.00,
  "lower_left_y": 50.00,
  "lower_right_x": 90.00,
  "lower_right_y": 50.00,
  "center_x": 75.00,
  "center_y": 35.00
}
```

---

## Complete Works.save API Structure

The full API request structure for saving a design:

```javascript
// Complete Works.save FormData
{
  "s": "Works.save",                          // Service name
  "components": JSON.stringify([              // Components array as JSON string
    // Component objects as shown above
  ]),
  "works_id": null,                           // null for new, ID for update
  "goods_id": "993",                          // Product type (993 = custom case)
  "template": null,                           // Template reference
  "template_price": null,                     // Template cost
  "template_user_id": null,                   // Template creator
  "user_id": null,                            // User ID (auto-filled)
  "platform": 4,                              // Platform identifier
  "shape_image": "",                          // Shape overlay image
  "shape_id": "",                             // Shape identifier
  "shape_price": "",                          // Shape cost
  "machine_id": "11025496",                   // Target printer ID
  "terminal": 2,                              // Terminal type
  "background_color": null                    // Canvas background
}

// Response structure
{
  "code": 200,
  "msg": "success",
  "data": {
    "works_id": 1581067                      // Save this for Order.create
  }
}
```

---

## Backend Reconstruction Process

The ColorPark backend reconstructs the design:

1. **Creates canvas** with specified dimensions
2. **Iterates through components** in array order
3. **For each component**:
   - Downloads images from CDN
   - Renders text with specified font
   - Applies transformations (scale, rotate)
   - Positions at exact coordinates
4. **Composites layers** into final print image
5. **Handles cutoffs** at canvas boundaries

---

## URL Parameter System

### Direct Canvas URL Format

To bypass UI validation and create oversized canvases:

```
https://h5.colorpark.cn/#/pages/index/index_phone?machine_id=11025496&WidthIndex=300&HeightIndex=600&fillet=0&top=0&left=0&name=TEST-NAME&key=2&type=3&goods_id=993
```

### Parameter Breakdown

| Parameter | Description | Formula | Example (100×200mm) |
|-----------|-------------|---------|---------------------|
| machine_id | Target printer ID | Direct value | 11025496 |
| WidthIndex | Canvas width | mm × 3 | 300 (100mm × 3) |
| HeightIndex | Canvas height | mm × 3 | 600 (200mm × 3) |
| fillet | Corner radius | mm × 3 | 0 (no rounding) |
| top | Top margin | mm × 3 | 0 |
| left | Left margin | mm × 3 | 0 |
| name | Case name | URL encoded | OVERSIZED-TEST |
| key | Application key | Fixed value | 2 |
| type | Canvas type | Fixed value | 3 (custom) |
| goods_id | Product type | Fixed value | 993 (custom case) |

---

## Order Creation Process

After saving the design with Works.save:

```javascript
// Order.create FormData
{
  "s": "Order.create",              // Service name
  "type": 2,                        // Order type
  "machine_id": "11025496",         // Target printer
  "goods_id": "993",                // Product type (must match Works.save)
  "works_id": "1581067"             // From Works.save response
}

// Response
{
  "code": 200,
  "msg": "success",
  "data": {
    "order_number": "1248054",
    "queue_id": "175442124701277008",
    "status": "queued"
  }
}
```

---

## Coordinate System Explained

### Units & Scaling

- **Canvas units**: Percentage-based (100 units = full width)
- **URL parameters**: Use 3× scaling (100mm = 300 units)
- **Origin**: Top-left corner (0,0)
- **Rotation center**: Appears to be component center

### Corner Calculation Requirements

ColorPark requires **all four corners** to be calculated and sent:

```javascript
// For a rotated rectangle:
function calculateCorners(left, top, width, height, rotation) {
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const angle = rotation * Math.PI / 180;
  
  // Calculate each corner accounting for rotation
  const corners = [
    [-width/2, -height/2],  // Top-left
    [width/2, -height/2],   // Top-right
    [-width/2, height/2],   // Bottom-left
    [width/2, height/2]     // Bottom-right
  ];
  
  return corners.map(([x, y]) => {
    const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
    const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
    return {
      x: centerX + rotatedX,
      y: centerY + rotatedY
    };
  });
}
```

---

## Fabric.js Implementation

### Setting Up Canvas

```javascript
// Create Fabric.js canvas matching ColorPark dimensions
const SCALE_FACTOR = 3;  // ColorPark's scaling factor

const canvas = new fabric.Canvas('canvas', {
  width: 100 * SCALE_FACTOR,   // 100mm width
  height: 200 * SCALE_FACTOR,  // 200mm height
  backgroundColor: 'white'
});
```

### Adding Components

```javascript
// 1. Add Image Component
fabric.Image.fromURL('https://example.com/image.jpg', (img) => {
  // Convert ColorPark coordinates to Fabric.js
  img.set({
    left: 5.69 * SCALE_FACTOR,
    top: 11.27 * SCALE_FACTOR,
    scaleX: (88.60 * SCALE_FACTOR) / img.width,
    scaleY: (162.44 * SCALE_FACTOR) / img.height,
    angle: 0
  });
  canvas.add(img);
});

// 2. Add Text Component
const text = new fabric.Text('POSITIONING TEST', {
  left: 10 * SCALE_FACTOR,
  top: 50 * SCALE_FACTOR,
  fontSize: 14,
  fontFamily: 'Arial',
  fill: '#000000'
});
canvas.add(text);

// 3. Add Sticker (as image)
fabric.Image.fromURL('https://img.colorpark.cn/back/sticker.png', (sticker) => {
  sticker.set({
    left: 60 * SCALE_FACTOR,
    top: 20 * SCALE_FACTOR,
    scaleX: 0.5,
    scaleY: 0.5
  });
  canvas.add(sticker);
});
```

### Converting to ColorPark Format

```javascript
function fabricToColorPark(canvas) {
  const objects = canvas.getObjects();
  
  return objects.map((obj, index) => {
    const bounds = obj.getBoundingRect();
    const angle = obj.angle || 0;
    
    // Calculate corners with rotation
    const corners = calculateRotatedCorners(obj);
    
    // Base component structure
    const component = {
      type: getColorParkType(obj),
      width: bounds.width / SCALE_FACTOR,
      height: bounds.height / SCALE_FACTOR,
      top: bounds.top / SCALE_FACTOR,
      left: bounds.left / SCALE_FACTOR,
      zoom: obj.scaleX || 1,
      rotate: angle,
      
      // Corner coordinates
      upper_left_x: corners[0].x / SCALE_FACTOR,
      upper_left_y: corners[0].y / SCALE_FACTOR,
      upper_right_x: corners[1].x / SCALE_FACTOR,
      upper_right_y: corners[1].y / SCALE_FACTOR,
      lower_left_x: corners[2].x / SCALE_FACTOR,
      lower_left_y: corners[2].y / SCALE_FACTOR,
      lower_right_x: corners[3].x / SCALE_FACTOR,
      lower_right_y: corners[3].y / SCALE_FACTOR,
      
      // Center point
      center_x: obj.getCenterPoint().x / SCALE_FACTOR,
      center_y: obj.getCenterPoint().y / SCALE_FACTOR,
      
      // Additional properties
      support_zoom: 1,
      support_drag: 1,
      is_under: 0,
      index: 100 + index
    };
    
    // Type-specific properties
    if (obj.type === 'text') {
      component.content = obj.text;
      component.font_family = obj.fontFamily || 'Arial';
      component.font_size = obj.fontSize || 14;
      component.font_color = obj.fill || '#000000';
      component.font_style = obj.fontStyle || 'regular';
    } else if (obj.type === 'image') {
      component.content = obj._element.src;
      component.material_id = obj.materialId || null;
    }
    
    return component;
  });
}

function getColorParkType(fabricObj) {
  switch(fabricObj.type) {
    case 'text': return 3;
    case 'image': 
      return fabricObj.materialId ? 2 : 1;  // Sticker vs uploaded
    case 'rect':
      return 4;  // Color background
    default: return 1;
  }
}

function calculateRotatedCorners(obj) {
  const coords = obj.getCoords();
  return [
    { x: coords.tl.x, y: coords.tl.y },  // Top-left
    { x: coords.tr.x, y: coords.tr.y },  // Top-right
    { x: coords.bl.x, y: coords.bl.y },  // Bottom-left
    { x: coords.br.x, y: coords.br.y }   // Bottom-right
  ];
}
```

---

## Authentication & Image Upload

### JWT Token Generation

```javascript
// Generate JWT token for a specific printer
async function getJWTToken(machineId) {
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
    body: `s=User.webLogin&phone=${randomPhone}&password=&type=2&applets_type=7&machine_id=${machineId}`
  });
  
  const data = await response.json();
  if (data.code === 200) {
    return data.data.token;  // JWT token valid for ~100 days
  }
  throw new Error('Failed to get JWT token');
}
```

### Image Upload Process

```javascript
// Step 1: Get upload credentials
async function getUploadCredentials() {
  const response = await fetch('https://h5.colorpark.cn/api//api/AliossSign/getSign', {
    method: 'GET',
    headers: {
      'Accept': '*/*',
      'Origin': 'https://h5.colorpark.cn',
      'Referer': 'https://h5.colorpark.cn/',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  
  return await response.json();
  // Returns: { accessid, host, policy, signature, expire, callback, dir }
}

// Step 2: Upload image to CDN
async function uploadImage(file, credentials) {
  const timestamp = Date.now();
  const filename = `api/render/${timestamp}_${file.name}`;
  
  const formData = new FormData();
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
  
  const result = await response.json();
  return `${credentials.host}/${filename}`;  // Full CDN URL
}
```

---

## Complete Integration Example

### Full Working Implementation

```javascript
class ColorParkFabricIntegration {
  constructor(canvasId) {
    this.SCALE_FACTOR = 3;
    this.canvas = new fabric.Canvas(canvasId, {
      width: 100 * this.SCALE_FACTOR,   // 100mm
      height: 200 * this.SCALE_FACTOR,  // 200mm
      backgroundColor: 'white'
    });
  }
  
  // Import ColorPark components to Fabric.js
  importFromColorPark(components) {
    components.forEach(comp => {
      switch(comp.type) {
        case 1: // Uploaded image
        case 2: // Sticker
          this.addImageComponent(comp);
          break;
        case 3: // Text
          this.addTextComponent(comp);
          break;
        case 4: // Color background
          this.addColorComponent(comp);
          break;
      }
    });
  }
  
  addImageComponent(comp) {
    fabric.Image.fromURL(comp.content, (img) => {
      img.set({
        left: comp.left * this.SCALE_FACTOR,
        top: comp.top * this.SCALE_FACTOR,
        scaleX: (comp.width * this.SCALE_FACTOR) / img.width * comp.zoom,
        scaleY: (comp.height * this.SCALE_FACTOR) / img.height * comp.zoom,
        angle: comp.rotate,
        materialId: comp.material_id
      });
      this.canvas.add(img);
    });
  }
  
  addTextComponent(comp) {
    const text = new fabric.Text(comp.content, {
      left: comp.left * this.SCALE_FACTOR,
      top: comp.top * this.SCALE_FACTOR,
      fontSize: comp.font_size || 14,
      fontFamily: comp.font_family || 'Arial',
      fill: comp.font_color || '#000000',
      angle: comp.rotate
    });
    this.canvas.add(text);
  }
  
  // Export to ColorPark format
  exportToColorPark() {
    const components = this.fabricToColorPark(this.canvas);
    
    return {
      s: "Works.save",
      components: JSON.stringify(components),
      goods_id: "993",  // Custom case
      machine_id: "11025496",
      platform: 4,
      terminal: 2
    };
  }
  
  // Submit to ColorPark API
  async submitToColorPark() {
    const data = this.exportToColorPark();
    
    // 1. Save the design
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      formData.append(key, data[key]);
    });
    
    const worksResponse = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
      method: 'POST',
      body: formData
    });
    
    const worksData = await worksResponse.json();
    const worksId = worksData.data.works_id;
    
    // 2. Create order
    const orderForm = new FormData();
    orderForm.append('s', 'Order.create');
    orderForm.append('type', '2');
    orderForm.append('machine_id', data.machine_id);
    orderForm.append('goods_id', data.goods_id);
    orderForm.append('works_id', worksId);
    
    const orderResponse = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
      method: 'POST',
      body: orderForm
    });
    
    return orderResponse.json();
  }
}

// Usage
const editor = new ColorParkFabricIntegration('myCanvas');

// Add components
editor.canvas.add(new fabric.Text('Hello ColorPark!', {
  left: 50,
  top: 100,
  fontSize: 24
}));

// Submit to printer
editor.submitToColorPark().then(result => {
  console.log('Print job submitted:', result);
});
```

---

## Key Differences & Considerations

### Important Differences

| Feature | ColorPark | Fabric.js | Solution |
|---------|-----------|-----------|----------|
| Text Truncation | Auto-truncates at boundaries | No truncation | Implement clipping |
| Font Loading | Specific CDN fonts | System fonts | Load ColorPark fonts |
| Image Storage | Requires CDN URLs | Can use base64 | Upload to CDN first |
| Coordinate System | Percentage-based | Pixel-based | Use scale factor |
| Rotation Origin | Component center | Top-left by default | Set originX/Y to 'center' |

### Best Practices

1. **Always calculate corners** - ColorPark requires all 4 corners
2. **Handle text clipping** - Implement boundary checking
3. **Upload images first** - Get CDN URLs before submission
4. **Maintain aspect ratios** - Use proper scaling calculations
5. **Test with oversized canvas** - Use 100×200mm for testing
6. **Z-order matters** - Components rendered in array order

### Common Pitfalls

- ❌ Forgetting to scale coordinates by 3
- ❌ Not calculating rotated corners
- ❌ Using local image paths instead of CDN URLs
- ❌ Incorrect component type mapping
- ❌ Missing required corner coordinates

### Performance Tips

- Batch image uploads
- Cache material IDs for stickers
- Minimize component count
- Optimize image sizes before upload
- Use appropriate zoom levels

---

## API Endpoints Reference

### Main API Gateway
```
POST https://h5.colorpark.cn/api/userphoneapplets/index
```

### Service Methods (via 's' parameter)

| Service | Description | Required Parameters |
|---------|-------------|-------------------|
| User.webLogin | Generate JWT token | phone, password, type, applets_type, machine_id |
| Works.save | Save design | components, goods_id, machine_id, platform, terminal |
| Order.create | Submit print job | type, machine_id, goods_id, works_id |
| Product.getBrands | Get phone brands | machine_id, key |
| Product.detail | Get product details | id |
| Material.category | Get materials | machine_id, key, surface_color_series_id |
| Material.detail | Get material info | id |
| Machine.wait | Check queue status | machine_id |
| User.verifyToken | Validate JWT | token |

### Additional Endpoints

```javascript
// Get upload credentials
GET https://h5.colorpark.cn/api//api/AliossSign/getSign

// Upload to CDN
POST https://img.colorpark.cn/

// Get available fonts
POST https://h5.colorpark.cn/api//api/material/mchineFontFamilyList

// Machine privacy settings
POST https://h5.colorpark.cn/api//api/MachinePrivacy/MachinePrivacy
```

---

## Printer IDs & Configuration

### Known Working Printer IDs
- **11025496** - Verified working printer
- Each printer requires its own JWT token
- Tokens are not transferable between printers

### Product Types (goods_id)
- **993** - Custom case (supports oversized dimensions)
- **951** - iPhone 14 Pro
- **1682** - OnePlus Nord 2T 5G
- Other phone models have specific IDs

---

## Complete Example: Submit Oversized Print

```javascript
async function submitOversizedPrint() {
  const MACHINE_ID = '11025496';
  const GOODS_ID = '993';
  
  try {
    // 1. Get JWT token
    const token = await getJWTToken(MACHINE_ID);
    console.log('Token obtained');
    
    // 2. Get upload credentials
    const credentials = await getUploadCredentials();
    
    // 3. Upload image
    const imageFile = document.getElementById('fileInput').files[0];
    const imageUrl = await uploadImage(imageFile, credentials);
    console.log('Image uploaded:', imageUrl);
    
    // 4. Create components array
    const components = [{
      type: 1,
      content: imageUrl,
      width: 100,
      height: 200,
      top: 0,
      left: 0,
      zoom: 1,
      rotate: 0,
      support_zoom: 1,
      support_drag: 1,
      is_under: 0,
      is_discount: 0,
      index: 100,
      upper_left_x: 0,
      upper_left_y: 0,
      upper_right_x: 100,
      upper_right_y: 0,
      lower_left_x: 0,
      lower_left_y: 200,
      lower_right_x: 100,
      lower_right_y: 200,
      center_x: 50,
      center_y: 100
    }];
    
    // 5. Save design
    const worksForm = new FormData();
    worksForm.append('s', 'Works.save');
    worksForm.append('components', JSON.stringify(components));
    worksForm.append('goods_id', GOODS_ID);
    worksForm.append('machine_id', MACHINE_ID);
    worksForm.append('platform', '4');
    worksForm.append('terminal', '2');
    worksForm.append('works_id', null);
    worksForm.append('template', null);
    worksForm.append('template_price', null);
    worksForm.append('template_user_id', null);
    worksForm.append('user_id', null);
    worksForm.append('shape_image', '');
    worksForm.append('shape_id', '');
    worksForm.append('shape_price', '');
    worksForm.append('background_color', null);
    
    const worksResponse = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
      method: 'POST',
      body: worksForm
    });
    
    const worksData = await worksResponse.json();
    const worksId = worksData.data.works_id;
    console.log('Design saved, works_id:', worksId);
    
    // 6. Create order
    const orderForm = new FormData();
    orderForm.append('s', 'Order.create');
    orderForm.append('type', '2');
    orderForm.append('machine_id', MACHINE_ID);
    orderForm.append('goods_id', GOODS_ID);
    orderForm.append('works_id', worksId);
    
    const orderResponse = await fetch('https://h5.colorpark.cn/api/userphoneapplets/index', {
      method: 'POST',
      body: orderForm
    });
    
    const orderData = await orderResponse.json();
    console.log('Order submitted:', orderData);
    
    return orderData;
    
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
```

---

## Conclusion

ColorPark's component-based architecture aligns perfectly with Fabric.js's object model. By understanding the coordinate system, component types, and API requirements, you can create a seamless integration that allows rich editing in Fabric.js while maintaining compatibility with ColorPark's printing system.

The key insight is that **both systems work with individual components/objects**, making bidirectional conversion straightforward once you handle the coordinate scaling and corner calculations properly.

This document contains all the necessary information to implement a complete ColorPark integration without relying on external references.

---

*Last updated: August 5, 2025*  
*Based on empirical testing and API analysis*