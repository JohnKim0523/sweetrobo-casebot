export interface PhoneModel {
  id: string;
  brand: string;
  model: string;
  displayName: string;
  dimensions: {
    widthMM: number;    // Physical width in millimeters
    heightMM: number;   // Physical height in millimeters
    widthPX: number;    // Canvas width in pixels for design (from Chitu template)
    heightPX: number;   // Canvas height in pixels for design (from Chitu template)
  };
  image?: string;        // Preview image of the phone
  thumbnailPath?: string; // Path to PNG/WebP thumbnail for UI preview only
  printMaskPath: string; // Path to PNG print mask with cutouts (TRANSPARENT = cutouts, OPAQUE = design area)
  chituProductId?: string; // Chitu API product_id for this model (required for printing)
  available: boolean;
}

export const PHONE_MODELS: PhoneModel[] = [
  // ========== APPLE iPHONE 16 SERIES ==========
  {
    id: 'iphone-16-pro-max',
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    displayName: 'iPhone 16 Pro Max',
    dimensions: {
      widthMM: 77.6,
      heightMM: 163.0,
      widthPX: 778,    // Measured from Chitu template
      heightPX: 1633,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone16promax.png',
    printMaskPath: '/phone-models/print-masks/iphone16promax-print.png',
    chituProductId: 'dZesWMYqBIuCwV1qr6Ugxw==',
    available: true,
  },
  {
    id: 'iphone-16-pro',
    brand: 'Apple',
    model: 'iPhone 16 Pro',
    displayName: 'iPhone 16 Pro',
    dimensions: {
      widthMM: 71.5,
      heightMM: 149.6,
      widthPX: 717,    // Measured from Chitu template
      heightPX: 1499,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone16pro.png',
    printMaskPath: '/phone-models/print-masks/iphone16pro-print.png',
    chituProductId: 'jdv3DGpk66EXwbz2YA+OaQ==',
    available: true,
  },
  {
    id: 'iphone-16-plus',
    brand: 'Apple',
    model: 'iPhone 16 Plus',
    displayName: 'iPhone 16 Plus',
    dimensions: {
      widthMM: 77.8,
      heightMM: 160.9,
      widthPX: 784,    // Measured from Chitu template
      heightPX: 1616,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone16plus.png',
    printMaskPath: '/phone-models/print-masks/iphone16plus-print.png',
    chituProductId: 'T7LN7JlJamvRPFs1TNEMwQ==',
    available: true,
  },
  {
    id: 'iphone-16',
    brand: 'Apple',
    model: 'iPhone 16',
    displayName: 'iPhone 16',
    dimensions: {
      widthMM: 71.6,
      heightMM: 147.6,
      widthPX: 723,    // Measured from Chitu template
      heightPX: 1483,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone16.png',
    printMaskPath: '/phone-models/print-masks/iphone16-print.png',
    chituProductId: 'LCza2RHy7KXYk3lZcasbcQ==',
    available: true,
  },

  // ========== APPLE iPHONE 15 SERIES ==========
  {
    id: 'iphone-15-pro-max',
    brand: 'Apple',
    model: 'iPhone 15 Pro Max',
    displayName: 'iPhone 15 Pro Max',
    dimensions: {
      widthMM: 76.7,
      heightMM: 159.9,
      widthPX: 773,    // Measured from Chitu template
      heightPX: 1604,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone15promax.png',
    printMaskPath: '/phone-models/print-masks/iphone15promax-print.png',
    chituProductId: 'UyUHwf52iS2kiEnZjeJEsA==',
    available: true,
  },
  {
    id: 'iphone-15-pro',
    brand: 'Apple',
    model: 'iPhone 15 Pro',
    displayName: 'iPhone 15 Pro',
    dimensions: {
      widthMM: 70.6,
      heightMM: 146.6,
      widthPX: 711,    // Measured from Chitu template ✅
      heightPX: 1471,  // Measured from Chitu template ✅
    },
    thumbnailPath: '/phone-models/thumbnails/iphone15pro.png',
    printMaskPath: '/phone-models/print-masks/iphone15pro-print.png',
    chituProductId: 'VNr7tjfBrF7P4iJ45I3pPA==',
    available: true,
  },
  {
    id: 'iphone-15-plus',
    brand: 'Apple',
    model: 'iPhone 15 Plus',
    displayName: 'iPhone 15 Plus',
    dimensions: {
      widthMM: 77.8,
      heightMM: 160.9,
      widthPX: 803,    // Measured from Chitu template
      heightPX: 1631,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone15plus.png',
    printMaskPath: '/phone-models/print-masks/iphone15plus-print.png',
    chituProductId: 'x/MUHTWrywWFAGNdRk6yQw==',
    available: true,
  },
  {
    id: 'iphone-15',
    brand: 'Apple',
    model: 'iPhone 15',
    displayName: 'iPhone 15',
    dimensions: {
      widthMM: 71.6,
      heightMM: 147.6,
      widthPX: 730,    // Measured from Chitu template
      heightPX: 1490,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone15.png',
    printMaskPath: '/phone-models/print-masks/iphone15-print.png',
    chituProductId: 'l08V7yupDD9QAxMZG4SnYw==',
    available: true,
  },

  // ========== APPLE iPHONE 14 SERIES ==========
  {
    id: 'iphone-14-pro-max',
    brand: 'Apple',
    model: 'iPhone 14 Pro Max',
    displayName: 'iPhone 14 Pro Max',
    dimensions: {
      widthMM: 77.6,
      heightMM: 160.7,
      widthPX: 790,    // Measured from Chitu template
      heightPX: 1622,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone14promax.png',
    printMaskPath: '/phone-models/print-masks/iphone14promax-print.png',
    chituProductId: 'xla0B8X3P+2XzfFSex3AiQ==',
    available: true,
  },
  {
    id: 'iphone-14-pro',
    brand: 'Apple',
    model: 'iPhone 14 Pro',
    displayName: 'iPhone 14 Pro',
    dimensions: {
      widthMM: 71.5,
      heightMM: 147.5,
      widthPX: 735,    // Measured from Chitu template
      heightPX: 1495,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone14pro.png',
    printMaskPath: '/phone-models/print-masks/iphone14pro-print.png',
    chituProductId: '0HSBwzXE300Dq0Kf8Gzn8Q==',
    available: true,
  },
  {
    id: 'iphone-14-plus',
    brand: 'Apple',
    model: 'iPhone 14 Plus',
    displayName: 'iPhone 14 Plus',
    dimensions: {
      widthMM: 78.1,
      heightMM: 160.8,
      widthPX: 803,    // Measured from Chitu template
      heightPX: 1631,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone14plus.png',
    printMaskPath: '/phone-models/print-masks/iphone14plus-print.png',
    chituProductId: 'wxI4sjth7RtKAeiKaJ7Ffw==',
    available: true,
  },
  {
    id: 'iphone-14',
    brand: 'Apple',
    model: 'iPhone 14',
    displayName: 'iPhone 14',
    dimensions: {
      widthMM: 71.5,
      heightMM: 146.7,
      widthPX: 733,    // Measured from Chitu template
      heightPX: 1485,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone14.png',
    printMaskPath: '/phone-models/print-masks/iphone14-print.png',
    chituProductId: 'rL9/EaWyvaSWet+Q6Vn1dg==',
    available: true,
  },

  // ========== APPLE iPHONE 13 SERIES ==========
  {
    id: 'iphone-13-pro-max',
    brand: 'Apple',
    model: 'iPhone 13 Pro Max',
    displayName: 'iPhone 13 Pro Max',
    dimensions: {
      widthMM: 78.1,
      heightMM: 160.8,
      widthPX: 795,    // Measured from Chitu template
      heightPX: 1622,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone13promax.png',
    printMaskPath: '/phone-models/print-masks/iphone13promax-print.png',
    chituProductId: 'I3Hd9LnMClMIWCOPzqKVdg==',
    available: true,
  },
  {
    id: 'iphone-13-pro',
    brand: 'Apple',
    model: 'iPhone 13 Pro',
    displayName: 'iPhone 13 Pro',
    dimensions: {
      widthMM: 71.5,
      heightMM: 146.7,
      widthPX: 730,    // Measured from Chitu template
      heightPX: 1482,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone13pro.png',
    printMaskPath: '/phone-models/print-masks/iphone13pro-print.png',
    chituProductId: 'U2bBowv0f+D9atFz+DImvQ==',
    available: true,
  },
  {
    id: 'iphone-13',
    brand: 'Apple',
    model: 'iPhone 13',
    displayName: 'iPhone 13',
    dimensions: {
      widthMM: 71.5,
      heightMM: 146.7,
      widthPX: 730,    // Measured from Chitu template
      heightPX: 1482,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone13.png',
    printMaskPath: '/phone-models/print-masks/iphone13-print.png',
    chituProductId: 'kVpboboQhqZ/4Fgaw4IArQ==',
    available: true,
  },
  {
    id: 'iphone-13-mini',
    brand: 'Apple',
    model: 'iPhone 13 mini',
    displayName: 'iPhone 13 mini',
    dimensions: {
      widthMM: 64.2,
      heightMM: 131.5,
      widthPX: 657,    // Measured from Chitu template
      heightPX: 1330,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone13mini.png',
    printMaskPath: '/phone-models/print-masks/iphone13mini-print.png',
    chituProductId: 'E0wNpyReaTrPBRv8jKWAxg==',
    available: true,
  },

  // ========== APPLE iPHONE 12 SERIES ==========
  {
    id: 'iphone-12-pro-max',
    brand: 'Apple',
    model: 'iPhone 12 Pro Max',
    displayName: 'iPhone 12 Pro Max',
    dimensions: {
      widthMM: 78.1,
      heightMM: 160.8,
      widthPX: 798,    // Measured from Chitu template
      heightPX: 1625,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone12promax.png',
    printMaskPath: '/phone-models/print-masks/iphone12promax-print.png',
    chituProductId: 'DqtXrFJRpxLKlFZIiN05yA==',
    available: true,
  },
  {
    id: 'iphone-12-pro',
    brand: 'Apple',
    model: 'iPhone 12 Pro',
    displayName: 'iPhone 12 Pro',
    dimensions: {
      widthMM: 71.5,
      heightMM: 146.7,
      widthPX: 730,    // Measured from Chitu template
      heightPX: 1482,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone12pro.png',
    printMaskPath: '/phone-models/print-masks/iphone12pro-print.png',
    chituProductId: '0sg2JY1Hazv2O7KtB0K+CA==',
    available: true,
  },
  {
    id: 'iphone-12',
    brand: 'Apple',
    model: 'iPhone 12',
    displayName: 'iPhone 12',
    dimensions: {
      widthMM: 71.5,
      heightMM: 146.7,
      widthPX: 730,    // Measured from Chitu template
      heightPX: 1482,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone12.png',
    printMaskPath: '/phone-models/print-masks/iphone12-print.png',
    chituProductId: 'JUekB4UsvLxUStey17gHxQ==',
    available: true,
  },
  {
    id: 'iphone-12-mini',
    brand: 'Apple',
    model: 'iPhone 12 mini',
    displayName: 'iPhone 12 mini',
    dimensions: {
      widthMM: 64.2,
      heightMM: 131.5,
      widthPX: 659,    // Measured from Chitu template
      heightPX: 1332,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone12mini.png',
    printMaskPath: '/phone-models/print-masks/iphone12mini-print.png',
    chituProductId: 'BuLXKlSP+euJYiG9P8YcaA==',
    available: true,
  },

  // ========== APPLE iPHONE 11 ==========
  {
    id: 'iphone-11',
    brand: 'Apple',
    model: 'iPhone 11',
    displayName: 'iPhone 11',
    dimensions: {
      widthMM: 75.7,
      heightMM: 150.9,
      widthPX: 750,    // Measured from Chitu template
      heightPX: 1502,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/iphone11.png',
    printMaskPath: '/phone-models/print-masks/iphone11-print.png',
    chituProductId: 'LEzPW5CUVusmv7IWK4mcDQ==',
    available: true,
  },

  // ========== SAMSUNG GALAXY SERIES ==========
  {
    id: 'samsung-s25-ultra',
    brand: 'Samsung',
    model: 'Galaxy S25 Ultra',
    displayName: 'Galaxy S25 Ultra',
    dimensions: {
      widthMM: 77.6,
      heightMM: 162.8,
      widthPX: 777,    // Measured from Chitu template
      heightPX: 1629,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/samsung-s25ultra.png',
    printMaskPath: '/phone-models/print-masks/samsung-s25ultra-print.png',
    chituProductId: 'uiUfYstc+86J1NR/GinSiw==',
    available: true,
  },
  {
    id: 'samsung-a06',
    brand: 'Samsung',
    model: 'Galaxy A06',
    displayName: 'Galaxy A06',
    dimensions: {
      widthMM: 78.4,
      heightMM: 168.4,
      widthPX: 784,    // Measured from Chitu template
      heightPX: 1684,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/samsung-a06.png',
    printMaskPath: '/phone-models/print-masks/samsung-a06-print.png',
    chituProductId: 'aVBczjYYo6vEk+Onf7PDSA==',
    available: true,
  },
  {
    id: 'samsung-a16-5g',
    brand: 'Samsung',
    model: 'Galaxy A16 5G',
    displayName: 'Galaxy A16 5G',
    dimensions: {
      widthMM: 78.5,
      heightMM: 164.9,
      widthPX: 785,    // Measured from Chitu template
      heightPX: 1650,  // Measured from Chitu template
    },
    thumbnailPath: '/phone-models/thumbnails/samsung-a16-5g.png',
    printMaskPath: '/phone-models/print-masks/samsung-a16-5g-print.png',
    chituProductId: '4Ui1sj/3mG5mYseKSue6nQ==',
    available: true,
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
