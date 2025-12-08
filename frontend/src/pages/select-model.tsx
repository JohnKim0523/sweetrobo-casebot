// Phone model selection page - Fully dynamic based on API inventory
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { PHONE_MODELS, PhoneModel } from '../types/phone-models';

interface InventoryItem {
  name_en: string;
  product_id: string;
  stock: number;
  show_img?: string;  // Thumbnail image URL from Chitu API
  print_img?: string; // Print template URL from Chitu API
}

interface InventoryBrand {
  name_en: string;
  modelList: InventoryItem[];
}

interface MachineInventory {
  success: boolean;
  count: number;
  brands: InventoryBrand[];
}

// Dynamic model type for models from API
interface DynamicModel {
  id: string;
  brand: string;
  model: string;
  displayName: string;
  product_id: string;
  stock: number;
  // From Chitu API
  show_img?: string;   // Thumbnail image URL
  print_img?: string;  // Print template URL
  // Optional - from phone-models.ts if matched
  dimensions?: {
    widthMM: number;
    heightMM: number;
    widthPX: number;
    heightPX: number;
  };
  thumbnailPath?: string;
  printMaskPath?: string;
}

// Demo mode: Curated list of phone models for testing
const DEMO_MODE_MODELS: string[] = [
  'iphone-16-pro',
  'iphone-16',
  'iphone-15-pro-max',
  'iphone-15',
  'iphone-14-plus',
  'samsung-a21',
];

// Demo mode: Thumbnail URLs from Chitu API (for demo mode display)
const DEMO_MODE_THUMBNAILS: Record<string, string> = {
  'iphone-16-pro': 'https://print-oss.gzchitu.cn/iphone/iphone16pro.png',
  'iphone-16': 'https://print-oss.gzchitu.cn/iphone/iphone16.png',
  'iphone-15-pro-max': 'https://print-oss.gzchitu.cn/iphone/iphone15promax.png',
  'iphone-15': 'https://print-oss.gzchitu.cn/iphone/iphone15.png',
  'iphone-14-plus': 'https://print-oss.gzchitu.cn/iphone/iphone14plus.png',
  'samsung-a21': 'https://print-oss.gzchitu.cn/fd972202501150910565164.png',
};

