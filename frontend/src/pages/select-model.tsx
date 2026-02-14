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

// Demo mode: Complete list of all phone models available across all machines
// Each model includes Chitu API URLs for show_img (thumbnail) and print_img (cutout template)
interface DemoModel {
  id: string;
  brand: string;
  model: string;
  show_img: string;
  print_img: string;
}

const DEMO_MODE_PRODUCTS: DemoModel[] = [
  // ========== APPLE ==========
  { id: 'iphone-16-pro', brand: 'Apple', model: 'iPhone 16 Pro', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone16pro.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone16pro-print.png' },
  { id: 'iphone-16-plus', brand: 'Apple', model: 'iPhone 16 Plus', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone16plus.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone16plus-print.png' },
  { id: 'iphone-16', brand: 'Apple', model: 'iPhone 16', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone16.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone16-print.png' },
  { id: 'iphone-16e', brand: 'Apple', model: 'iPhone 16e', show_img: 'https://print-oss.gzchitu.cn/8e693202507280930015069.png', print_img: 'https://print-oss.gzchitu.cn/dd096202507280930141057.png' },
  { id: 'iphone-15-pro-max', brand: 'Apple', model: 'iPhone 15 Pro Max', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone15promax.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone15promax-print.png' },
  { id: 'iphone-15-pro', brand: 'Apple', model: 'iPhone 15 Pro', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone15pro.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone15pro-print.png' },
  { id: 'iphone-15-plus', brand: 'Apple', model: 'iPhone 15 Plus', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone15plus.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone15plus-print.png' },
  { id: 'iphone-15', brand: 'Apple', model: 'iPhone 15', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone15.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone15-print.png' },
  { id: 'iphone-14-pro-max', brand: 'Apple', model: 'iPhone 14 Pro Max', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone14promax.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone14promax-print.png' },
  { id: 'iphone-14-plus', brand: 'Apple', model: 'iPhone 14 Plus', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone14plus.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone14plus-print.png' },
  { id: 'iphone-13-pro-max', brand: 'Apple', model: 'iPhone 13 Pro Max', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone13promax.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone13promax-print.png' },
  { id: 'iphone-13-pro', brand: 'Apple', model: 'iPhone 13 Pro', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone13pro.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone13pro-print.png' },
  { id: 'iphone-13', brand: 'Apple', model: 'iPhone 13', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone13.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone13-print.png' },
  { id: 'iphone-12-pro-max', brand: 'Apple', model: 'iPhone 12 Pro Max', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone12promax.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone12promax-print.png' },
  { id: 'iphone-12-pro', brand: 'Apple', model: 'iPhone 12 Pro', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone12pro.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone12pro-print.png' },
  { id: 'iphone-12-mini', brand: 'Apple', model: 'iPhone 12 mini', show_img: 'https://print-oss.gzchitu.cn/iphone/iphone12mini.png', print_img: 'https://print-oss.gzchitu.cn/iphone/iphone12mini-print.png' },
  { id: 'iphone-11-pro-max', brand: 'Apple', model: 'iPhone 11 Pro Max', show_img: 'https://print-oss.gzchitu.cn/3929920250515145327231.png', print_img: 'https://print-oss.gzchitu.cn/4e49820250515145345105.png' },
  // ========== SAMSUNG ==========
  { id: 'samsung-s25', brand: 'Samsung', model: 'S25', show_img: 'https://print-oss.gzchitu.cn/d4fcd202505071627593533.png', print_img: 'https://print-oss.gzchitu.cn/b0272202505071628182847.png' },
  { id: 'samsung-s24', brand: 'Samsung', model: 'S24', show_img: 'https://print-oss.gzchitu.cn/9bf15202505071710473229.png', print_img: 'https://print-oss.gzchitu.cn/1b27e20250507171106356.png' },
  { id: 'samsung-s24-fe', brand: 'Samsung', model: 'S24 FE', show_img: 'https://print-oss.gzchitu.cn/14d5b20241219092934477.png', print_img: 'https://print-oss.gzchitu.cn/2bba4202412190930043660.png' },
  { id: 'samsung-s24-plus', brand: 'Samsung', model: 'S24 Plus/S24 Pro', show_img: 'https://print-oss.gzchitu.cn/767ac202501150941559681.png', print_img: 'https://print-oss.gzchitu.cn/d57d020250115094226992.png' },
  { id: 'samsung-s23', brand: 'Samsung', model: 'S23', show_img: 'https://print-oss.gzchitu.cn/3f89d202501150936513451.png', print_img: 'https://print-oss.gzchitu.cn/c1f5920250115093625400.png' },
  { id: 'samsung-s23-plus', brand: 'Samsung', model: 'S23 Plus', show_img: 'https://print-oss.gzchitu.cn/5ec0f202505071708135727.png', print_img: 'https://print-oss.gzchitu.cn/2ccd9202505071708322128.png' },
  { id: 'samsung-a56', brand: 'Samsung', model: 'A56', show_img: 'https://print-oss.gzchitu.cn/98007202505071645335788.png', print_img: 'https://print-oss.gzchitu.cn/723a4202505071645567439.png' },
  { id: 'samsung-a54', brand: 'Samsung', model: 'Galaxy A54', show_img: 'https://print-oss.gzchitu.cn/e2a98202505071654238374.png', print_img: 'https://print-oss.gzchitu.cn/adebb202505071654421599.png' },
  { id: 'samsung-a36', brand: 'Samsung', model: 'A36', show_img: 'https://print-oss.gzchitu.cn/5c048202505191148459861.png', print_img: 'https://print-oss.gzchitu.cn/3d8b720250519114900963.png' },
  { id: 'samsung-a35', brand: 'Samsung', model: 'A35', show_img: 'https://print-oss.gzchitu.cn/82f42202505191147248735.png', print_img: 'https://print-oss.gzchitu.cn/9c077202505191147424547.png' },
  { id: 'samsung-a34', brand: 'Samsung', model: 'Galaxy A34', show_img: 'https://print-oss.gzchitu.cn/7201a202505071651287304.png', print_img: 'https://print-oss.gzchitu.cn/56ed1202505071651519991.png' },
  { id: 'samsung-a21', brand: 'Samsung', model: 'A21', show_img: 'https://print-oss.gzchitu.cn/fd972202501150910565164.png', print_img: 'https://print-oss.gzchitu.cn/b6c43202501150911188475.png' },
  { id: 'samsung-a16-5g', brand: 'Samsung', model: 'A16 5G', show_img: 'https://print-oss.gzchitu.cn/a5fe020241219092743756.png', print_img: 'https://print-oss.gzchitu.cn/79d99202412190928072825.png' },
  { id: 'samsung-a14', brand: 'Samsung', model: 'A14', show_img: 'https://print-oss.gzchitu.cn/5782f202501141717374326.png', print_img: 'https://print-oss.gzchitu.cn/966ff202501141718116575.png' },
  { id: 'samsung-s7', brand: 'Samsung', model: 'S7', show_img: 'https://print-oss.gzchitu.cn/9846e202501151132004130.png', print_img: 'https://print-oss.gzchitu.cn/7db6f202501151132581911.png' },
  { id: 'samsung-f14-5g', brand: 'Samsung', model: 'F14 5G', show_img: 'https://print-oss.gzchitu.cn/4007e202412190956521842.png', print_img: 'https://print-oss.gzchitu.cn/7d326202412190957173054.png' },
  // ========== OPPO ==========
  { id: 'oppo-a38', brand: 'OPPO', model: 'OPPO A38', show_img: 'https://print-oss.gzchitu.cn/58977202504171556109004.png', print_img: 'https://print-oss.gzchitu.cn/29bb2202504171556356324.png' },
  { id: 'realme-note60', brand: 'OPPO', model: 'Realme Note 60', show_img: 'https://print-oss.gzchitu.cn/760e5202504171412409089.png', print_img: 'https://print-oss.gzchitu.cn/0c56c202504171413031438.png' },
  // ========== XIAOMI ==========
  { id: 'xiaomi-civi3', brand: 'Xiaomi', model: 'Xiaomi Civi 3', show_img: 'https://print-oss.gzchitu.cn/c76a5202503101143452686.png', print_img: 'https://print-oss.gzchitu.cn/1e7c0202503101144053718.png' },
];

// Machine status response type
interface MachineStatus {
  success: boolean;
  online: boolean;
  message: string;
  machine: {
    name: string;
    code: string;
    model: string;
    address: string;
  } | null;
}

export default function SelectModel() {
  const router = useRouter();
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [inventory, setInventory] = useState<MachineInventory | null>(null);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(false);

  // Machine status state
  const [machineStatus, setMachineStatus] = useState<MachineStatus | null>(null);
  const [isCheckingMachine, setIsCheckingMachine] = useState(false);
  const [machineOffline, setMachineOffline] = useState(false);

  // Session state - generated immediately when user lands on this page
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Check if we're in demo mode (no machineId)
  const isDemoMode = !router.query.machineId;

  // Demo mode: Get all demo models with Chitu images
  const demoModels = React.useMemo(() => {
    if (!isDemoMode) return [];
    return DEMO_MODE_PRODUCTS;
  }, [isDemoMode]);

  // Demo mode: Get brands from demo models (in specific order)
  const demoBrands = React.useMemo(() => {
    if (!isDemoMode) return [];
    // Return brands in a specific order for better UX
    const brandOrder = ['Apple', 'Samsung', 'OPPO', 'Xiaomi'];
    const availableBrands = Array.from(new Set(demoModels.map(m => m.brand)));
    return brandOrder.filter(b => availableBrands.includes(b));
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

    // DEMO MODE: Use all demo models with Chitu images
    if (isDemoMode) {
      // Find matching PhoneModel for dimensions if available
      return demoModels
        .filter(dm => dm.brand === selectedBrand)
        .map(dm => {
          const matchedPhoneModel = findMatchingPhoneModel(dm.model, dm.brand);
          return {
            id: dm.id,
            brand: dm.brand,
            model: dm.model,
            displayName: dm.model,
            product_id: `demo-${dm.id}`,
            stock: 99, // Demo mode: always in stock
            show_img: dm.show_img,
            print_img: dm.print_img,
            // Use local dimensions if available, otherwise will be loaded from print_img
            dimensions: matchedPhoneModel?.dimensions,
            thumbnailPath: matchedPhoneModel?.thumbnailPath,
            printMaskPath: matchedPhoneModel?.printMaskPath,
          };
        });
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

  // Check machine status and fetch inventory on page load
  useEffect(() => {
    const checkMachineAndFetchInventory = async () => {
      const machineId = router.query.machineId as string;

      // If no machineId, enter demo mode (show curated models)
      if (!machineId) {
        console.log('🎮 DEMO MODE: No machine ID in URL - showing curated demo models');
        setIsLoadingInventory(false);
        setIsCheckingMachine(false);
        setInventory(null); // null = demo mode
        // Auto-select first demo brand
        if (demoBrands.length > 0) {
          setSelectedBrand(demoBrands[0]);
        }
        return;
      }

      // Step 1: Check if machine is online
      console.log(`🔍 Checking machine status for: ${machineId}`);
      setIsCheckingMachine(true);
      setMachineOffline(false);

      try {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin.replace(':3002', ':3003') : 'http://localhost:3003');
        const statusResponse = await fetch(`${backendUrl}/api/chitu/machine/${machineId}/status`);
        const statusData: MachineStatus = await statusResponse.json();

        console.log('📡 Machine status:', statusData);
        setMachineStatus(statusData);

        if (!statusData.online) {
          console.warn('⚠️ Machine is offline:', statusData.message);
          setMachineOffline(true);
          setIsCheckingMachine(false);
          setIsLoadingInventory(false);
          return; // Don't fetch inventory if machine is offline
        }

        console.log('✅ Machine is online, fetching inventory...');
      } catch (error) {
        console.error('❌ Failed to check machine status:', error);
        // Continue to fetch inventory even if status check fails
        // (machine might still work, status endpoint might just be down)
      }

      setIsCheckingMachine(false);

      // Step 2: Fetch inventory (only if machine is online or status check failed)
      console.log(`📦 Fetching inventory for machine: ${machineId}`);
      setIsLoadingInventory(true);
      setInventoryError(null);

      try {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin.replace(':3002', ':3003') : 'http://localhost:3003');
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
      checkMachineAndFetchInventory();
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

  // SESSION GENERATION - Creates or reuses session when user lands on select-model page
  // This is the START of every user journey (from QR code scan)
  useEffect(() => {
    if (!router.isReady) return;

    const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
    const machineId = router.query.machineId as string;
    const urlSession = router.query.session as string;

    // Helper to generate new session ID
    const generateSessionId = () => {
      const prefix = machineId ? machineId : 'demo';
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      return `${prefix}_${timestamp}_${random}`;
    };

    // Helper to check if session is valid (not locked, not expired, correct machine)
    const isSessionValid = (sid: string) => {
      const isLocked = sessionStorage.getItem(`session-locked-${sid}`) === 'true';
      if (isLocked) {
        console.log(`🔒 Session ${sid} is locked (already submitted)`);
        return false;
      }

      const createdAt = sessionStorage.getItem(`session-created-${sid}`);
      if (createdAt) {
        const age = Date.now() - parseInt(createdAt);
        if (age > SESSION_MAX_AGE_MS) {
          console.log(`⏰ Session ${sid} is expired (${Math.round(age / 60000)} min old)`);
          return false;
        }
      }

      // IMPORTANT: Check if session prefix matches current machineId
      // This prevents reusing a demo session when connecting to a real machine
      const expectedPrefix = machineId ? machineId : 'demo';
      const sessionPrefix = sid.split('_')[0];
      if (sessionPrefix !== expectedPrefix) {
        console.log(`🔄 Session ${sid} has wrong prefix (${sessionPrefix}), expected ${expectedPrefix}`);
        return false;
      }

      return true;
    };

    // Helper to clear session data
    const clearSession = (sid: string) => {
      sessionStorage.removeItem(`session-created-${sid}`);
      sessionStorage.removeItem(`session-model-${sid}`);
      sessionStorage.removeItem(`session-locked-${sid}`);
      sessionStorage.removeItem(`session-lock-timestamp-${sid}`);
      sessionStorage.removeItem(`page-state-${sid}`);
      sessionStorage.removeItem(`canvas-state-${sid}`);
      sessionStorage.removeItem(`canvas-history-${sid}`);
      sessionStorage.removeItem(`ai-edit-count-${sid}`);
    };

    let session: string;

    // Priority 1: Session in URL (from coming back from editor)
    if (urlSession && isSessionValid(urlSession)) {
      console.log('✅ Using valid session from URL:', urlSession);
      session = urlSession;
    }
    // Priority 2: Existing tab session (same browser tab)
    else {
      const existingSession = sessionStorage.getItem('current-tab-session');

      if (existingSession && isSessionValid(existingSession)) {
        console.log('♻️ Reusing existing valid tab session:', existingSession);
        session = existingSession;
      } else {
        // Clear invalid session if exists
        if (existingSession) {
          console.log('🧹 Clearing invalid session:', existingSession);
          clearSession(existingSession);
          sessionStorage.removeItem('current-tab-session');
        }

        // Generate new session
        session = generateSessionId();
        console.log('🆕 Generated new session:', session);

        // Set creation timestamp
        sessionStorage.setItem(`session-created-${session}`, Date.now().toString());
      }
    }

    // Store as current tab session
    sessionStorage.setItem('current-tab-session', session);
    setSessionId(session);

    // Add session to URL if not already there
    if (!urlSession || urlSession !== session) {
      const newUrl = machineId
        ? `/select-model?machineId=${machineId}&session=${session}`
        : `/select-model?session=${session}`;
      router.replace(newUrl, undefined, { shallow: true });
      console.log('📍 Session added to URL:', session);
    }
  }, [router.isReady, router.query.machineId, router.query.session]);

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

    // Navigate to editor with model AND session
    // Session was already created when user landed on select-model page
    if (machineId) {
      // Real mode: use actual machine ID
      router.push(`/editor?machineId=${machineId}&model=${model.id}&session=${sessionId}`);
    } else {
      // Demo mode: pass demo flag to editor
      router.push(`/editor?model=${model.id}&session=${sessionId}&demo=true`);
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
        <div className="sticky top-0 bg-white border-b border-gray-200 z-20 px-4 py-3 safe-top">
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

          {/* Machine Offline Alert */}
          {machineOffline && machineStatus && (
            <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🔌</div>
                <div className="flex-1">
                  <p className="font-semibold text-orange-800">Machine Offline</p>
                  <p className="text-sm text-orange-700 mt-1">
                    {machineStatus.machine?.name || `Machine ${router.query.machineId}`} is currently offline.
                  </p>
                  <p className="text-sm text-orange-600 mt-2">
                    Please try another machine or come back later.
                  </p>
                </div>
              </div>
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
          {/* Loading Spinner - Checking Machine */}
          {isCheckingMachine && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
              <p className="text-gray-600 mt-4">Checking machine status...</p>
            </div>
          )}

          {/* Loading Spinner - Loading Inventory */}
          {!isCheckingMachine && isLoadingInventory && !machineOffline && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
              <p className="text-gray-600 mt-4">Loading inventory...</p>
            </div>
          )}

          {/* No brands available */}
          {!isLoadingInventory && !isCheckingMachine && !machineOffline && brands.length === 0 && (
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
                    {/* Phone Case Thumbnail - centered with loading state */}
                    <div className="h-32 w-full flex items-center justify-center mb-3 relative">
                      {model.show_img ? (
                        <>
                          {/* Skeleton placeholder - shown while image loads */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-28 bg-gray-200 rounded-xl animate-pulse" />
                          </div>
                          {/* Actual image - fades in when loaded */}
                          <img
                            src={model.show_img}
                            alt={model.model}
                            className="h-full w-auto object-contain relative z-10 opacity-0 transition-opacity duration-300"
                            style={{ borderRadius: '9px', boxShadow: '0 0 0 1px rgba(0,0,0,0.15)' }}
                            onLoad={(e) => {
                              e.currentTarget.classList.remove('opacity-0');
                              e.currentTarget.classList.add('opacity-100');
                              // Hide skeleton
                              const skeleton = e.currentTarget.previousElementSibling as HTMLElement;
                              if (skeleton) skeleton.style.display = 'none';
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              // Show fallback icon
                              const fallback = e.currentTarget.parentElement?.querySelector('.fallback-icon') as HTMLElement;
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                        </>
                      ) : null}
                      <div className={`fallback-icon w-16 h-full bg-gray-100 rounded-xl flex items-center justify-center ${model.show_img ? 'hidden' : ''}`}>
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