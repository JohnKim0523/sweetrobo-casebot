export interface PhoneModel {
  id: string;
  brand: string;
  model: string;
  displayName: string;
  dimensions: {
    widthMM: number;    // Physical width in millimeters
    heightMM: number;   // Physical height in millimeters
    widthPX: number;    // Canvas width in pixels for design
    heightPX: number;   // Canvas height in pixels for design
  };
  image?: string;        // Preview image of the phone
  available: boolean;
}

// Scale factor for converting mm to pixels (adjust based on print DPI)
// Chitu printers typically use 300-600 DPI
const MM_TO_PX = 11.81; // ~300 DPI (300 pixels / 25.4mm)

export const PHONE_MODELS: PhoneModel[] = [
  // Apple Models
  {
    id: 'iphone-15-pro',
    brand: 'Apple',
    model: 'iPhone 15 Pro',
    displayName: 'iPhone 15 Pro',
    dimensions: {
      widthMM: 70.6,   // 2.78 inches
      heightMM: 146.6, // 5.77 inches
      widthPX: Math.round(70.6 * MM_TO_PX),   // ~834px
      heightPX: Math.round(146.6 * MM_TO_PX), // ~1731px
    },
    image: '/images/phones/iphone-15-pro.png',
    available: true,
  },
  {
    id: 'iphone-16-pro',
    brand: 'Apple',
    model: 'iPhone 16 Pro',
    displayName: 'iPhone 16 Pro',
    dimensions: {
      widthMM: 77.6,   // Actual iPhone 16 Pro width
      heightMM: 163.0, // Actual iPhone 16 Pro height  
      widthPX: Math.round(77.6 * MM_TO_PX),   // ~916px
      heightPX: Math.round(163.0 * MM_TO_PX), // ~1925px
    },
    image: '/images/phones/iphone-16-pro.png',
    available: true,
  },
  {
    id: 'iphone-16-pro-max',
    brand: 'Apple', 
    model: 'iPhone 16 Pro Max',
    displayName: 'iPhone 16 Pro Max',
    dimensions: {
      widthMM: 83.4,
      heightMM: 177.5,
      widthPX: Math.round(83.4 * MM_TO_PX),
      heightPX: Math.round(177.5 * MM_TO_PX),
    },
    image: '/images/phones/iphone-16-pro-max.png',
    available: false,
  },
  // Samsung Models
  {
    id: 'samsung-s24-ultra',
    brand: 'Samsung',
    model: 'Galaxy S24 Ultra',
    displayName: 'Galaxy S24 Ultra',
    dimensions: {
      widthMM: 79.0,
      heightMM: 162.3,
      widthPX: Math.round(79.0 * MM_TO_PX),
      heightPX: Math.round(162.3 * MM_TO_PX),
    },
    image: '/images/phones/samsung-s24-ultra.png',
    available: false,
  },
];

// Helper function to get models by brand
export const getModelsByBrand = (brand: string): PhoneModel[] => {
  return PHONE_MODELS.filter(model => model.brand === brand);
};

// Get unique brands
export const getBrands = (): string[] => {
  return Array.from(new Set(PHONE_MODELS.map(model => model.brand)));
};

export const getPhoneModel = (id: string): PhoneModel | undefined => {
  return PHONE_MODELS.find(model => model.id === id);
};