export default function SelectModel() {
  const router = useRouter();
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [inventory, setInventory] = useState<MachineInventory | null>(null);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(false);

  // Check if we're in demo mode (no machineId)
  const isDemoMode = !router.query.machineId;

  // Demo mode: Get curated models from phone-models.ts
  const demoModels = React.useMemo(() => {
    if (!isDemoMode) return [];
    return PHONE_MODELS.filter(pm => DEMO_MODE_MODELS.includes(pm.id));
  }, [isDemoMode]);

  // Demo mode: Get brands from curated models
  const demoBrands = React.useMemo(() => {
    if (!isDemoMode) return [];
    return Array.from(new Set(demoModels.map(m => m.brand)));
  }, [isDemoMode, demoModels]);

  // Get brands dynamically - from API or demo mode
  const brands = isDemoMode ? demoBrands : (inventory?.brands.map(b => b.name_en) || []);

  // Helper to normalize model names for matching
  const normalizeModelName = (name: string) => {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  };

  // Find matching PhoneModel from phone-models.ts (for dimensions, masks, etc.)
  const findMatchingPhoneModel = (modelName: string, brandName: string): PhoneModel | undefined => {
    const normalizedName = normalizeModelName(modelName);
    return PHONE_MODELS.find(pm => {
      const normalizedPmName = normalizeModelName(pm.model);
      // Match by model name (case-insensitive)
      return normalizedPmName === normalizedName;
    });
  };

  // Convert API inventory to dynamic models for current brand
  // Sort by stock: in-stock items first, then out-of-stock
  const currentModels: DynamicModel[] = React.useMemo(() => {
    if (!selectedBrand) return [];

    // DEMO MODE: Use curated models from phone-models.ts
    if (isDemoMode) {
      return demoModels
        .filter(pm => pm.brand === selectedBrand)
        .map(pm => ({
          id: pm.id,
          brand: pm.brand,
          model: pm.model,
          displayName: pm.displayName,
          product_id: pm.chituProductId || `demo-${pm.id}`,
          stock: 99, // Demo mode: always in stock
          show_img: DEMO_MODE_THUMBNAILS[pm.id], // Use Chitu thumbnail
          dimensions: pm.dimensions,
          thumbnailPath: pm.thumbnailPath,
          printMaskPath: pm.printMaskPath,
        }));
    }

    // REAL MODE: Use API inventory
    if (!inventory) return [];

    const brandData = inventory.brands.find(b => b.name_en === selectedBrand);
    if (!brandData) return [];

    const models = brandData.modelList.map(item => {
      const matchedPhoneModel = findMatchingPhoneModel(item.name_en, selectedBrand);
      const modelId = matchedPhoneModel?.id || `dynamic-${item.product_id}`;

      return {
        id: modelId,
        brand: selectedBrand,
        model: item.name_en,
        displayName: item.name_en,
        product_id: item.product_id,
        stock: item.stock,
        // Use Chitu API images
        show_img: item.show_img,
        print_img: item.print_img,
        // Fallback to phone-models.ts if matched
        dimensions: matchedPhoneModel?.dimensions,
        thumbnailPath: matchedPhoneModel?.thumbnailPath,
        printMaskPath: matchedPhoneModel?.printMaskPath,
      };
    });

    // Sort: in-stock first (by stock count descending), then out-of-stock
    return models.sort((a, b) => {
      if (a.stock > 0 && b.stock <= 0) return -1; // a in stock, b out of stock -> a first
      if (a.stock <= 0 && b.stock > 0) return 1;  // a out of stock, b in stock -> b first
      return b.stock - a.stock; // both same category, sort by stock count descending
    });
  }, [inventory, selectedBrand, isDemoMode, demoModels]);

  // Fetch inventory from machine on page load (only if machineId is provided)
  useEffect(() => {
    const fetchInventory = async () => {
      const machineId = router.query.machineId as string;

      // If no machineId, enter demo mode (show curated models)
      if (!machineId) {
        console.log('🎮 DEMO MODE: No machine ID in URL - showing curated demo models');
        setIsLoadingInventory(false);
        setInventory(null); // null = demo mode
        // Auto-select first demo brand
        if (demoBrands.length > 0) {
          setSelectedBrand(demoBrands[0]);
        }
        return;
      }

      console.log(`📦 Fetching inventory for machine: ${machineId}`);
      setIsLoadingInventory(true);
      setInventoryError(null);

      try {
        // Use dynamic backend URL based on current origin (works on any network/IP)
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin.replace(':3000', ':3001') : 'http://localhost:3001');
        const response = await fetch(`${backendUrl}/api/chitu/products/${machineId}?type=all&status=1`);

        if (!response.ok) {
          throw new Error(`Failed to fetch inventory: ${response.statusText}`);
        }

        const data: MachineInventory = await response.json();
        console.log('✅ Inventory loaded:', data);
        setInventory(data);

        // Auto-select first brand when inventory loads
        if (data.brands && data.brands.length > 0) {
          setSelectedBrand(data.brands[0].name_en);
          console.log(`📱 Auto-selected first brand: ${data.brands[0].name_en}`);
        }
      } catch (error) {
        console.error('❌ Failed to load inventory:', error);
        setInventoryError(error instanceof Error ? error.message : 'Failed to load inventory');
      } finally {
        setIsLoadingInventory(false);
      }
    };

    // Only fetch when router is ready
    if (router.isReady) {
      fetchInventory();
    }
  }, [router.isReady, router.query.machineId]);

  // PROACTIVE SESSION CLEANUP - Runs on every page load to prevent quota errors
  // This is critical for production to ensure sessionStorage never fills up
  useEffect(() => {
    const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes - sessions older than this get cleaned
    const now = Date.now();

    console.log('🧹 Running proactive sessionStorage cleanup...');

    let cleanedCount = 0;
    let totalSize = 0;
    const keysToRemove: string[] = [];

    // Scan all sessionStorage entries
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;

      const value = sessionStorage.getItem(key);
      if (value) {
        totalSize += value.length;
      }

      // Clean up canvas-state entries (they contain large base64 images)
      if (key.startsWith('canvas-state-')) {
        try {
          const data = JSON.parse(value || '{}');
          const savedAt = data.savedAt || 0;

          // Remove if older than max age OR if it has no timestamp (corrupt/old format)
          if (!savedAt || (now - savedAt) > SESSION_MAX_AGE_MS) {
            keysToRemove.push(key);
          }
        } catch (e) {
          // Can't parse - remove it
          keysToRemove.push(key);
        }
      }

      // Clean up old session locks and page states
      if (key.startsWith('session-lock-timestamp-')) {
        const timestamp = parseInt(value || '0', 10);
        if ((now - timestamp) > SESSION_MAX_AGE_MS) {
          keysToRemove.push(key);
          // Also remove related keys
          const sessionId = key.replace('session-lock-timestamp-', '');
          keysToRemove.push(`session-locked-${sessionId}`);
          keysToRemove.push(`page-state-${sessionId}`);
        }
      }
    }

    // Remove all marked keys
    keysToRemove.forEach(key => {
      sessionStorage.removeItem(key);
      cleanedCount++;
    });

    const estimatedSizeKB = Math.round(totalSize / 1024);
    console.log(`📊 SessionStorage: ~${estimatedSizeKB}KB used, cleaned ${cleanedCount} expired entries`);

    // If storage is still large (>2MB), aggressively clean old canvas states
    if (totalSize > 2 * 1024 * 1024) {
      console.warn('⚠️ SessionStorage still large, performing aggressive cleanup...');
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('canvas-state-')) {
          sessionStorage.removeItem(key);
          console.log('🗑️ Aggressive cleanup:', key);
        }
      }
    }
  }, []); // Run once on mount

  // Tab-session cleanup for new users
  useEffect(() => {
    // Check if we came here from a direct navigation (not a refresh/redirect from editor)
    const referrer = document.referrer;
    const isFromEditor = referrer.includes('/editor');

    if (isFromEditor) {
      console.log('🔄 Came from editor - preserving tab-session for refresh restoration');
      return;
    }

    console.log('🧹 Model selection page loaded from external source - clearing tab-session associations');

    const machineId = router.query.machineId as string;

    // Only clear tab-session keys if we have a machineId (not in demo mode)
    if (machineId) {
      // Clear all tab-session keys for this machine
      // This breaks the association between machine+model and a session ID
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith(`tab-session-${machineId}-`)) {
          console.log(`🗑️ Clearing session association: ${key}`);
          sessionStorage.removeItem(key);
        }
      });
    }

    console.log('✅ Session association cleanup complete - ready for new user');
  }, [router.query.machineId]);

  // Helper function to load image dimensions from URL
  const loadImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      img.src = url;
    });
  };

  // Handle model selection - works with dynamic models from API
  const handleModelSelect = async (model: DynamicModel) => {
    // Check if model is in stock (demo mode always has stock)
    if (model.stock <= 0) return;

    // For dynamic models without local dimensions, load them from print_img
    let dimensions = model.dimensions;

    if (!dimensions && model.print_img) {
      console.log(`📐 Loading dimensions from print_img for ${model.model}...`);
      setIsLoadingDimensions(true);

      try {
        const imgDimensions = await loadImageDimensions(model.print_img);
        console.log(`✅ Got print_img dimensions: ${imgDimensions.width} x ${imgDimensions.height}`);

        // Convert PX to MM using standard Chitu density (~10 px/mm)
        // This ensures canvas aspect ratio matches the actual phone case
        const PX_PER_MM = 10;
        dimensions = {
          widthPX: imgDimensions.width,
          heightPX: imgDimensions.height,
          widthMM: Math.round(imgDimensions.width / PX_PER_MM * 10) / 10, // Round to 1 decimal
          heightMM: Math.round(imgDimensions.height / PX_PER_MM * 10) / 10,
        };
        console.log(`📐 Derived dimensions:`, dimensions);
      } catch (error) {
        console.error('❌ Failed to load print_img dimensions:', error);
        // Fall back to default dimensions if image fails to load
        dimensions = undefined;
      } finally {
        setIsLoadingDimensions(false);
      }
    }

    // Store COMPLETE model data in sessionStorage for fully dynamic operation
    // This allows the editor to work with ANY model from the API, not just hardcoded ones
    const dynamicModelData = {
      id: model.id,
      brand: model.brand,
      model: model.model,
      displayName: model.displayName,
      product_id: model.product_id,
      // URLs from Chitu API
      print_img: model.print_img,  // Cutout mask URL
      show_img: model.show_img,    // Thumbnail URL
      // Dimensions - either from local phone-models.ts OR derived from print_img
      dimensions: dimensions,
      // Local paths (only for hardcoded models)
      thumbnailPath: model.thumbnailPath,
      printMaskPath: model.printMaskPath,
    };

    // Helper to safely set sessionStorage with quota handling
    const safeSetItem = (key: string, value: string) => {
      try {
        sessionStorage.setItem(key, value);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          console.warn('⚠️ SessionStorage quota exceeded, cleaning up old canvas states...');
          // Clean up old canvas-state entries (they contain large base64 images)
          const keysToRemove: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const storageKey = sessionStorage.key(i);
            if (storageKey && storageKey.startsWith('canvas-state-')) {
              keysToRemove.push(storageKey);
            }
          }
          keysToRemove.forEach(k => {
            sessionStorage.removeItem(k);
            console.log('🗑️ Removed old canvas state:', k);
          });
          // Retry after cleanup
          try {
            sessionStorage.setItem(key, value);
          } catch (retryErr) {
            console.error('❌ Still cannot save to sessionStorage after cleanup:', retryErr);
          }
        } else {
          throw err;
        }
      }
    };

    // Store complete model data as JSON
    safeSetItem('selectedPhoneModelData', JSON.stringify(dynamicModelData));
    console.log(`💾 Stored complete model data:`, dynamicModelData);

    // Also store individual fields for backward compatibility
    safeSetItem('selectedPhoneModel', model.id);
    safeSetItem('selectedPhoneModelProductId', model.product_id);

    if (model.print_img) {
      safeSetItem('selectedPhoneModelPrintImg', model.print_img);
      console.log(`💾 Stored print_img (mask): ${model.print_img}`);
    } else {
      sessionStorage.removeItem('selectedPhoneModelPrintImg');
    }

    if (model.show_img) {
      safeSetItem('selectedPhoneModelShowImg', model.show_img);
      console.log(`💾 Stored show_img (thumbnail): ${model.show_img}`);
    } else {
      sessionStorage.removeItem('selectedPhoneModelShowImg');
    }

    // Check if machineId was passed (from QR code flow)
    const machineId = router.query.machineId as string;

    // Navigate to editor with model
    if (machineId) {
      // Real mode: use actual machine ID
      router.push(`/editor?machineId=${machineId}&model=${model.id}`);
    } else {
      // Demo mode: pass demo flag to editor
      router.push(`/editor?model=${model.id}&demo=true`);
    }
  };

  // Get icon for brand
  const getBrandIcon = (brandName: string) => {
    const lowerBrand = brandName.toLowerCase();
    if (lowerBrand.includes('apple') || lowerBrand.includes('苹果')) {
      return (
        <svg className="w-10 h-12 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
      );
    }
    // Generic phone icon for Samsung, OPPO, and others
    return (
      <svg
        className="w-10 h-14 text-gray-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    );
  };

  // Calculate stats for current brand
  const inStockCount = currentModels.filter(m => m.stock > 0).length;
  const outOfStockCount = currentModels.filter(m => m.stock <= 0).length;

  return (
    <>
      <Head>
        <title>Select Your Phone - SweetRobo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      <div className="model-selection-page min-h-screen bg-white safe-top safe-bottom">
        {/* Loading overlay when fetching dimensions */}
        {isLoadingDimensions && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-6 mx-4 text-center shadow-xl">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mb-4"></div>
              <p className="text-gray-700 font-medium">Preparing editor...</p>
              <p className="text-gray-500 text-sm mt-1">Loading phone case template</p>
            </div>
          </div>
        )}

        {/* Mobile-only header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-3 safe-top">
          <div className="flex items-center gap-3 mb-2">
            <img src="/icons/sweetrobo-logo.gif" alt="SweetRobo" className="w-16 h-16 object-contain" />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                Select Your Phone
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {isLoadingInventory
                  ? 'Loading available models...'
                  : isDemoMode
                    ? 'Demo Mode - Try the design experience'
                    : inventory && inventory.count > 0
                      ? `${inventory.count} models available`
                      : 'No products available'}
              </p>
            </div>
          </div>

          {/* Demo Mode Alert */}
          {!isLoadingInventory && isDemoMode && (
            <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">
                Demo Mode: Design and preview without printing. Scan a machine QR code to print for real.
              </p>
            </div>
          )}

          {/* Inventory Error Alert */}
          {inventoryError && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">
                ⚠️ Could not load inventory: {inventoryError}
              </p>
            </div>
          )}
        </div>

        {/* Brand Tabs - only show when brands are loaded */}
        {!isLoadingInventory && brands.length > 0 && (
          <div className="px-4 pt-4">
            <div className="flex space-x-2 bg-gray-100 p-1 rounded-xl overflow-x-auto">
              {brands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => setSelectedBrand(brand)}
                  className={`
                    flex-1 py-3 px-4 rounded-lg font-medium transition-all whitespace-nowrap min-w-fit
                    ${selectedBrand === brand
                      ? 'bg-white text-purple-600 shadow-lg'
                      : 'text-gray-600 active:scale-95'
                    }
                  `}
                >
                  {brand}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Phone Model Grid */}
        <div className="px-4 py-4">
          {/* Loading Spinner */}
          {isLoadingInventory && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
              <p className="text-gray-600 mt-4">Loading inventory...</p>
            </div>
          )}

          {/* No brands available */}
          {!isLoadingInventory && brands.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-600">No products available</p>
            </div>
          )}

          {/* No models for selected brand */}
          {!isLoadingInventory && selectedBrand && currentModels.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No models available for {selectedBrand}</p>
            </div>
          ) : !isLoadingInventory && currentModels.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {currentModels.map((model) => {
                const isInStock = model.stock > 0;
                return (
                  <button
                    key={model.product_id}
                    onClick={() => handleModelSelect(model)}
                    disabled={!isInStock}
                    className={`
                      bg-white rounded-2xl p-4 border border-gray-200
                      flex flex-col items-center
                      transition-all duration-200 transform
                      ${isInStock
                        ? 'active:scale-95 shadow-lg hover:shadow-xl'
                        : 'opacity-50 cursor-not-allowed'
                      }
                    `}
                  >
                    {/* Phone Case Thumbnail - centered */}
                    <div className="h-32 w-full flex items-center justify-center mb-3">
                      {model.show_img ? (
                        <img
                          src={model.show_img}
                          alt={model.model}
                          className="h-full w-auto object-contain"
                          style={{ borderRadius: '9px', boxShadow: '0 0 0 1px black' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`w-16 h-full bg-gray-100 rounded-xl flex items-center justify-center ${model.show_img ? 'hidden' : ''}`}>
                        {getBrandIcon(selectedBrand)}
                      </div>
                    </div>

                    {/* Model Info - below thumbnail */}
                    <div className="w-full text-center">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {model.model}
                      </div>
                    </div>

                    {/* Stock Badge - at bottom */}
                    <div className="mt-2">
                      {isDemoMode ? (
                        <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                          Demo
                        </div>
                      ) : isInStock ? (
                        <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                          {model.stock} in stock
                        </div>
                      ) : (
                        <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-medium">
                          Out of Stock
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Model Count Info */}
        {!isLoadingInventory && selectedBrand && currentModels.length > 0 && (
          <div className="px-4 pb-4">
            <div className="bg-gray-100 rounded-xl p-4">
              <div className="flex justify-between items-center text-gray-600 text-sm">
                <span>{inStockCount} models in stock</span>
                <span>{outOfStockCount} out of stock</span>
              </div>
            </div>
          </div>
        )}

        {/* Bottom spacing for home indicator on iOS */}
        <div className="h-8 safe-bottom" />
      </div>

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow-x: hidden;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }

        /* Safe area padding for notched phones */
        .safe-top {
          padding-top: env(safe-area-inset-top);
        }
        
        .safe-bottom {
          padding-bottom: env(safe-area-inset-bottom);
        }

        /* Prevent pull-to-refresh on mobile */
        body {
          overscroll-behavior-y: none;
        }

        /* Remove tap highlight on mobile */
        * {
          -webkit-tap-highlight-color: transparent;
        }

        /* Ensure full height on mobile browsers */
        #__next {
          min-height: 100vh;
          min-height: -webkit-fill-available;
        }

        html {
          height: -webkit-fill-available;
        }
      `}</style>
    </>
  );
}