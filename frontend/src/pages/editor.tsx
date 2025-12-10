import React, { useRef, useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useDropzone } from 'react-dropzone';
import Modal from 'react-modal';
import { io, Socket } from 'socket.io-client';
import 'cropperjs/dist/cropper.css';
import { getPhoneModel, PhoneModel } from '../types/phone-models';

// Set app element for accessibility
if (typeof window !== 'undefined') {
  Modal.setAppElement('#__next');
}

// Default canvas dimensions for backward compatibility
const DEFAULT_SCALE_FACTOR = 2.2;
const DEFAULT_WIDTH_MM = 100;
const DEFAULT_HEIGHT_MM = 185;

// Dynamic model data structure (matches what select-model.tsx stores)
interface DynamicPhoneModelData {
  id: string;
  brand: string;
  model: string;
  displayName: string;
  product_id: string;
  print_img?: string;    // Cutout mask URL from Chitu API
  show_img?: string;     // Thumbnail URL from Chitu API
  dimensions?: {
    widthMM: number;
    heightMM: number;
    widthPX: number;
    heightPX: number;
  } | null;
  thumbnailPath?: string;
  printMaskPath?: string;
}

export default function Editor() {
  const router = useRouter();
  const { model: modelId, demo: demoParam } = router.query;

  // Check if we're in demo mode (no machineId, demo=true in URL)
  const isDemoMode = demoParam === 'true' || (!router.query.machineId && router.isReady);

  // Get phone model configuration - DYNAMIC FIRST, then fallback to hardcoded
  // This allows the editor to work with ANY model from the Chitu API
  const [dynamicModelData, setDynamicModelData] = useState<DynamicPhoneModelData | null>(null);

  // Load dynamic model data from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedData = sessionStorage.getItem('selectedPhoneModelData');
        if (storedData) {
          const parsed = JSON.parse(storedData);
          console.log('📱 Loaded dynamic model data from sessionStorage:', parsed);
          setDynamicModelData(parsed);
        }
      } catch (error) {
        console.error('❌ Failed to parse dynamic model data:', error);
      }
    }
  }, []);

  // Try hardcoded model first (for backward compatibility), then use dynamic data
  const hardcodedModel = modelId ? getPhoneModel(modelId as string) : null;

  // Create a unified phone model object that works for both hardcoded and dynamic models
  const phoneModel = hardcodedModel || (dynamicModelData ? {
    id: dynamicModelData.id,
    brand: dynamicModelData.brand,
    model: dynamicModelData.model,
    displayName: dynamicModelData.displayName,
    dimensions: dynamicModelData.dimensions || undefined,
    thumbnailPath: dynamicModelData.thumbnailPath,
    printMaskPath: dynamicModelData.printMaskPath || dynamicModelData.print_img,
    chituProductId: dynamicModelData.product_id,
    available: true,
  } as PhoneModel : null);

  // Initialize state variables first
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<any>(null);
  const [uploadedImage, setUploadedImage] = useState<any>(null);
  // Check if we have a saved image in sessionStorage on initial load
  const [hasRestoredImage, setHasRestoredImage] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionId = urlParams.get('session');

      if (!urlSessionId) return false;

      const savedStateKey = `canvas-state-${urlSessionId}`;
      const savedStateJson = sessionStorage.getItem(savedStateKey);

      if (savedStateJson) {
        const savedState = JSON.parse(savedStateJson);
        // Check if saved state has image data
        const hasImage = savedState.canvasJSON?.objects?.some((obj: any) =>
          obj.type?.toLowerCase() === 'image'
        );
        console.log('🔍 Initial check - Has saved image:', hasImage);
        return hasImage;
      }
    } catch (error) {
      console.error('❌ Failed to check for saved image:', error);
    }

    return false;
  });
  const [originalImageFile, setOriginalImageFile] = useState<File | null>(null); // Store original file for AI edits
  const [fabric, setFabric] = useState<any>(null);

  // Saved canvas dimensions for consistent refresh behavior (must be declared early)
  // Initialize by reading from sessionStorage BEFORE first render
  const [savedCanvasDimensions, setSavedCanvasDimensions] = useState<{
    displayWidth: number;
    displayHeight: number;
    exportWidth: number;
    exportHeight: number;
    scaleFactor: number;
  } | null>(() => {
    // This initialization function runs synchronously before first render
    if (typeof window === 'undefined') return null;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionId = urlParams.get('session');

      console.log('🔍 Dimension initialization - sessionId from URL:', urlSessionId);

      if (!urlSessionId) {
        console.log('⚠️ No session ID in URL, cannot restore dimensions');
        return null;
      }

      const savedStateKey = `canvas-state-${urlSessionId}`;
      const savedStateJson = sessionStorage.getItem(savedStateKey);

      console.log('🔍 SessionStorage key:', savedStateKey);
      console.log('🔍 Found saved state:', savedStateJson ? 'YES' : 'NO');

      if (savedStateJson) {
        const savedState = JSON.parse(savedStateJson);
        console.log('🔍 Parsed saved state keys:', Object.keys(savedState));
        console.log('🔍 Has canvasDimensions:', !!savedState.canvasDimensions);

        if (savedState.canvasDimensions) {
          console.log('📐 Initializing with saved canvas dimensions:', savedState.canvasDimensions);
          return {
            displayWidth: savedState.canvasDimensions.displayWidth,
            displayHeight: savedState.canvasDimensions.displayHeight,
            exportWidth: savedState.canvasDimensions.exportWidth,
            exportHeight: savedState.canvasDimensions.exportHeight,
            scaleFactor: savedState.canvasDimensions.scaleFactor,
          };
        } else {
          console.log('⚠️ Saved state exists but no canvasDimensions property');
        }
      }
    } catch (error) {
      console.error('❌ Failed to initialize canvas dimensions:', error);
    }

    return null;
  });

  // Dynamic viewport detection with state
  const [viewportHeight, setViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 380);

  // Update viewport dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Call immediately to get correct initial size

    return () => window.removeEventListener('resize', handleResize);
  }, []);


  // STEP 1: Fixed UI element heights (these never change)
  const CONTAINER_MAX_WIDTH = 384; // max-w-sm constraint
  const FIXED_HEADER_HEIGHT = 60; // Header at top (fixed)
  const FIXED_SUBMIT_HEIGHT = 90; // Submit button at bottom (sticky)
  const FIXED_RIGHT_SIDEBAR_WIDTH = 70; // Right sidebar with tools (w-[70px])
  const SAFETY_BUFFER = 20; // Extra buffer to ensure no overlap
  // NOTE: Edit buttons now on RIGHT side, not taking vertical space
  // NOTE: AI counter now in header, not taking vertical space

  // STEP 2: Calculate total space needed for ALL UI elements except canvas
  // Only header and submit button take vertical space now
  const TOTAL_UI_HEIGHT = FIXED_HEADER_HEIGHT + FIXED_SUBMIT_HEIGHT + SAFETY_BUFFER;

  // STEP 3: Calculate space available ONLY for canvas
  // Layout: [Header] [Canvas + Right Sidebar] [Submit Button]
  const SPACE_FOR_CANVAS_ONLY = viewportHeight - TOTAL_UI_HEIGHT;

  // STEP 4: Calculate available width (accounting for container constraints AND right sidebar)
  const AVAILABLE_WIDTH = Math.min(viewportWidth, CONTAINER_MAX_WIDTH);
  // Subtract right sidebar width (70px) + padding (20px) when image is uploaded
  const AVAILABLE_WIDTH_FOR_CANVAS = uploadedImage ? (AVAILABLE_WIDTH - FIXED_RIGHT_SIDEBAR_WIDTH - 20) : (AVAILABLE_WIDTH - 20);

  // STEP 5: Get phone model dimensions (handle dynamic models with no local dimensions)
  const modelWidthMM = phoneModel?.dimensions?.widthMM || DEFAULT_WIDTH_MM;
  const modelHeightMM = phoneModel?.dimensions?.heightMM || DEFAULT_HEIGHT_MM;

  // STEP 6: Calculate scale factors to fit in available canvas space
  const scaleX = AVAILABLE_WIDTH_FOR_CANVAS / modelWidthMM;
  const scaleY = SPACE_FOR_CANVAS_ONLY / modelHeightMM;

  // STEP 7: Use smaller scale to maintain aspect ratio and fit maximally WITHOUT overflow
  // OR use saved dimensions if available (from previous session before refresh)
  const SCALE_FACTOR = savedCanvasDimensions?.scaleFactor ?? Math.min(scaleX, scaleY);

  // STEP 8: Calculate final display dimensions (scaled to fit perfectly)
  // OR use saved dimensions for consistent restore after refresh
  const DISPLAY_WIDTH = savedCanvasDimensions?.displayWidth ?? Math.round(modelWidthMM * SCALE_FACTOR);
  const DISPLAY_HEIGHT = savedCanvasDimensions?.displayHeight ?? Math.round(modelHeightMM * SCALE_FACTOR);

  // Export dimensions (actual size for printing)
  // For dynamic models from Chitu API, phoneModel.dimensions may not exist - use defaults
  const EXPORT_WIDTH = savedCanvasDimensions?.exportWidth ?? (phoneModel?.dimensions?.widthPX || Math.round(DEFAULT_WIDTH_MM * 11.81));
  const EXPORT_HEIGHT = savedCanvasDimensions?.exportHeight ?? (phoneModel?.dimensions?.heightPX || Math.round(DEFAULT_HEIGHT_MM * 11.81));

  // Canvas dimensions - add small padding to ensure borders are fully visible
  const CANVAS_TOTAL_WIDTH = AVAILABLE_WIDTH;
  const CANVAS_TOTAL_HEIGHT = DISPLAY_HEIGHT + 6; // Add 6px for border visibility (2px stroke + padding)
  const CONTROL_PADDING = Math.round((CANVAS_TOTAL_WIDTH - DISPLAY_WIDTH) / 2);
  const VERTICAL_PADDING = 3; // Padding for borders (ensures 2px stroke is fully visible)

  // Restore design from preview if coming back from preview page
  useEffect(() => {
    if (router.query.restore === 'true' && canvas && fabric && !(window as any).__designRestored) {
      const previewData = (window as any).__previewData;
      if (previewData?.canvasState) {
        console.log('🔄 Restoring canvas state from preview...');
        console.log('Canvas state objects:', previewData.canvasState.objects?.length);

        // Set a temporary placeholder to hide upload UI immediately
        setUploadedImage({ temp: true });

        // Small delay to ensure canvas is fully initialized
        setTimeout(() => {
          // Restore the entire canvas state from JSON
          canvas.loadFromJSON(previewData.canvasState, () => {
            console.log('✅ Canvas state restored');

            // Find the uploaded image object (not the border or crosshairs)
            const objects = canvas.getObjects();
            console.log('Restored objects:', objects.length);
            objects.forEach((o: any, i: number) => {
              console.log(`Object ${i}:`, {
                type: o.type,
                excludeFromExport: o.excludeFromExport,
                selectable: o.selectable,
                width: o.width,
                height: o.height
              });
            });

            // Find the main uploaded image - it should be an image type that is selectable
            const mainImage = objects.find((obj: any) =>
              obj.type === 'image' && obj.selectable !== false
            );

            if (mainImage) {
              console.log('Found main image, setting as uploadedImage');
              setUploadedImage(mainImage);
              canvas.setActiveObject(mainImage);
            } else {
              console.warn('No main image found in restored canvas');
              // Fallback: just use the first image object
              const anyImage = objects.find((obj: any) => obj.type === 'image');
              if (anyImage) {
                console.log('Using first image object as fallback');
                setUploadedImage(anyImage);
                canvas.setActiveObject(anyImage);
              }
            }

            canvas.renderAll();

            // Mark as restored to prevent re-running
            (window as any).__designRestored = true;
          });
        }, 100);
      }
    }
  }, [router.query.restore, canvas, fabric]);

  const [machineId, setMachineId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTimestamp, setSessionTimestamp] = useState<number | null>(null);
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const sessionCheckRef = useRef(false); // Prevent double session checks
  const [debugInfo, setDebugInfo] = useState<string>(''); // Debug info for mobile
  const [showWaitingForPayment, setShowWaitingForPayment] = useState(false); // First page - waiting for payment
  const [showThankYou, setShowThankYou] = useState(false); // Second page - payment confirmed
  const [showSessionExpired, setShowSessionExpired] = useState(false); // Session expired (30 min timeout)
  const [thankYouMessage, setThankYouMessage] = useState('Thank you for your design!');
  const [isCheckingSession, setIsCheckingSession] = useState(true); // Loading state
  const [crosshairLines, setCrosshairLines] = useState<{vertical: any, horizontal: any}>({vertical: null, horizontal: null});
  const [isSnapping, setIsSnapping] = useState(false);

  // WebSocket and order tracking
  const [socket, setSocket] = useState<Socket | null>(null);
  const [orderStatus, setOrderStatus] = useState<{
    status?: 'pending' | 'paid' | 'printing' | 'completed' | 'failed';
    payStatus?: 'unpaid' | 'paid' | 'refunded';
    payType?: string;
    amount?: number;
  } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null); // Track print job ID

  // Preview and Payment modal states
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  // Payment modal removed - users pay at physical machine after submission
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // AI Editing states
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiModalTab, setAiModalTab] = useState<'custom' | 'quick'>('custom'); // AI modal tabs (removed text and adjustments)

  // AI Upload Drawer state (for upload screen)
  const [showAIUploadDrawer, setShowAIUploadDrawer] = useState(false);
  const [isAIDrawerClosing, setIsAIDrawerClosing] = useState(false);

  // Stickers modal states
  const [showStickersModal, setShowStickersModal] = useState(false);
  const [stickersModalTab, setStickersModalTab] = useState<'text' | 'stickers' | 'filters'>('stickers'); // Stickers modal tabs

  // Text customization states
  const [textInput, setTextInput] = useState('');
  const [textTemplate, setTextTemplate] = useState<'quote' | 'title' | 'signature' | 'date' | null>(null);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(32);
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textUnderline, setTextUnderline] = useState(false);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [textColor, setTextColor] = useState('#000000');
  const [initialTextColor, setInitialTextColor] = useState('#000000');
  const [customTextColor, setCustomTextColor] = useState<string | null>(null);
  const [stickerSearch, setStickerSearch] = useState('');

  // Filter states
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [blur, setBlur] = useState(0);
  const [sharpness, setSharpness] = useState(0);
  const [warmth, setWarmth] = useState(0);
  const [isBlackAndWhite, setIsBlackAndWhite] = useState(false);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState('transparent');
  const [filtersTouched, setFiltersTouched] = useState(false);
  // Store initial state when modal opens for reverting
  const [initialBWState, setInitialBWState] = useState(false);
  const [initialBgColor, setInitialBgColor] = useState('transparent');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMaskModal, setShowMaskModal] = useState(false);  // New modal for mask editing
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [createPrompt, setCreatePrompt] = useState('');
  const [maskPrompt, setMaskPrompt] = useState('');  // Separate prompt for mask editing
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMaskDrawing, setIsMaskDrawing] = useState(false);  // New state for mask drawing mode
  const [currentMask, setCurrentMask] = useState<string | null>(null);  // Current mask being drawn
  const [aiError, setAiError] = useState<string | null>(null);
  const [editHistory, setEditHistory] = useState<string[]>([]);
  const [cropHistory, setCropHistory] = useState<string[]>([]);

  // AI Edit Counter - persisted to sessionStorage
  const [aiEditCount, setAiEditCount] = useState<number>(() => {
    // Initialize from sessionStorage on mount
    if (typeof window === 'undefined') return 0;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionId = urlParams.get('session');

      if (!urlSessionId) return 0;

      const savedCount = sessionStorage.getItem(`ai-edit-count-${urlSessionId}`);
      const count = savedCount ? parseInt(savedCount, 10) : 0;
      console.log(`📊 AI Edit Counter initialized: ${count}/3 for session ${urlSessionId}`);
      return count;
    } catch (error) {
      console.error('Failed to load AI edit count:', error);
      return 0;
    }
  });
  const MAX_AI_EDITS = 3;

  const [drawingMode, setDrawingMode] = useState<boolean>(false);

  // Comprehensive undo/redo system - stores full canvas state
  const [canvasHistory, setCanvasHistory] = useState<string[]>([]);
  const [canvasRedoStack, setCanvasRedoStack] = useState<string[]>([]); // Redo stack for going forward
  const isRestoringState = useRef(false); // Prevent saving during restore (using ref to avoid triggering re-renders)
  const isDeletingImage = useRef(false); // Prevent saving during delete operations
  const lastSavedStateRef = useRef<string | null>(null); // Track last saved state synchronously (fixes React batching duplicate saves)

  // Hide editing buttons during object manipulation for more freedom
  const [hideEditButtons, setHideEditButtons] = useState(false);

  const [drawnMask, setDrawnMask] = useState<string | null>(null);
  const [isManipulating, setIsManipulating] = useState<boolean>(false);
  const [isCropMode, setIsCropMode] = useState<boolean>(false);
  const [cropRect, setCropRect] = useState<{left: number, top: number, width: number, height: number} | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const snapStateRef = useRef<{x: boolean, y: boolean}>({x: false, y: false});
  const hasSnappedRef = useRef<{x: boolean, y: boolean, rotation: boolean, borderLeft: boolean, borderRight: boolean, borderTop: boolean, borderBottom: boolean}>({x: false, y: false, rotation: false, borderLeft: false, borderRight: false, borderTop: false, borderBottom: false});
  const dragStartBounds = useRef<{left: number, top: number, right: number, bottom: number, width: number, height: number} | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropperDimensions, setCropperDimensions] = useState({ width: 280, height: 400 });
  const cropperRef = useRef<any>(null);
  const cropperImageRef = useRef<HTMLImageElement | null>(null);
  const cropperElementRef = useRef<HTMLImageElement | null>(null);
  const mouseCanvasPos = useRef<{x: number, y: number}>({x: 0, y: 0});
  const lockMousePos = useRef<{x: number, y: number}>({x: 0, y: 0});
  const lockedObjectPos = useRef<{x: number, y: number}>({x: 0, y: 0});
  const borderLockMousePos = useRef<{x: number, y: number}>({x: 0, y: 0});
  const borderLockedPos = useRef<{x: number, y: number}>({x: 0, y: 0});
  const lockMouseAngle = useRef<number>(0);
  const lockedRotation = useRef<number>(0);
  const isRotating = useRef<boolean>(false);
  const isScaling = useRef<boolean>(false);
  const scalingBorderLock = useRef<{left: boolean, right: boolean, top: boolean, bottom: boolean}>({left: false, right: false, top: false, bottom: false});
  const scalingLockMousePos = useRef<{x: number, y: number}>({x: 0, y: 0});

  useEffect(() => {
    // Dynamically import fabric to avoid SSR issues
    import('fabric').then((fabricModule) => {
      setFabric(fabricModule);
    });
  }, []);

  // Clean up old session storage entries on mount (time-based TTL)
  useEffect(() => {
    const cleanupSessionStorage = () => {
      const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
      const now = Date.now();

      console.log('🧹 Running session storage cleanup (TTL: 30 minutes)...');

      // Get current session from URL to preserve it
      const urlParams = new URLSearchParams(window.location.search);
      const currentSession = urlParams.get('session');
      const currentTabSession = sessionStorage.getItem('current-tab-session');

      // Find all canvas-state entries and check their age
      const sessionsToClean: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('canvas-state-')) {
          const sessionId = key.replace('canvas-state-', '');

          // Don't clean current session
          if (sessionId === currentSession || sessionId === currentTabSession) {
            continue;
          }

          try {
            const data = JSON.parse(sessionStorage.getItem(key) || '{}');
            const savedAt = data.savedAt || 0;

            if (now - savedAt > SESSION_TTL_MS) {
              sessionsToClean.push(sessionId);
            }
          } catch (e) {
            // If we can't parse it, mark for cleanup
            sessionsToClean.push(sessionId);
          }
        }
      }

      // Clean up old sessions and their associated data
      let cleanedCount = 0;
      sessionsToClean.forEach(sessionId => {
        sessionStorage.removeItem(`canvas-state-${sessionId}`);
        sessionStorage.removeItem(`canvas-history-${sessionId}`);
        sessionStorage.removeItem(`ai-edit-count-${sessionId}`);
        sessionStorage.removeItem(`session-locked-${sessionId}`);
        sessionStorage.removeItem(`session-lock-timestamp-${sessionId}`);
        sessionStorage.removeItem(`page-state-${sessionId}`);
        sessionStorage.removeItem(`preview-image-${sessionId}`);
        sessionStorage.removeItem(`submission-data-${sessionId}`);
        cleanedCount++;
      });

      if (cleanedCount > 0) {
        console.log(`✅ Cleaned up ${cleanedCount} old session(s) (older than 30 minutes)`);
      }
    };

    cleanupSessionStorage();
  }, []); // Run once on mount

  useEffect(() => {
    // Extract URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const machine = urlParams.get('machineId');
    const session = urlParams.get('session');
    const modelParam = urlParams.get('model');
    const resetParam = urlParams.get('reset');

    // Dev reset - reload without reset param
    if (resetParam === 'true') {
      console.log('🔄 Resetting session (dev mode)');
      urlParams.delete('reset');
      const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
      window.location.replace(newUrl);
      return;
    }

    console.log('🔍 URL params:', { machine, session, model: modelParam });

    // ===== SESSION VALIDATION =====
    // Valid session formats:
    // - UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // - Timestamp format: 1234567890123-abc123def
    // - Demo format: demo_1234567890123_abc123
    const isValidSession = (s: string) => {
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
      const isValidTimestamp = /^\d{13}-[a-z0-9]{9,}$/i.test(s);
      const isValidDemo = /^demo_\d+_[a-z0-9]+$/i.test(s);
      return isValidUUID || isValidTimestamp || isValidDemo;
    };

    // If session in URL is invalid, redirect without it
    if (session && !isValidSession(session)) {
      console.warn('⚠️ Invalid session format, generating new session...');
      if (machine && modelParam) {
        router.replace(`/editor?machineId=${machine}&model=${modelParam}`);
      } else if (modelParam) {
        router.replace(`/editor?model=${modelParam}`);
      } else {
        router.replace('/select-model');
      }
      return;
    }

    // ===== CHECK FOR LOCKED SESSIONS =====
    if (session) {
      const isLocked = sessionStorage.getItem(`session-locked-${session}`) === 'true';
      const lockTimestamp = sessionStorage.getItem(`session-lock-timestamp-${session}`);
      const SESSION_LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
      const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes - session expiry

      // Check if session itself expired (regardless of lock status)
      const sessionCreated = sessionStorage.getItem(`session-created-${session}`);
      if (sessionCreated) {
        const sessionAge = Date.now() - parseInt(sessionCreated);
        if (sessionAge > SESSION_MAX_AGE_MS) {
          console.log('⏰ Session expired (30 min limit) while locked, showing expired screen');
          // Clear ALL session data
          sessionStorage.removeItem('current-tab-session');
          sessionStorage.removeItem(`session-created-${session}`);
          sessionStorage.removeItem(`session-model-${session}`);
          sessionStorage.removeItem(`session-locked-${session}`);
          sessionStorage.removeItem(`session-lock-timestamp-${session}`);
          sessionStorage.removeItem(`page-state-${session}`);
          sessionStorage.removeItem(`canvas-state-${session}`);
          sessionStorage.removeItem(`canvas-history-${session}`);
          sessionStorage.removeItem(`ai-edit-count-${session}`);
          // Show session expired screen
          setShowSessionExpired(true);
          setIsCheckingSession(false);
          return;
        }
      }

      // Check if lock expired
      if (isLocked && lockTimestamp) {
        const elapsed = Date.now() - parseInt(lockTimestamp);
        if (elapsed > SESSION_LOCK_TIMEOUT_MS) {
          console.warn('⏰ Session lock expired, clearing...');
          sessionStorage.removeItem(`session-locked-${session}`);
          sessionStorage.removeItem(`session-lock-timestamp-${session}`);
          sessionStorage.removeItem(`page-state-${session}`);
        }
      }

      // Restore locked session state (only if session not expired - checked above)
      if (isLocked && lockTimestamp && (Date.now() - parseInt(lockTimestamp)) <= SESSION_LOCK_TIMEOUT_MS) {
        console.log('🔒 Session is locked - restoring page state');
        setIsSessionLocked(true);
        setMachineId(machine || null);
        setSessionId(session);

        const pageState = sessionStorage.getItem(`page-state-${session}`);
        if (pageState === 'preview') {
          const previewImageData = sessionStorage.getItem(`preview-image-${session}`);
          const submissionDataStr = sessionStorage.getItem(`submission-data-${session}`);
          if (previewImageData && submissionDataStr) {
            setPreviewImage(previewImageData);
            (window as any).__submissionData = JSON.parse(submissionDataStr);
            setShowPreviewModal(true);
          }
        } else if (pageState === 'waiting') {
          setShowWaitingForPayment(true);
        } else if (pageState === 'thankyou') {
          setShowThankYou(true);
        }

        setIsCheckingSession(false);
        return;
      }
    }

    // ===== SESSION HANDLING =====
    // Sessions are created on select-model page when user scans QR code
    // Editor expects session to be in URL - if not, redirect to select-model

    // Session expiry constant - 30 minutes
    const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

    if (modelParam) {
      // We have a model, check for session

      if (session) {
        // Session in URL - validate it

        // Check if expired
        const sessionCreated = sessionStorage.getItem(`session-created-${session}`);
        if (sessionCreated) {
          const age = Date.now() - parseInt(sessionCreated);
          if (age > SESSION_MAX_AGE_MS) {
            console.log('⏰ Session expired (30 min limit), showing expired screen');
            // Clear expired session data
            sessionStorage.removeItem('current-tab-session');
            sessionStorage.removeItem(`session-created-${session}`);
            sessionStorage.removeItem(`session-model-${session}`);
            sessionStorage.removeItem(`session-locked-${session}`);
            sessionStorage.removeItem(`canvas-state-${session}`);
            sessionStorage.removeItem(`canvas-history-${session}`);
            sessionStorage.removeItem(`ai-edit-count-${session}`);
            // Show session expired screen
            setShowSessionExpired(true);
            setIsCheckingSession(false);
            return;
          }
        }

        // Check if locked (already submitted) - redirect to get new session
        const isLocked = sessionStorage.getItem(`session-locked-${session}`) === 'true';
        if (isLocked) {
          console.log('🔒 Session is locked (already submitted), redirecting to select-model');
          // Clear locked session
          sessionStorage.removeItem('current-tab-session');
          sessionStorage.removeItem(`session-created-${session}`);
          sessionStorage.removeItem(`session-model-${session}`);
          sessionStorage.removeItem(`session-locked-${session}`);
          sessionStorage.removeItem(`session-lock-timestamp-${session}`);
          sessionStorage.removeItem(`page-state-${session}`);
          sessionStorage.removeItem(`canvas-state-${session}`);
          sessionStorage.removeItem(`canvas-history-${session}`);
          sessionStorage.removeItem(`ai-edit-count-${session}`);
          // Redirect to get new session
          if (machine) {
            router.push(`/select-model?machineId=${machine}`);
          } else {
            router.push('/select-model');
          }
          return;
        }

        // Session is valid - use it
        console.log('✅ Using session from URL:', session);

        // Store as current tab session
        sessionStorage.setItem('current-tab-session', session);

        // Set creation timestamp if not exists (backwards compatibility)
        if (!sessionCreated) {
          sessionStorage.setItem(`session-created-${session}`, Date.now().toString());
        }

        // Check if model changed - clear canvas data if so
        const savedModel = sessionStorage.getItem(`session-model-${session}`);
        if (savedModel && savedModel !== modelParam) {
          console.log('📱 Model changed from', savedModel, 'to', modelParam, '- clearing canvas (keeping AI count)');
          sessionStorage.removeItem(`canvas-state-${session}`);
          sessionStorage.removeItem(`canvas-history-${session}`);
        }
        // Store current model
        sessionStorage.setItem(`session-model-${session}`, modelParam);

        setMachineId(machine || null);
        setSessionId(session);
        setIsCheckingSession(false);
        return;
      }

      // No session in URL - redirect to select-model to get one
      // This is the new flow: sessions are ALWAYS created on select-model page
      console.log('⚠️ No session in URL, redirecting to select-model');
      if (machine) {
        router.push(`/select-model?machineId=${machine}`);
      } else {
        router.push('/select-model');
      }
      return;
    }

    // No model parameter - redirect to model selection
    if (machine) {
      console.log('🔄 No model - redirecting to model selection');
      router.push(`/select-model?machineId=${machine}`);
    } else {
      console.log('🔄 No model or machine - redirecting to demo model selection');
      router.push('/select-model');
    }
  }, []); // Run once on mount

  // Session expiry check - runs every minute to check if session has expired (30 min limit)
  useEffect(() => {
    if (!sessionId) return;

    const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
    const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

    const checkExpiry = () => {
      const sessionCreated = sessionStorage.getItem(`session-created-${sessionId}`);
      if (sessionCreated) {
        const age = Date.now() - parseInt(sessionCreated);
        if (age > SESSION_MAX_AGE_MS) {
          console.log('⏰ Session expired while on page (30 min limit)');

          // Clear session data
          sessionStorage.removeItem('current-tab-session');
          sessionStorage.removeItem(`session-created-${sessionId}`);
          sessionStorage.removeItem(`session-model-${sessionId}`);
          sessionStorage.removeItem(`session-locked-${sessionId}`);
          sessionStorage.removeItem(`canvas-state-${sessionId}`);
          sessionStorage.removeItem(`canvas-history-${sessionId}`);
          sessionStorage.removeItem(`ai-edit-count-${sessionId}`);

          // Show session expired screen (not alert)
          setShowSessionExpired(true);
          setShowWaitingForPayment(false);
          setShowThankYou(false);
        }
      }
    };

    // Check immediately and then every minute
    checkExpiry();
    const intervalId = setInterval(checkExpiry, CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [sessionId, router]);

  // Thank you page behavior:
  // - User stays on thank you page permanently until order is complete
  // - Real-time status updates show: Paid → Printing → Completed (Ready for pickup)
  // - NO auto-redirect - user must scan QR code again for new session
  // - New customers at machine get independent sessions via QR code scan
  useEffect(() => {
    if (!showThankYou) return;

    console.log('📋 Thank you page displayed - user will stay here until order is complete');
    console.log('📋 To start a new session, user must scan QR code again');

    // No auto-redirect - user stays on this page
    // Status updates come via WebSocket (order:status events)
  }, [showThankYou]);

  // TEST MODE: Check for test parameter when on waiting page
  useEffect(() => {
    if (!showWaitingForPayment) {
      console.log('⏭️ Test mode check skipped - not on waiting page');
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const testParam = urlParams.get('test');

    console.log('🔍 Test mode check - test param:', testParam);

    if (testParam === 'payment') {
      console.log('🧪 TEST MODE: Simulating payment confirmation');

      // Remove test param from URL
      urlParams.delete('test');
      const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
      window.history.replaceState(null, '', newUrl);

      // Trigger page transition after a small delay to ensure state is ready
      setTimeout(() => {
        console.log('✅ TEST MODE: Transitioning to thank you page');
        setShowWaitingForPayment(false);
        setShowThankYou(true);
        setThankYouMessage('Payment received! (Test Mode)');

        // Update page state in sessionStorage
        if (sessionId) {
          sessionStorage.setItem(`page-state-${sessionId}`, 'thankyou');
          console.log('💾 Updated page state to thank you in sessionStorage (test mode)');
        }
      }, 100);
    }
  }, [showWaitingForPayment, sessionId, router.query.test]);

  // WebSocket connection for real-time order status updates
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Use dynamic backend URL based on current origin (works on any network/IP)
    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || window.location.origin.replace(':3000', ':3001');

    console.log('🔌 Connecting to WebSocket:', BACKEND_URL);

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected:', newSocket.id);

      // Subscribe to order updates if we have a jobId
      if (jobId) {
        console.log('📡 Subscribing to order updates:', jobId);
        newSocket.emit('subscribe:order', jobId);
      }

      // Subscribe to machine updates if we have a machineId
      if (machineId) {
        console.log('📡 Subscribing to machine updates:', machineId);
        newSocket.emit('subscribe:machine', machineId);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('💔 WebSocket disconnected');
    });

    // Listen for order status updates
    newSocket.on('order:status', (data: any) => {
      console.log('📦 Order status update:', data);

      // CRITICAL: Verify this update is for OUR order (prevent multi-user conflicts)
      // Check both orderNo and jobId fields since backend now includes our jobId mapping
      const isOurOrder = data.orderNo === jobId || data.jobId === jobId;
      if (!isOurOrder) {
        console.log(`⚠️ Ignoring update for different order: orderNo=${data.orderNo}, jobId=${data.jobId} (ours: ${jobId})`);
        return;
      }

      console.log('✅ Order status matches our jobId:', jobId);

      setOrderStatus({
        status: data.status,
        payStatus: data.payStatus,
        payType: data.payType,
        amount: data.amount,
      });

      // Transition from waiting page to thank you page when payment is confirmed
      if (data.payStatus === 'paid') {
        console.log('💳 Payment confirmed! Transitioning to thank you page...');
        setShowWaitingForPayment(false);
        setShowThankYou(true);
        setThankYouMessage('Payment received! Your case is being prepared for printing.');

        // Update page state in sessionStorage
        if (sessionId) {
          sessionStorage.setItem(`page-state-${sessionId}`, 'thankyou');
          console.log('💾 Updated page state to thank you in sessionStorage');
        }

        // DEMO MODE: Auto-end session after 5 seconds (simulates print completion)
        // In production, the actual printer sends 'completed' status
        if (isDemoMode) {
          console.log('🎮 Demo mode: Session will end in 5 seconds...');
          setTimeout(() => {
            console.log('🎮 Demo mode: Ending session now');
            // Clear all session data
            sessionStorage.removeItem('current-tab-session');
            if (sessionId) {
              sessionStorage.removeItem(`session-created-${sessionId}`);
              sessionStorage.removeItem(`session-model-${sessionId}`);
              sessionStorage.removeItem(`session-locked-${sessionId}`);
              sessionStorage.removeItem(`session-lock-timestamp-${sessionId}`);
              sessionStorage.removeItem(`page-state-${sessionId}`);
              sessionStorage.removeItem(`canvas-state-${sessionId}`);
              sessionStorage.removeItem(`canvas-history-${sessionId}`);
              sessionStorage.removeItem(`ai-edit-count-${sessionId}`);
            }
            // Show session expired screen
            setShowThankYou(false);
            setShowSessionExpired(true);
          }, 5000);
        }
      }

      // Update messages for different statuses
      if (data.status === 'printing') {
        setThankYouMessage('Your case is now printing!');
      } else if (data.status === 'completed') {
        setThankYouMessage('Your case is ready! Please collect it from the machine.');

        // END SESSION: Clear current-tab-session so next visit gets a fresh session
        console.log('✅ Print completed - ending session');
        sessionStorage.removeItem('current-tab-session');

        // Also clear session data after a delay (let user see the completion message)
        setTimeout(() => {
          if (sessionId) {
            console.log('🧹 Cleaning up completed session data:', sessionId);
            sessionStorage.removeItem(`session-locked-${sessionId}`);
            sessionStorage.removeItem(`session-lock-timestamp-${sessionId}`);
            sessionStorage.removeItem(`page-state-${sessionId}`);
            sessionStorage.removeItem(`canvas-state-${sessionId}`);
            sessionStorage.removeItem(`canvas-history-${sessionId}`);
            sessionStorage.removeItem(`ai-edit-count-${sessionId}`);
            sessionStorage.removeItem(`session-model-${sessionId}`);
          }
        }, 5000); // Clean up after 5 seconds
      } else if (data.status === 'failed') {
        setThankYouMessage('There was an issue with your order. Please contact support.');
      }
    });

    newSocket.on('error', (error: any) => {
      console.error('❌ WebSocket error:', error);
    });

    setSocket(newSocket);

    return () => {
      console.log('🔌 Closing WebSocket connection');
      newSocket.close();
    };
  }, [jobId, machineId]); // Reconnect if jobId or machineId changes

  // Define control sets at component level to avoid scope issues
  const normalControls = useRef<any>(null);
  const cropControls = useRef<any>(null);

  // Save current canvas state to history
  const saveCanvasState = useCallback((imageOverride?: fabric.Image, skipHistorySave?: boolean) => {
    // Use imageOverride if provided (for AI generation), otherwise use uploadedImage state
    const imageToSave = imageOverride || uploadedImage;

    console.log('📞 saveCanvasState called', {
      hasCanvas: !!canvas,
      isRestoring: isRestoringState.current,
      isDeleting: isDeletingImage.current,
      hasImage: !!imageToSave,
      isOverride: !!imageOverride,
      skipHistorySave: !!skipHistorySave
    });

    if (!canvas || isRestoringState.current || isDeletingImage.current || !imageToSave) {
      if (isRestoringState.current) {
        console.log('🚫 State save blocked - restoration in progress');
      }
      if (isDeletingImage.current) {
        console.log('🚫 State save blocked - deletion in progress');
      }
      if (!canvas) {
        console.log('🚫 State save blocked - no canvas');
      }
      if (!imageToSave) {
        console.log('🚫 State save blocked - no uploaded image');
      }
      return; // Don't save during undo/restore/delete
    }

    try {
      // Save only transformation data to history (NOT image source - too large!)
      // Image source is stored in sessionStorage for page refresh persistence only
      const mainImageState = {
        left: imageToSave.left,
        top: imageToSave.top,
        scaleX: imageToSave.scaleX,
        scaleY: imageToSave.scaleY,
        angle: imageToSave.angle,
        flipX: imageToSave.flipX,
        flipY: imageToSave.flipY,
        opacity: imageToSave.opacity,
        originX: imageToSave.originX,
        originY: imageToSave.originY,
        filters: imageToSave.filters ? [...imageToSave.filters] : [],
        backgroundColor: canvasBackgroundColor // Store background color for undo
      };

      const stateString = JSON.stringify(mainImageState);

      // CRITICAL: Save canvas state to sessionStorage for refresh persistence
      // On mobile, we NEVER store base64 images - they're too large (1-3MB each)
      if (sessionId) {
        try {
          // Detect mobile FIRST - before creating the large JSON
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

          // On mobile: exclude 'src' entirely to prevent huge strings
          // On desktop: include 'src' for full refresh persistence
          const propsToInclude = isMobile
            ? ['selectable', 'hasControls', 'excludeFromExport', 'hasBorders', 'borderColor', 'filters', 'crossOrigin']
            : ['selectable', 'hasControls', 'excludeFromExport', 'hasBorders', 'borderColor', 'src', 'filters', 'crossOrigin'];

          const canvasStateToStore = canvas.toJSON(propsToInclude);

          // Get existing saved state to preserve dimensions if they already exist
          const existingSavedState = sessionStorage.getItem(`canvas-state-${sessionId}`);
          let existingDimensions = null;
          if (existingSavedState) {
            try {
              const parsed = JSON.parse(existingSavedState);
              existingDimensions = parsed.canvasDimensions;
            } catch (e) {
              // Ignore parse errors
            }
          }

          const stateToSave = JSON.stringify({
            canvasJSON: canvasStateToStore,
            mainImageState: mainImageState,
            backgroundColor: canvasBackgroundColor,
            savedAt: Date.now(),
            isMobile: isMobile, // Flag to know we're on mobile (no image persistence)
            // Preserve existing dimensions, or save new ones if this is the first save
            canvasDimensions: existingDimensions || {
              displayWidth: DISPLAY_WIDTH,
              displayHeight: DISPLAY_HEIGHT,
              exportWidth: EXPORT_WIDTH,
              exportHeight: EXPORT_HEIGHT,
              scaleFactor: SCALE_FACTOR,
              viewportWidth: viewportWidth,
              viewportHeight: viewportHeight
            }
          });

          sessionStorage.setItem(`canvas-state-${sessionId}`, stateToSave);
          console.log('💾 Canvas state persisted to sessionStorage' + (existingDimensions ? ' (dimensions preserved)' : ' (dimensions saved)'));
        } catch (err) {
          // Handle QuotaExceededError by cleaning up old sessions
          if (err instanceof DOMException && err.name === 'QuotaExceededError') {
            console.warn('⚠️ SessionStorage quota exceeded, cleaning up old sessions...');

            // Get all canvas-state keys and sort by timestamp
            const canvasStateKeys: Array<{ key: string; timestamp: number }> = [];
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && key.startsWith('canvas-state-') && key !== `canvas-state-${sessionId}`) {
                try {
                  const data = sessionStorage.getItem(key);
                  if (data) {
                    const parsed = JSON.parse(data);
                    canvasStateKeys.push({ key, timestamp: parsed.savedAt || 0 });
                  }
                } catch (e) {
                  // If we can't parse it, mark it for removal (timestamp 0)
                  canvasStateKeys.push({ key, timestamp: 0 });
                }
              }
            }

            // Sort by timestamp (oldest first) and remove old sessions
            canvasStateKeys.sort((a, b) => a.timestamp - b.timestamp);

            let removedCount = 0;
            for (const item of canvasStateKeys) {
              sessionStorage.removeItem(item.key);
              removedCount++;
              console.log('🗑️ Removed old canvas state:', item.key);

              // Stop after removing a few - try to save again
              if (removedCount >= 3) break;
            }

            console.log(`✅ Cleaned up ${removedCount} old session(s)`);

            // Try saving again after cleanup - exclude 'src' entirely on retry
            try {
              // Never include 'src' on retry - that's what caused the quota issue
              const canvasStateToStore = canvas.toJSON([
                'selectable',
                'hasControls',
                'excludeFromExport',
                'hasBorders',
                'borderColor',
                'filters',
                'crossOrigin'
              ]);

              const stateToSave = JSON.stringify({
                canvasJSON: canvasStateToStore,
                mainImageState: mainImageState,
                backgroundColor: canvasBackgroundColor,
                savedAt: Date.now(),
                isMobile: true, // Treated as mobile after quota error
                canvasDimensions: {
                  displayWidth: DISPLAY_WIDTH,
                  displayHeight: DISPLAY_HEIGHT,
                  exportWidth: EXPORT_WIDTH,
                  exportHeight: EXPORT_HEIGHT,
                  scaleFactor: SCALE_FACTOR,
                  viewportWidth: viewportWidth,
                  viewportHeight: viewportHeight
                }
              });

              sessionStorage.setItem(`canvas-state-${sessionId}`, stateToSave);
              console.log('✅ Canvas state saved after cleanup (no images)');
            } catch (retryErr) {
              console.error('❌ Failed to save even after cleanup. Continuing without persistence.');
              // Continue without saving - app still functions, just won't persist on refresh
            }
          } else {
            console.error('❌ Failed to save canvas to sessionStorage:', err);
          }
        }
      }

      // Skip history save if requested (e.g., after AI edit where we already saved with src)
      if (!skipHistorySave) {
        // Check for duplicate or near-duplicate states using tolerance-based comparison
        // This prevents saving states with minor floating-point differences from object:modified
        const isDuplicateState = (() => {
          // First check exact string match (fast path)
          if (lastSavedStateRef.current === stateString) {
            console.log('⏭️ Skipping duplicate state save (exact match)');
            return true;
          }

          // Check if last saved state has similar transforms (within tolerance)
          if (lastSavedStateRef.current) {
            try {
              const lastSaved = JSON.parse(lastSavedStateRef.current);
              const tolerance = 0.01; // Allow 1% difference in transform values

              const isSimilar = (a: number | undefined, b: number | undefined) => {
                if (a === undefined && b === undefined) return true;
                if (a === undefined || b === undefined) return false;
                return Math.abs(a - b) < tolerance;
              };

              // Check if transforms are essentially the same
              if (
                isSimilar(mainImageState.left, lastSaved.left) &&
                isSimilar(mainImageState.top, lastSaved.top) &&
                isSimilar(mainImageState.scaleX, lastSaved.scaleX) &&
                isSimilar(mainImageState.scaleY, lastSaved.scaleY) &&
                isSimilar(mainImageState.angle, lastSaved.angle) &&
                mainImageState.flipX === lastSaved.flipX &&
                mainImageState.flipY === lastSaved.flipY
              ) {
                console.log('⏭️ Skipping near-duplicate state save (tolerance check)');
                return true;
              }
            } catch (e) {
              // Failed to parse last saved state, continue with save
            }
          }

          return false;
        })();

        if (!isDuplicateState) {
          // Update ref synchronously BEFORE React state update
          lastSavedStateRef.current = stateString;

          // Clear redo stack when new action is performed (standard undo/redo behavior)
          setCanvasRedoStack([]);

          setCanvasHistory(prev => {
            // Limit history to last 20 states to prevent memory issues
            const newHistory = [...prev, stateString];
            const limited = newHistory.slice(-20);
            console.log('💾 Canvas state saved, history length:', limited.length);
            return limited;
          });
        }
      } else {
        console.log('⏭️ Skipping history save (skipHistorySave=true)');
      }
    } catch (error) {
      console.error('Failed to save canvas state:', error);
    }
  }, [canvas, uploadedImage, canvasBackgroundColor]); // isRestoringState is now a ref, doesn't need to be in dependencies

  // Helper function to increment AI edit counter and persist to sessionStorage
  const incrementAIEditCount = useCallback(() => {
    if (!sessionId) {
      console.warn('⚠️ No session ID - cannot increment AI edit count');
      return false;
    }

    const newCount = aiEditCount + 1;

    if (newCount > MAX_AI_EDITS) {
      console.warn(`⚠️ AI edit limit reached: ${aiEditCount}/${MAX_AI_EDITS}`);
      return false;
    }

    console.log(`📊 Incrementing AI edit count: ${aiEditCount} → ${newCount}/${MAX_AI_EDITS}`);

    // Update state
    setAiEditCount(newCount);

    // Persist to sessionStorage
    try {
      sessionStorage.setItem(`ai-edit-count-${sessionId}`, newCount.toString());
      console.log(`💾 AI edit count saved to sessionStorage for session ${sessionId}`);
    } catch (error) {
      console.error('Failed to save AI edit count to sessionStorage:', error);
    }

    return true;
  }, [sessionId, aiEditCount]);

  // Helper function to check if AI edits are available
  const canUseAIEdit = useCallback((): boolean => {
    return aiEditCount < MAX_AI_EDITS;
  }, [aiEditCount]);

  // Persist canvas history to sessionStorage for undo/redo across refresh
  useEffect(() => {
    if (!sessionId || canvasHistory.length === 0 || isRestoringState.current) {
      return;
    }

    try {
      // Only save if we have actual history (not just the initial empty state)
      sessionStorage.setItem(`canvas-history-${sessionId}`, JSON.stringify(canvasHistory));
      console.log(`💾 Canvas history saved (${canvasHistory.length} states)`);
    } catch (error) {
      console.error('Failed to save canvas history to sessionStorage:', error);
    }
  }, [sessionId, canvasHistory]);

  useEffect(() => {
    // Only initialize canvas when all conditions are met
    if (!canvasRef.current || !fabric || isCheckingSession || isSessionLocked || showWaitingForPayment || showThankYou || canvas) {
      console.log('🛑 Canvas initialization blocked:', {
        hasCanvasRef: !!canvasRef.current,
        hasFabric: !!fabric,
        isCheckingSession,
        isSessionLocked,
        showWaitingForPayment,
        showThankYou,
        hasCanvas: !!canvas
      });
      return;
    }

    console.log('✅ All conditions met - initializing canvas');

    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
        width: CANVAS_TOTAL_WIDTH,   // Full width with padding
        height: CANVAS_TOTAL_HEIGHT,  // Full height with padding
        backgroundColor: '#f3f4f6', // Light gray background to match design
        containerClass: 'canvas-container',
        selection: false,  // Disable background drag-to-select box
        allowTouchScrolling: true,  // Allow browser to handle touch scrolling
        preserveObjectStacking: true,
        stopContextMenu: true,  // Prevent context menu on right-click
        fireRightClick: false,  // Disable right-click events
        fireMiddleClick: false,  // Disable middle-click events
        moveCursor: 'default',  // Change cursor for move actions
        hoverCursor: 'default',  // Change cursor for hover
        // Additional comprehensive touch and selection prevention
        selectionColor: 'transparent',  // Make selection box invisible
        selectionBorderColor: 'transparent',  // Make selection border invisible
        selectionLineWidth: 0,  // Remove selection line width
        selectionDashArray: [],  // Remove selection dash pattern
        skipTargetFind: false,  // Keep object targeting for manipulation
        perPixelTargetFind: false,  // Disable pixel-perfect targeting for performance
        targetFindTolerance: 4,  // Small tolerance for easier touch targeting
        enableRetinaScaling: true,  // Enable retina scaling for better quality
        imageSmoothingEnabled: true,  // Enable image smoothing for better quality
        imageSmoothingQuality: 'high',  // Use high quality image smoothing
        renderOnAddRemove: true,  // Control rendering behavior
        skipOffscreen: true,  // Skip offscreen rendering
        stateful: false  // Disable state tracking for better performance
      });
      
      // Add a background rectangle inside the display area (will not be clipped)
      const canvasBackground = new fabric.Rect({
        left: CONTROL_PADDING,
        top: VERTICAL_PADDING,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        fill: 'transparent',
        selectable: false,
        evented: false,
        excludeFromExport: true
      });

      fabricCanvas.add(canvasBackground);

      // Set up clipping to hide image parts outside canvas area
      fabricCanvas.clipPath = new fabric.Rect({
        left: CONTROL_PADDING,
        top: VERTICAL_PADDING,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        absolutePositioned: true
      });

      // Smart selection prevention - only disable background selection, allow object selection
      fabricCanvas.on('mouse:down', function(e: any) {
        if (!e.target) {
          // Clicking on empty background - disable selection temporarily
          fabricCanvas.selection = false;
        } else if (e.target.selectable !== false) {
          // Clicking on a selectable object - allow selection
          fabricCanvas.selection = true;
        }
      });

      fabricCanvas.on('mouse:up', function(e: any) {
        // After mouse up, if no object is selected, keep background selection disabled
        if (!e.target) {
          fabricCanvas.selection = false;
        }
      });

      // Prevent selection box only when dragging from empty areas
      fabricCanvas.on('mouse:down:before', function(e: any) {
        if (!e.target) {
          // Only prevent default for empty area drags on touch devices
          if (e.e.type && e.e.type.includes('touch')) {
            fabricCanvas.selection = false;
          }
        }
      });

      // Final DOM-level touch behavior enforcement - allow pointer events for canvas interaction
      const canvasElement = fabricCanvas.getElement();
      const canvasContainer = canvasElement.parentElement;
      
      if (canvasElement) {
        canvasElement.style.touchAction = 'none'; // Changed to 'none' to allow Fabric.js to handle all touch events
        canvasElement.style.userSelect = 'none';
        canvasElement.style.webkitUserSelect = 'none';
        canvasElement.style.webkitTouchCallout = 'none';
        canvasElement.style.webkitTapHighlightColor = 'transparent';
      }
      
      if (canvasContainer) {
        canvasContainer.style.touchAction = 'none'; // Changed to 'none' to allow Fabric.js full control
        canvasContainer.style.userSelect = 'none';
        canvasContainer.style.webkitUserSelect = 'none';
        canvasContainer.style.webkitTouchCallout = 'none';
      }

      // Configure custom control settings to match the reference design
      fabric.Object.prototype.transparentCorners = false;
      fabric.Object.prototype.cornerColor = '#2196F3';
      fabric.Object.prototype.cornerSize = 20; // Increased from 15 to 20 for easier selection
      fabric.Object.prototype.touchCornerSize = 30; // Larger touch area for mobile (40px)
      fabric.Object.prototype.cornerStyle = 'rect';
      fabric.Object.prototype.borderColor = 'transparent';
      fabric.Object.prototype.borderScaleFactor = 0;
      fabric.Object.prototype.hasBorders = false;
      fabric.Object.prototype.padding = 15;
      
      // Custom L-shaped corner renderer
      const renderLCorner = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any, flipX = false, flipY = false) => {
        const size = fabricObject.cornerSize || 20;
        const armLength = size * 0.8;
        
        ctx.save();
        ctx.strokeStyle = '#2196F3';
        ctx.fillStyle = '#2196F3';
        ctx.lineWidth = 2;
        
        // Apply object rotation to the control
        const angle = fabricObject.angle || 0;
        ctx.translate(left, top);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.translate(-left, -top);
        
        // Draw L-shape
        ctx.beginPath();
        // Vertical arm
        ctx.moveTo(left, top + (flipY ? -armLength : armLength));
        ctx.lineTo(left, top);
        // Horizontal arm
        ctx.lineTo(left + (flipX ? -armLength : armLength), top);
        ctx.stroke();
        
        // Corner dot
        ctx.beginPath();
        ctx.arc(left, top, 3, 0, 2 * Math.PI);
        ctx.fill();
        
        // End dots
        ctx.beginPath();
        ctx.arc(left + (flipX ? -armLength : armLength), top, 2, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(left, top + (flipY ? -armLength : armLength), 2, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
      };
      
      // Custom rotation icon renderer with square and circular arrows
      const renderRotationIcon = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) => {
        const size = (fabricObject.cornerSize || 20) + 4;
        
        ctx.save();
        ctx.fillStyle = '#2196F3';
        ctx.strokeStyle = '#2196F3';
        
        // Square background
        ctx.fillRect(left - size/2, top - size/2, size, size);
        
        // Circular arrows inside (white on blue)
        ctx.strokeStyle = 'white';
        ctx.fillStyle = 'white';
        ctx.lineWidth = 1.5;
        const radius = size * 0.25;
        
        // Outer circular arrow
        ctx.beginPath();
        ctx.arc(left, top, radius, -Math.PI/2, Math.PI);
        ctx.stroke();
        
        // Arrow head for outer
        ctx.beginPath();
        ctx.moveTo(left - radius + 2, top + 3);
        ctx.lineTo(left - radius - 2, top);
        ctx.lineTo(left - radius + 2, top - 3);
        ctx.closePath();
        ctx.fill();
        
        // Inner circular arrow
        ctx.beginPath();
        ctx.arc(left, top, radius * 0.6, Math.PI/2, -Math.PI);
        ctx.stroke();
        
        // Arrow head for inner
        ctx.beginPath();
        ctx.moveTo(left + radius * 0.6 - 2, top - 2);
        ctx.lineTo(left + radius * 0.6 + 2, top);
        ctx.lineTo(left + radius * 0.6 - 2, top + 2);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
      };
      
      // Generic arrow renderer that rotates with the object
      const renderArrow = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any, direction: 'up' | 'down' | 'left' | 'right') => {
        const size = 16; // Increased from 12 to 16 for easier visibility
        ctx.save();
        ctx.strokeStyle = '#4CAF50';
        ctx.fillStyle = '#4CAF50';
        ctx.lineWidth = 2;
        
        // Move to arrow position
        ctx.translate(left, top);
        
        // Determine base rotation for the arrow direction
        let baseRotation = 0;
        switch (direction) {
          case 'up': baseRotation = 0; break;
          case 'right': baseRotation = Math.PI / 2; break;
          case 'down': baseRotation = Math.PI; break;
          case 'left': baseRotation = -Math.PI / 2; break;
        }
        
        // Get object rotation in radians
        const objectRotation = (fabricObject.angle || 0) * Math.PI / 180;
        
        // Apply total rotation (base direction + object rotation)
        ctx.rotate(baseRotation + objectRotation);
        
        // Draw upward-pointing arrow (will be rotated to correct direction)
        ctx.beginPath();
        ctx.moveTo(0, -size/2);
        ctx.lineTo(-size/3, size/6);
        ctx.lineTo(size/3, size/6);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
      };

      // Individual arrow renderers for each direction
      const renderUpArrow = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) => {
        renderArrow(ctx, left, top, styleOverride, fabricObject, 'up');
      };

      const renderDownArrow = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) => {
        renderArrow(ctx, left, top, styleOverride, fabricObject, 'down');
      };

      const renderLeftArrow = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) => {
        renderArrow(ctx, left, top, styleOverride, fabricObject, 'left');
      };

      const renderRightArrow = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) => {
        renderArrow(ctx, left, top, styleOverride, fabricObject, 'right');
      };
      
      // Scale action handler - resizes the image uniformly
      const scaleActionHandler = fabric.controlsUtils.scalingEqually;
      
      // Reset drag bounds when drag ends
      const resetDragBounds = () => {
        dragStartBounds.current = null;
      };
      
      // Apply final crop when drag ends (for top/left scissors)
      const applyFinalCrop = (target: any) => {
        console.log('applyFinalCrop called for:', target._lastCropControl);
        if (!target || target.type !== 'image' || !target._element) return;
        
        // Get the current visible bounds
        const currentBounds = target.getBoundingRect();
        
        // Create a temporary canvas for the cropped image
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        if (!tempCtx) return;
        
        // Set the temp canvas size to match the current visible size
        tempCanvas.width = currentBounds.width;
        tempCanvas.height = currentBounds.height;
        
        // Get the original image element
        const origImg = target._element;
        
        // Calculate what portion of the original image is currently visible
        // This accounts for any previous crops or scales
        const scaleX = target.scaleX || 1;
        const scaleY = target.scaleY || 1;
        
        // For top crop: we want to show the bottom portion of the image
        // For left crop: we want to show the right portion of the image
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = target.width;
        let sourceHeight = target.height;
        
        if (target._lastCropControl === 'mt') {
          // Top crop: Calculate how much was cropped from top
          const cropRatio = currentBounds.height / (origImg.naturalHeight || origImg.height);
          sourceY = origImg.naturalHeight - (currentBounds.height / scaleY);
          sourceHeight = currentBounds.height / scaleY;
        } else if (target._lastCropControl === 'ml') {
          // Left crop: Calculate how much was cropped from left
          sourceX = origImg.naturalWidth - (currentBounds.width / scaleX);
          sourceWidth = currentBounds.width / scaleX;
        }
        
        console.log('Drawing from source:', sourceX, sourceY, sourceWidth, sourceHeight);
        console.log('To destination:', 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Draw the cropped portion
        tempCtx.drawImage(
          origImg,
          sourceX, sourceY, sourceWidth, sourceHeight,
          0, 0, tempCanvas.width, tempCanvas.height
        );
        
        // Convert to data URL and create a new Fabric image
        const dataURL = tempCanvas.toDataURL('image/png');
        
        fabric.Image.fromURL(dataURL, (newImg: any) => {
          // Copy properties from old image
          newImg.set({
            left: target.left,
            top: target.top,
            angle: target.angle,
            flipX: target.flipX,
            flipY: target.flipY
          });
          
          // Replace the old image
          const canvas = target.canvas;
          if (canvas) {
            canvas.remove(target);
            canvas.add(newImg);
            canvas.setActiveObject(newImg);
            canvas.renderAll();
          }
        });
      };
      
      // Define control sets for different modes
      normalControls.current = {
        // Corner controls with L-shapes
        tl: new fabric.Control({
          x: -0.5,
          y: -0.5,
          actionHandler: fabric.controlsUtils.scalingEqually,
          cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler,
          actionName: 'scaling',
          render: (ctx: any, left: number, top: number, styleOverride: any, fabricObject: any) => 
            renderLCorner(ctx, left, top, styleOverride, fabricObject, false, false)
        }),
        tr: new fabric.Control({
          x: 0.5,
          y: -0.5,
          actionHandler: fabric.controlsUtils.scalingEqually,
          cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler,
          actionName: 'scaling',
          render: (ctx: any, left: number, top: number, styleOverride: any, fabricObject: any) => 
            renderLCorner(ctx, left, top, styleOverride, fabricObject, true, false)
        }),
        bl: new fabric.Control({
          x: -0.5,
          y: 0.5,
          actionHandler: fabric.controlsUtils.scalingEqually,
          cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler,
          actionName: 'scaling',
          render: (ctx: any, left: number, top: number, styleOverride: any, fabricObject: any) => 
            renderLCorner(ctx, left, top, styleOverride, fabricObject, false, true)
        }),
        br: new fabric.Control({
          x: 0.5,
          y: 0.5,
          actionHandler: fabric.controlsUtils.scalingEqually,
          cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler,
          actionName: 'scaling',
          render: (ctx: any, left: number, top: number, styleOverride: any, fabricObject: any) => 
            renderLCorner(ctx, left, top, styleOverride, fabricObject, true, true)
        }),
        // Custom rotation control
        mtr: new fabric.Control({
          x: 0,
          y: -0.5,
          offsetY: -40,
          actionHandler: fabric.controlsUtils.rotationWithSnapping,
          cursorStyleHandler: fabric.controlsUtils.rotationStyleHandler,
          actionName: 'rotate',
          render: renderRotationIcon
        }),
        // Add middle side controls for proper scaling
        mt: new fabric.Control({
          x: 0,
          y: -0.5,
          actionHandler: fabric.controlsUtils.scalingYOrSkewingX,
          cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler,
          actionName: 'scaling',
          render: renderUpArrow
        }),
        mb: new fabric.Control({
          x: 0,
          y: 0.5,
          actionHandler: fabric.controlsUtils.scalingYOrSkewingX,
          cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler,
          actionName: 'scaling',
          render: renderDownArrow
        }),
        ml: new fabric.Control({
          x: -0.5,
          y: 0,
          actionHandler: fabric.controlsUtils.scalingXOrSkewingY,
          cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler,
          actionName: 'scaling',
          render: renderLeftArrow
        }),
        mr: new fabric.Control({
          x: 0.5,
          y: 0,
          actionHandler: fabric.controlsUtils.scalingXOrSkewingY,
          cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler,
          actionName: 'scaling',
          render: renderRightArrow
        })
      };
      
      // Use the normal controls for crop mode as well (no special crop controls needed)
      cropControls.current = normalControls.current;
      
      // Apply normal controls by default
      fabric.Object.prototype.controls = normalControls.current;
      

      // Add border as a fabric object (positioned with padding)
      // This is a fallback border - will be replaced by print_img border if available
      const borderStrokeWidth = 1;
      const borderInset = borderStrokeWidth / 2;
      const border = new fabric.Rect({
        left: CONTROL_PADDING + borderInset,
        top: VERTICAL_PADDING + borderInset,
        width: DISPLAY_WIDTH - borderStrokeWidth,
        height: DISPLAY_HEIGHT - borderStrokeWidth,
        fill: 'white',  // White background for the actual canvas area
        stroke: '#9ca3af',  // Medium gray color (darker for better visibility)
        strokeWidth: borderStrokeWidth,
        strokeDashArray: [2, 3],  // Very detailed dotted pattern: 2px dash, 3px gap
        rx: 20,  // Rounded corners - horizontal radius
        ry: 20,  // Rounded corners - vertical radius
        selectable: false,
        evented: false,
        isFallbackBorder: true,  // Mark for later removal if print_img is available
        excludeFromExport: true
      });

      // Create crosshair guidelines (accounting for padding)
      const centerX = CONTROL_PADDING + DISPLAY_WIDTH / 2;
      const centerY = VERTICAL_PADDING + DISPLAY_HEIGHT / 2;
      
      const verticalLine = new fabric.Line([centerX, VERTICAL_PADDING, centerX, VERTICAL_PADDING + DISPLAY_HEIGHT], {
        stroke: '#00ff00',
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
        opacity: 0.5,
        excludeFromExport: true,
        objectCaching: false,
        hasControls: false,
        hasBorders: false
      });
      
      const horizontalLine = new fabric.Line([CONTROL_PADDING, centerY, CONTROL_PADDING + DISPLAY_WIDTH, centerY], {
        stroke: '#00ff00',
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
        opacity: 0.5,
        excludeFromExport: true,
        objectCaching: false,
        hasControls: false,
        hasBorders: false
      });

      fabricCanvas.add(border);

      // Set up clipping path with rounded corners to clip image content
      fabricCanvas.clipPath = new fabric.Rect({
        left: CONTROL_PADDING,
        top: VERTICAL_PADDING,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        rx: 20,  // Rounded corners - horizontal radius
        ry: 20,  // Rounded corners - vertical radius
        absolutePositioned: true
      });

      // Add crosshairs after other elements are set up
      // This ensures they're always on top initially
      setCrosshairLines({vertical: verticalLine, horizontal: horizontalLine});
      
      // Add phone case and crosshairs
      // Note: Order of addition matters for rendering
      fabricCanvas.add(verticalLine);
      fabricCanvas.add(horizontalLine);
      
      // Override renderAll to ensure crosshairs are always drawn last
      const originalRenderAll = fabricCanvas.renderAll.bind(fabricCanvas);
      fabricCanvas.renderAll = function() {
        // First render everything normally
        originalRenderAll();
        
        // Then redraw crosshairs on top
        const ctx = fabricCanvas.getContext();
        if (ctx && verticalLine && horizontalLine) {
          ctx.save();
          verticalLine.render(ctx);
          horizontalLine.render(ctx);
          ctx.restore();
        }
        
        return fabricCanvas;
      };
      
      // Configure canvas to allow proper overflow behavior
      fabricCanvas.controlsAboveOverlay = true;
      fabricCanvas.preserveObjectStacking = true;
      
      // Store mouse position on canvas for snap detection
      fabricCanvas.on('mouse:move', function(opt: any) {
        const pointer = fabricCanvas.getPointer(opt.e);
        mouseCanvasPos.current = { x: pointer.x, y: pointer.y };
      });
      
      // Track when user is actively dragging/manipulating
      let isDragging = false;
      
      // Hide buttons only when actively dragging
      fabricCanvas.on('mouse:down', function(e: any) {
        // Only track dragging if clicking on an actual object
        if (e.target && e.target.selectable !== false) {
          isDragging = true;
          setIsManipulating(true);
        }
      });
      
      // Don't hide on selection events alone - only on actual manipulation
      // This prevents hiding when programmatically setting active object
      
      // Set up smooth magnetic snap-to-center
      fabricCanvas.on('object:moving', function(e: any) {
        const obj = e.target;
        
        // Skip position snapping if we're rotating or scaling
        if (isRotating.current || isScaling.current) {
          return;
        }
        
        // Get object bounds for snapping calculations
        const objBounds = obj.getBoundingRect(true, true);
        
        // No boundary enforcement - allow free movement anywhere
        // This prevents teleporting issues
        
        // Get current mouse position
        const mousePos = mouseCanvasPos.current;
        
        // Check if we're currently locked
        const isLockedX = hasSnappedRef.current.x;
        const isLockedY = hasSnappedRef.current.y;
        
        // Thresholds
        const snapZone = 3; // Zone to trigger initial snap (reduced from 5)
        const releaseDistance = 10; // Mouse must move this far from lock position to release (reduced from 15)
        
        // If locked, check distance from lock position (not from center)
        if (isLockedX || isLockedY) {
          let forceX = obj.left;
          let forceY = obj.top;
          
          // Check X-axis lock
          if (isLockedX) {
            const mouseDistanceFromLockX = Math.abs(mousePos.x - lockMousePos.current.x);
            if (mouseDistanceFromLockX > releaseDistance) {
              // Mouse moved far enough from lock position - release
              hasSnappedRef.current.x = false;
              verticalLine.set({ stroke: '#00ff00', strokeWidth: 1, opacity: 0.5 });
            } else {
              // Still locked - force to locked position
              forceX = lockedObjectPos.current.x;
              verticalLine.set({ stroke: '#ff0000', strokeWidth: 2 });
            }
          }
          
          // Check Y-axis lock
          if (isLockedY) {
            const mouseDistanceFromLockY = Math.abs(mousePos.y - lockMousePos.current.y);
            if (mouseDistanceFromLockY > releaseDistance) {
              // Mouse moved far enough from lock position - release
              hasSnappedRef.current.y = false;
              horizontalLine.set({ stroke: '#00ff00', strokeWidth: 1, opacity: 0.5 });
            } else {
              // Still locked - force to locked position
              forceY = lockedObjectPos.current.y;
              horizontalLine.set({ stroke: '#ff0000', strokeWidth: 2 });
            }
          }
          
          // Force object to locked position
          obj.left = forceX;
          obj.top = forceY;
          obj.setCoords();
        }
        
        // If not locked, check for initial snap
        const centerX = CONTROL_PADDING + DISPLAY_WIDTH / 2;   // Center with padding
        const centerY = VERTICAL_PADDING + DISPLAY_HEIGHT / 2;  // Center with padding
        
        if (!isLockedX || !isLockedY) {
          const objBoundingRect = obj.getBoundingRect(true);
          const objCenterX = objBoundingRect.left + objBoundingRect.width / 2;
          const objCenterY = objBoundingRect.top + objBoundingRect.height / 2;
          const objDistanceX = Math.abs(objCenterX - centerX);
          const objDistanceY = Math.abs(objCenterY - centerY);
          
          // Border snapping with lock/release mechanism
          const borderSnapZone = 5; // Snap zone for borders (reduced from 8)
          const borderReleaseDistance = 12; // Distance to release border lock (reduced from 20)
          const canvasLeft = CONTROL_PADDING;
          const canvasRight = CONTROL_PADDING + DISPLAY_WIDTH;
          const canvasTop = VERTICAL_PADDING;
          const canvasBottom = VERTICAL_PADDING + DISPLAY_HEIGHT;
          
          // Check border locks first
          const isBorderLockedLeft = hasSnappedRef.current.borderLeft;
          const isBorderLockedRight = hasSnappedRef.current.borderRight;
          const isBorderLockedTop = hasSnappedRef.current.borderTop;
          const isBorderLockedBottom = hasSnappedRef.current.borderBottom;
          
          // Handle X-axis border locking
          if (isBorderLockedLeft || isBorderLockedRight) {
            const mouseDistanceFromBorderLockX = Math.abs(mousePos.x - borderLockMousePos.current.x);
            
            if (mouseDistanceFromBorderLockX > borderReleaseDistance) {
              // Release border lock
              hasSnappedRef.current.borderLeft = false;
              hasSnappedRef.current.borderRight = false;
            } else {
              // Maintain border lock
              obj.left = borderLockedPos.current.x;
              obj.setCoords();
            }
          }
          // Check for new border snap if not locked to center or borders
          else if (!isLockedX && objDistanceX >= snapZone) {
            const leftDistance = Math.abs(objBoundingRect.left - canvasLeft);
            const rightDistance = Math.abs(objBoundingRect.left + objBoundingRect.width - canvasRight);
            
            if (leftDistance < borderSnapZone) {
              // Lock to left border - snap edge directly without offset
              const edgeOffset = objBoundingRect.left - obj.left;
              obj.left = canvasLeft - edgeOffset;
              obj.setCoords();
              hasSnappedRef.current.borderLeft = true;
              borderLockMousePos.current.x = mousePos.x;
              borderLockedPos.current.x = obj.left;
            } else if (rightDistance < borderSnapZone) {
              // Lock to right border - snap edge directly
              const rightEdge = objBoundingRect.left + objBoundingRect.width;
              const edgeOffset = rightEdge - (obj.left + (obj.width * obj.scaleX) / 2);
              obj.left = canvasRight - objBoundingRect.width + (obj.left - objBoundingRect.left);
              obj.setCoords();
              hasSnappedRef.current.borderRight = true;
              borderLockMousePos.current.x = mousePos.x;
              borderLockedPos.current.x = obj.left;
            }
          }
          
          // Handle Y-axis border locking
          if (isBorderLockedTop || isBorderLockedBottom) {
            const mouseDistanceFromBorderLockY = Math.abs(mousePos.y - borderLockMousePos.current.y);
            
            if (mouseDistanceFromBorderLockY > borderReleaseDistance) {
              // Release border lock
              hasSnappedRef.current.borderTop = false;
              hasSnappedRef.current.borderBottom = false;
            } else {
              // Maintain border lock
              obj.top = borderLockedPos.current.y;
              obj.setCoords();
            }
          }
          // Check for new border snap if not locked to center or borders
          else if (!isLockedY && objDistanceY >= snapZone) {
            const topDistance = Math.abs(objBoundingRect.top - canvasTop);
            const bottomDistance = Math.abs(objBoundingRect.top + objBoundingRect.height - canvasBottom);
            
            if (topDistance < borderSnapZone) {
              // Lock to top border - snap edge directly without offset
              const edgeOffset = objBoundingRect.top - obj.top;
              obj.top = canvasTop - edgeOffset;
              obj.setCoords();
              hasSnappedRef.current.borderTop = true;
              borderLockMousePos.current.y = mousePos.y;
              borderLockedPos.current.y = obj.top;
            } else if (bottomDistance < borderSnapZone) {
              // Lock to bottom border - snap edge directly
              const bottomEdge = objBoundingRect.top + objBoundingRect.height;
              const edgeOffset = bottomEdge - (obj.top + (obj.height * obj.scaleY) / 2);
              obj.top = canvasBottom - objBoundingRect.height + (obj.top - objBoundingRect.top);
              obj.setCoords();
              hasSnappedRef.current.borderBottom = true;
              borderLockMousePos.current.y = mousePos.y;
              borderLockedPos.current.y = obj.top;
            }
          }
          
          // Check X-axis for initial snap (center - stronger than borders)
          if (!isLockedX && objDistanceX < snapZone) {
            // Use setPositionByOrigin to center properly with transformations
            const currentCenter = obj.getCenterPoint();
            obj.setPositionByOrigin(
              new fabric.Point(centerX, currentCenter.y),
              'center',
              'center'
            );
            obj.setCoords();
            hasSnappedRef.current.x = true;
            // Save mouse position at moment of lock
            lockMousePos.current.x = mousePos.x;
            lockedObjectPos.current.x = obj.left;
            verticalLine.set({ stroke: '#ff0000', strokeWidth: 2 });
          } else if (!isLockedX) {
            verticalLine.set({ stroke: '#00ff00', strokeWidth: 1, opacity: 0.5 });
          }
          
          // Check Y-axis for initial snap
          if (!isLockedY && objDistanceY < snapZone) {
            // Use setPositionByOrigin to center properly with transformations
            const currentCenter = obj.getCenterPoint();
            obj.setPositionByOrigin(
              new fabric.Point(currentCenter.x, centerY),
              'center',
              'center'
            );
            obj.setCoords();
            hasSnappedRef.current.y = true;
            // Save mouse position at moment of lock
            lockMousePos.current.y = mousePos.y;
            lockedObjectPos.current.y = obj.top;
            horizontalLine.set({ stroke: '#ff0000', strokeWidth: 2 });
          } else if (!isLockedY) {
            horizontalLine.set({ stroke: '#00ff00', strokeWidth: 1, opacity: 0.5 });
          }
        }
        
        setIsSnapping(hasSnappedRef.current.x || hasSnappedRef.current.y);
        fabricCanvas.renderAll();
      });
      
      // Track when scaling starts
      fabricCanvas.on('scaling:start', function(e: any) {
        isScaling.current = true;
      });
      
      // Handle scaling - no constraints, let user scale freely
      fabricCanvas.on('object:scaling', function(e: any) {
        isScaling.current = true;
        // Let Fabric.js handle scaling naturally
        // No snapping or constraints during scaling to avoid issues
      });
      
      // Track when rotation starts
      fabricCanvas.on('rotating:start', function(e: any) {
        isRotating.current = true;
      });
      
      // Handle rotation snapping
      fabricCanvas.on('object:rotating', function(e: any) {
        const obj = e.target;
        isRotating.current = true;
        
        // Store the center position to prevent drift
        const centerPoint = obj.getCenterPoint();
        const currentAngle = obj.angle;
        const mousePos = mouseCanvasPos.current;
        
        // Normalize angle to 0-360 range
        const normalizedAngle = ((currentAngle % 360) + 360) % 360;
        
        // Thresholds for rotation
        const rotationSnapZone = 3; // Degrees to trigger snap (reduced from 5)
        const rotationReleaseThreshold = 7; // Degrees to release (reduced from 10)
        
        const isLockedRotation = hasSnappedRef.current.rotation;
        
        if (isLockedRotation) {
          // Calculate mouse angle change since lock
          const objCenter = obj.getCenterPoint();
          const currentMouseAngle = Math.atan2(mousePos.y - objCenter.y, mousePos.x - objCenter.x) * 180 / Math.PI;
          const angleDiff = Math.abs(currentMouseAngle - lockMouseAngle.current);
          
          if (angleDiff > rotationReleaseThreshold) {
            // Release rotation lock
            hasSnappedRef.current.rotation = false;
          } else {
            // Keep locked to the snapped angle
            obj.angle = lockedRotation.current;
          }
        } else {
          // Check if close to cardinal directions (0, 90, 180, 270)
          let snapAngle = -1;
          
          // Check 0/360 degrees
          if (normalizedAngle < rotationSnapZone || normalizedAngle > (360 - rotationSnapZone)) {
            snapAngle = 0;
          }
          // Check 90 degrees
          else if (Math.abs(normalizedAngle - 90) < rotationSnapZone) {
            snapAngle = 90;
          }
          // Check 180 degrees
          else if (Math.abs(normalizedAngle - 180) < rotationSnapZone) {
            snapAngle = 180;
          }
          // Check 270 degrees
          else if (Math.abs(normalizedAngle - 270) < rotationSnapZone) {
            snapAngle = 270;
          }
          
          if (snapAngle >= 0) {
            // Snap to the detected angle
            obj.angle = snapAngle;
            hasSnappedRef.current.rotation = true;
            
            // Save mouse angle at lock time
            const objCenter = obj.getCenterPoint();
            lockMouseAngle.current = Math.atan2(mousePos.y - objCenter.y, mousePos.x - objCenter.x) * 180 / Math.PI;
            lockedRotation.current = snapAngle;
          }
        }
        
        // Ensure object stays at same position during rotation
        obj.setPositionByOrigin(centerPoint, 'center', 'center');
        obj.setCoords();
        fabricCanvas.renderAll();
      });
      
      // Handle object modifications (scaling, rotating)
      fabricCanvas.on('object:modified', function(e: any) {
        const obj = e.target;
        
        // Gentle boundary enforcement after modifications
        // Only pull back if completely outside canvas
        const objBounds = obj.getBoundingRect(true, true);
        
        // Check if object is completely outside and needs to be pulled back
        if (objBounds.left > DISPLAY_WIDTH || 
            objBounds.left + objBounds.width < 0 ||
            objBounds.top > DISPLAY_HEIGHT || 
            objBounds.top + objBounds.height < 0) {
          
          // Pull object back to nearest edge
          const currentCenter = obj.getCenterPoint();
          let newCenterX = currentCenter.x;
          let newCenterY = currentCenter.y;
          
          // Only constrain if completely outside
          if (objBounds.left > DISPLAY_WIDTH) {
            newCenterX = DISPLAY_WIDTH - objBounds.width / 2;
          } else if (objBounds.left + objBounds.width < 0) {
            newCenterX = objBounds.width / 2;
          }
          
          if (objBounds.top > DISPLAY_HEIGHT) {
            newCenterY = DISPLAY_HEIGHT - objBounds.height / 2;
          } else if (objBounds.top + objBounds.height < 0) {
            newCenterY = objBounds.height / 2;
          }
          
          obj.setPositionByOrigin(
            new fabric.Point(newCenterX, newCenterY),
            'center',
            'center'
          );
        }
        
        obj.setCoords();
        fabricCanvas.renderAll();
        
        // Reset rotation lock and flag on modification end
        hasSnappedRef.current.rotation = false;
        isRotating.current = false;
      });
      
      // Reset snap indicators on mouse up
      fabricCanvas.on('mouse:up', function() {
        verticalLine.set({ stroke: '#00ff00', strokeWidth: 1, opacity: 0.5 });
        horizontalLine.set({ stroke: '#00ff00', strokeWidth: 1, opacity: 0.5 });
        fabricCanvas.renderAll();
        setIsSnapping(false);
        // Reset rotation and scaling flags
        isRotating.current = false;
        isScaling.current = false;
        // Reset scaling border locks
        scalingBorderLock.current = {left: false, right: false, top: false, bottom: false};
        // Show buttons again
        setIsManipulating(false);
        
        // Apply final crop if it was a top/left scissor drag
        const activeObject = fabricCanvas.getActiveObject();
        if (activeObject && activeObject._lastCropControl) {
          if (activeObject._lastCropControl === 'mt' || activeObject._lastCropControl === 'ml') {
            applyFinalCrop(activeObject);
          }
          delete activeObject._lastCropControl;
        }
        
        // Reset drag bounds for cropping
        resetDragBounds();
        // Don't reset snap state here - let the object:moving handler manage it based on position
      });

      setCanvas(fabricCanvas);

      return () => {
        fabricCanvas.dispose();
      };
  }, [fabric, isCheckingSession, isSessionLocked, showWaitingForPayment, showThankYou]); // Removed isCropMode to prevent re-initialization

  // Load print_img and use it as canvas clipPath for exact phone case outline
  useEffect(() => {
    if (!canvas || !fabric) return;

    const chituPrintImg = sessionStorage.getItem('selectedPhoneModelPrintImg');
    if (!chituPrintImg) {
      console.log('📱 No print_img available - using default rounded corners');
      return;
    }

    // Use backend proxy to avoid CORS issues
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin.replace(':3000', ':3001') : 'http://localhost:3001');
    const proxyUrl = `${backendUrl}/api/chitu/image-proxy?url=${encodeURIComponent(chituPrintImg)}`;

    console.log('📱 Loading print_img for canvas clipPath:', chituPrintImg);

    const img = new Image();
    img.crossOrigin = 'anonymous';  // Required to prevent canvas tainting
    img.onload = () => {
      if (!canvas) return;

      // Remove the fallback border rect since we're using print_img shape
      const fallbackBorder = canvas.getObjects().find((obj: any) => obj.isFallbackBorder);
      if (fallbackBorder) {
        canvas.remove(fallbackBorder);
        console.log('🗑️ Removed fallback border - using print_img shape');
      }

      // Create a Fabric.Image from the print template for clipPath
      const clipImg = new fabric.Image(img, {
        left: CONTROL_PADDING,
        top: VERTICAL_PADDING,
        scaleX: DISPLAY_WIDTH / img.width,
        scaleY: DISPLAY_HEIGHT / img.height,
        absolutePositioned: true,
      });

      // Set as canvas clipPath - this clips content to the print template's opaque areas
      canvas.clipPath = clipImg;

      // Add the print_img as a semi-transparent overlay on top to show the phone case outline
      // This shows users exactly where the cutouts and edges are
      const borderOverlay = new fabric.Image(img, {
        left: CONTROL_PADDING,
        top: VERTICAL_PADDING,
        scaleX: DISPLAY_WIDTH / img.width,
        scaleY: DISPLAY_HEIGHT / img.height,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        opacity: 0.12,  // Very subtle overlay to show the shape/cutouts
        isPrintImgBorder: true,
      });

      canvas.add(borderOverlay);
      canvas.bringObjectToFront(borderOverlay);

      // Keep crosshairs on top
      if (crosshairLines?.vertical) canvas.bringObjectToFront(crosshairLines.vertical);
      if (crosshairLines?.horizontal) canvas.bringObjectToFront(crosshairLines.horizontal);

      canvas.renderAll();

      console.log('✅ Canvas clipPath and border updated to print_img outline:', img.width, 'x', img.height);
    };
    img.onerror = (err) => {
      console.error('❌ Failed to load print_img for clipPath - using default rounded corners:', err);
    };
    img.src = proxyUrl;
  }, [canvas, fabric, DISPLAY_WIDTH, DISPLAY_HEIGHT, CONTROL_PADDING, VERTICAL_PADDING, crosshairLines]);

  // Resize canvas dynamically when viewport or layout changes
  useEffect(() => {
    if (!canvas || !uploadedImage) return;

    // Update canvas dimensions to fit current layout
    canvas.setDimensions({
      width: CANVAS_TOTAL_WIDTH,
      height: CANVAS_TOTAL_HEIGHT
    });

    // Update the uploaded image position and scale to fit new dimensions
    const newScale = SCALE_FACTOR;
    const newLeft = CONTROL_PADDING + (DISPLAY_WIDTH / 2);
    const newTop = VERTICAL_PADDING + (DISPLAY_HEIGHT / 2);

    uploadedImage.set({
      left: newLeft,
      top: newTop
    });

    canvas.renderAll();
    console.log('📐 Canvas resized:', {
      width: CANVAS_TOTAL_WIDTH,
      height: CANVAS_TOTAL_HEIGHT,
      displayWidth: DISPLAY_WIDTH,
      displayHeight: DISPLAY_HEIGHT,
      scaleFactor: SCALE_FACTOR
    });
  }, [canvas, uploadedImage, CANVAS_TOTAL_WIDTH, CANVAS_TOTAL_HEIGHT, DISPLAY_WIDTH, DISPLAY_HEIGHT, SCALE_FACTOR, CONTROL_PADDING, VERTICAL_PADDING]);

  // Ensure custom controls are always applied to uploaded image
  useEffect(() => {
    if (!uploadedImage || !normalControls.current) return;

    // Apply custom controls if not already applied
    if (uploadedImage.controls !== normalControls.current) {
      uploadedImage.controls = normalControls.current;
      uploadedImage.set({
        hasBorders: false,
        borderColor: 'transparent',
        cornerStyle: 'circle',
        cornerColor: '#8B5CF6',
        cornerStrokeColor: '#8B5CF6',
        transparentCorners: false,
        cornerSize: 12,
        padding: 0,
      });
      if (canvas) {
        canvas.renderAll();
      }
      console.log('🔧 Custom controls ensured on uploaded image');
    }
  }, [uploadedImage, canvas]);

  // Separate useEffect to add undo event listeners after canvas is ready
  useEffect(() => {
    if (!canvas || !saveCanvasState) return;

    const handleModified = () => {
      console.log('🔄 Object modified event fired');
      setTimeout(() => {
        console.log('🔄 Calling saveCanvasState after modification');
        saveCanvasState();
      }, 100);
    };

    const handleAdded = (e: any) => {
      const obj = e.target;
      if (!obj || obj.excludeFromExport) return;

      // Don't save state on initial image upload - only on subsequent additions
      // Check if this is the first user-added object (the uploaded image)
      const userObjects = canvas.getObjects().filter((o: any) =>
        !o.excludeFromExport && o.selectable !== false
      );

      // Only save if there's more than just the main image (stickers, text, etc.)
      if (userObjects.length > 1) {
        setTimeout(() => saveCanvasState(), 100);
      }
    };

    const handleRemoved = (e: any) => {
      const obj = e.target;
      if (!obj || obj.excludeFromExport) return;
      setTimeout(() => saveCanvasState(), 100);
    };

    canvas.on('object:modified', handleModified);
    canvas.on('object:added', handleAdded);
    canvas.on('object:removed', handleRemoved);

    console.log('✅ Undo event listeners attached to canvas');

    return () => {
      canvas.off('object:modified', handleModified);
      canvas.off('object:added', handleAdded);
      canvas.off('object:removed', handleRemoved);
      console.log('🧹 Undo event listeners cleaned up');
    };
  }, [canvas, saveCanvasState]);

  // Hide/show editing buttons during object manipulation for more freedom
  useEffect(() => {
    if (!canvas) return;

    const handleObjectMoving = () => {
      setHideEditButtons(true);
    };

    const handleObjectScaling = () => {
      setHideEditButtons(true);
    };

    const handleObjectRotating = () => {
      setHideEditButtons(true);
    };

    const handleMouseUp = () => {
      setHideEditButtons(false);
    };

    const handleSelectionCleared = () => {
      setHideEditButtons(false);
    };

    // Hide buttons during any object manipulation
    canvas.on('object:moving', handleObjectMoving);
    canvas.on('object:scaling', handleObjectScaling);
    canvas.on('object:rotating', handleObjectRotating);

    // Show buttons when manipulation ends
    canvas.on('mouse:up', handleMouseUp);
    canvas.on('selection:cleared', handleSelectionCleared);

    console.log('✅ Hide/show button event listeners attached');

    return () => {
      canvas.off('object:moving', handleObjectMoving);
      canvas.off('object:scaling', handleObjectScaling);
      canvas.off('object:rotating', handleObjectRotating);
      canvas.off('mouse:up', handleMouseUp);
      canvas.off('selection:cleared', handleSelectionCleared);
      console.log('🧹 Hide/show button event listeners cleaned up');
    };
  }, [canvas]);

  // Restore canvas state from sessionStorage on page refresh (separate from preview restoration)
  useEffect(() => {
    // Only run once when canvas is first ready and we haven't already restored
    if (!canvas || !fabric || !sessionId || uploadedImage || isRestoringState.current) {
      return;
    }

    // Skip if coming from preview page (handled by different logic)
    if (router.query.restore === 'true') {
      return;
    }

    // Try to restore from sessionStorage
    const savedStateKey = `canvas-state-${sessionId}`;
    const savedStateJson = sessionStorage.getItem(savedStateKey);

    if (!savedStateJson) {
      console.log('📭 No saved canvas state to restore');
      return;
    }

    // Set flag IMMEDIATELY to prevent duplicate runs (React StrictMode)
    isRestoringState.current = true;
    console.log('🔒 Restoration lock acquired');

    try {
      console.log('🔄 Restoring canvas state from sessionStorage on refresh...');
      const savedState = JSON.parse(savedStateJson);

      if (!savedState.canvasJSON || !savedState.mainImageState) {
        console.log('⚠️ Saved state incomplete, skipping restoration');
        isRestoringState.current = false;
        return;
      }

      // Debug: Log what's in the saved canvas JSON (case-insensitive for 'image' type)
      const imageObjects = savedState.canvasJSON.objects?.filter((o: any) => o.type?.toLowerCase() === 'image');
      console.log('🔍 Canvas JSON contains:', {
        objectCount: savedState.canvasJSON.objects?.length,
        objectTypes: savedState.canvasJSON.objects?.map((o: any) => o.type),
        hasImageObjects: imageObjects && imageObjects.length > 0,
        imageObjectsCount: imageObjects?.length,
        imageDetails: imageObjects?.map((img: any) => ({
          type: img.type,
          hasSrc: !!img.src,
          srcLength: img.src?.length,
          srcPreview: img.src?.substring(0, 100),
          hasFilters: !!img.filters,
          width: img.width,
          height: img.height
        }))
      });

      // Set flag to prevent auto-saves during restoration
      isRestoringState.current = true;

      // Restore background color
      if (savedState.backgroundColor) {
        setCanvasBackgroundColor(savedState.backgroundColor);
      }

      // CRITICAL FIX: Manually restore image FIRST, then restore other objects
      // Fabric.js loadFromJSON often fails to deserialize large base64 images
      const imageData = savedState.canvasJSON.objects?.find((obj: any) =>
        obj.type?.toLowerCase() === 'image' && obj.selectable !== false
      );

      if (imageData && imageData.src) {
        console.log('🖼️ Manually restoring image first (before loadFromJSON)...');
        console.log('🔍 Image src length:', imageData.src?.length);

        // Set a timeout to force fallback if fromObject takes too long
        let callbackFired = false;
        const timeoutId = setTimeout(() => {
          if (!callbackFired) {
            console.warn('⚠️ fabric.Image.fromObject timeout - falling back to loadFromJSON');
            fallbackToLoadFromJSON();
          }
        }, 2000); // 2 second timeout

        // Create image from base64 data
        fabric.Image.fromObject(imageData, (restoredImage: any) => {
          callbackFired = true;
          clearTimeout(timeoutId);
          console.log('✅ Image restored via fromObject!');
          console.log('🔍 Restored image details:', {
            type: restoredImage.type,
            width: restoredImage.width,
            height: restoredImage.height,
            left: restoredImage.left,
            top: restoredImage.top
          });

          // Apply custom controls (L-shaped corners, rotation icon, arrows)
          restoredImage.controls = normalControls.current;
          // Remove border to match initial upload behavior
          restoredImage.set({
            hasBorders: false,
            borderColor: 'transparent'
          });
          console.log('🎨 Applied custom controls to restored image');

          // Add image to canvas
          canvas.add(restoredImage);
          setUploadedImage(restoredImage);
          setHasRestoredImage(true); // Mark that we've restored an image
          // Don't select the image - matches initial upload behavior
          canvas.discardActiveObject();

          // Now restore the REST of the canvas (borders, lines, etc.) WITHOUT the image
          const canvasJSONWithoutImage = {
            ...savedState.canvasJSON,
            objects: savedState.canvasJSON.objects?.filter((obj: any) =>
              !(obj.type?.toLowerCase() === 'image' && obj.selectable !== false)
            )
          };

          console.log('🔄 Now restoring other canvas objects (borders, lines)...');
          canvas.loadFromJSON(canvasJSONWithoutImage, () => {
            console.log('✅ Canvas borders/lines restored');

            // Move image to correct z-index (should be on top or at specific position)
            canvas.bringToFront(restoredImage);

            // Clear restoration flag BEFORE renderAll to allow proper state updates
            isRestoringState.current = false;
            console.log('🔓 Restoration lock released (fromObject path)');

            canvas.renderAll();

            // Double-render after React state settles to ensure canvas displays properly
            requestAnimationFrame(() => {
              canvas.renderAll();
            });

            // Restore canvas history from sessionStorage (for undo/redo across refresh)
            const savedHistoryJson = sessionStorage.getItem(`canvas-history-${sessionId}`);
            if (savedHistoryJson) {
              try {
                const savedHistory = JSON.parse(savedHistoryJson);
                if (Array.isArray(savedHistory) && savedHistory.length > 0) {
                  setCanvasHistory(savedHistory);
                  console.log(`✅ Canvas history restored (${savedHistory.length} states)`);
                } else {
                  // Fallback to initial state
                  const initialState = JSON.stringify(savedState.mainImageState);
                  setCanvasHistory([initialState]);
                }
              } catch (e) {
                console.warn('⚠️ Failed to parse saved history, using initial state');
                const initialState = JSON.stringify(savedState.mainImageState);
                setCanvasHistory([initialState]);
              }
            } else {
              // No saved history, use initial state
              const initialState = JSON.stringify(savedState.mainImageState);
              setCanvasHistory([initialState]);
            }
            console.log('✅ Canvas restoration complete (fromObject path)');
          });
        }, (error: any) => {
          callbackFired = true;
          clearTimeout(timeoutId);
          console.error('❌ fabric.Image.fromObject failed:', error);
          // Fallback to original approach if fromObject fails
          fallbackToLoadFromJSON();
        });

        return; // Exit early, restoration continues in callback
      }

      // Fallback function if no image or fromObject fails
      function fallbackToLoadFromJSON() {
        console.log('🔄 Using fallback: loadFromJSON for entire canvas...');
        canvas.loadFromJSON(savedState.canvasJSON, () => {
        console.log('✅ Canvas state restored from sessionStorage');

        // Find the main uploaded image object
        const objects = canvas.getObjects();

        console.log('🔍 Restored objects count:', objects.length);
        objects.forEach((obj: any, i: number) => {
          console.log(`  Object ${i}:`, {
            type: obj.type,
            selectable: obj.selectable,
            excludeFromExport: obj.excludeFromExport,
            width: obj.width,
            height: obj.height
          });
        });

        // Case-insensitive check for image type (Fabric.js uses 'Image' with capital I)
        const mainImage = objects.find((obj: any) =>
          obj.type?.toLowerCase() === 'image' && obj.selectable !== false
        );

        if (mainImage) {
          console.log('✅ Main image found and restored');
          // Apply custom controls (L-shaped corners, rotation icon, arrows)
          if (normalControls.current) {
            mainImage.controls = normalControls.current;
            console.log('🎨 Applied custom controls to restored image');
          } else {
            console.warn('⚠️ normalControls.current is null - controls will be default');
          }
          // Remove border to match initial upload behavior
          mainImage.set({
            hasBorders: false,
            borderColor: 'transparent',
            cornerStyle: 'circle',
            cornerColor: '#8B5CF6',
            cornerStrokeColor: '#8B5CF6',
            transparentCorners: false,
            cornerSize: 12,
            padding: 0,
          });

          setUploadedImage(mainImage);
          setHasRestoredImage(true); // Mark that we've restored an image
          // Don't select the image - matches initial upload behavior
          canvas.discardActiveObject();

          // Clear restoration flag BEFORE renderAll to allow proper state updates
          isRestoringState.current = false;
          console.log('🔓 Restoration lock released (main image path)');

          canvas.renderAll();

          // Double-render after React state settles to ensure canvas displays properly
          requestAnimationFrame(() => {
            canvas.renderAll();
          });

          // Restore canvas history from sessionStorage (for undo/redo across refresh)
          const savedHistoryJson = sessionStorage.getItem(`canvas-history-${sessionId}`);
          if (savedHistoryJson) {
            try {
              const savedHistory = JSON.parse(savedHistoryJson);
              if (Array.isArray(savedHistory) && savedHistory.length > 0) {
                setCanvasHistory(savedHistory);
                console.log(`✅ Canvas history restored (${savedHistory.length} states)`);
              } else {
                const initialState = JSON.stringify(savedState.mainImageState);
                setCanvasHistory([initialState]);
              }
            } catch (e) {
              const initialState = JSON.stringify(savedState.mainImageState);
              setCanvasHistory([initialState]);
            }
          } else {
            const initialState = JSON.stringify(savedState.mainImageState);
            setCanvasHistory([initialState]);
          }
          console.log('✅ Canvas restoration complete (main image found)');
        } else {
          console.warn('⚠️ No main image found in restored canvas');
          console.warn('   Trying fallback: find any image object...');

          // Fallback: just use the first selectable image object (case-insensitive)
          const anyImage = objects.find((obj: any) =>
            obj.type?.toLowerCase() === 'image' && obj.selectable !== false
          );
          if (anyImage) {
            console.log('✅ Using first selectable image object as fallback');
            // Apply custom controls (L-shaped corners, rotation icon, arrows)
            if (normalControls.current) {
              anyImage.controls = normalControls.current;
              console.log('🎨 Applied custom controls to restored image');
            } else {
              console.warn('⚠️ normalControls.current is null - controls will be default');
            }
            // Remove border to match initial upload behavior
            anyImage.set({
              hasBorders: false,
              borderColor: 'transparent',
              cornerStyle: 'circle',
              cornerColor: '#8B5CF6',
              cornerStrokeColor: '#8B5CF6',
              transparentCorners: false,
              cornerSize: 12,
              padding: 0,
            });

            setUploadedImage(anyImage);
            setHasRestoredImage(true); // Mark that we've restored an image
            // Don't select the image - matches initial upload behavior
            canvas.discardActiveObject();

            // Clear restoration flag BEFORE renderAll to allow proper state updates
            isRestoringState.current = false;
            console.log('🔓 Restoration lock released (anyImage fallback path)');

            canvas.renderAll();

            // Double-render after React state settles to ensure canvas displays properly
            requestAnimationFrame(() => {
              canvas.renderAll();
            });

            // Restore canvas history from sessionStorage
            const savedHistoryJson2 = sessionStorage.getItem(`canvas-history-${sessionId}`);
            if (savedHistoryJson2) {
              try {
                const savedHistory2 = JSON.parse(savedHistoryJson2);
                if (Array.isArray(savedHistory2) && savedHistory2.length > 0) {
                  setCanvasHistory(savedHistory2);
                }
              } catch (e) {
                const initialState = JSON.stringify(savedState.mainImageState);
                setCanvasHistory([initialState]);
              }
            } else {
              const initialState = JSON.stringify(savedState.mainImageState);
              setCanvasHistory([initialState]);
            }
            console.log('✅ Canvas restoration complete (anyImage fallback)');
          } else {
            // Last resort: manually create image from saved JSON data
            console.warn('❌ No image objects found in canvas after loadFromJSON');
            console.warn('   Attempting manual image restoration from JSON...');

            const imageData = savedState.canvasJSON.objects?.find((obj: any) =>
              obj.type?.toLowerCase() === 'image' && obj.selectable !== false
            );

            if (imageData && imageData.src) {
              console.log('🔧 Found image data in JSON, manually creating fabric.Image...');
              console.log('🔍 Image data details:', {
                type: imageData.type,
                srcLength: imageData.src?.length,
                srcStart: imageData.src?.substring(0, 50),
                left: imageData.left,
                top: imageData.top,
                width: imageData.width,
                height: imageData.height
              });

              // Use native Image loading with a more reliable approach
              console.log('🔄 Loading image using native Image element...');
              const imgElement = new Image();
              imgElement.crossOrigin = 'anonymous';

              imgElement.onload = () => {
                console.log('✅ Native image loaded successfully!');
                console.log('📐 Image dimensions:', { width: imgElement.width, height: imgElement.height });

                // Check if image was already restored (prevent duplicates from React StrictMode)
                const allObjects = canvas.getObjects();
                console.log('🔍 All objects on canvas before adding image:', allObjects.map((o: any) => ({
                  type: o.type,
                  selectable: o.selectable,
                  hasImage: o._element ? 'yes' : 'no'
                })));

                const existingImage = allObjects.find((obj: any) =>
                  obj.type?.toLowerCase() === 'image' && obj.selectable !== false
                );
                if (existingImage) {
                  console.log('⚠️ Image already exists on canvas, skipping duplicate restoration');
                  console.log('🔍 Existing image details:', {
                    type: existingImage.type,
                    width: existingImage.width,
                    height: existingImage.height,
                    hasElement: !!existingImage._element,
                    selectable: existingImage.selectable,
                    visible: existingImage.visible
                  });

                  // Apply custom controls (L-shaped corners, rotation icon, arrows)
                  existingImage.controls = normalControls.current;
                  // Remove border to match initial upload behavior
                  existingImage.set({
                    hasBorders: false,
                    borderColor: 'transparent'
                  });
                  console.log('🎨 Applied custom controls to existing image');

                  // Still set uploadedImage to clear the loading overlay
                  console.log('🔧 Setting uploadedImage to existing image to clear loading overlay');
                  setUploadedImage(existingImage);
                  // Don't select the image - matches initial upload behavior
                  canvas.discardActiveObject();

                  // Restore canvas history from sessionStorage
                  const savedHistoryJson3 = sessionStorage.getItem(`canvas-history-${sessionId}`);
                  if (savedHistoryJson3) {
                    try {
                      const savedHistory3 = JSON.parse(savedHistoryJson3);
                      if (Array.isArray(savedHistory3) && savedHistory3.length > 0) {
                        setCanvasHistory(savedHistory3);
                      }
                    } catch (e) {
                      const initialState = JSON.stringify(savedState.mainImageState);
                      setCanvasHistory([initialState]);
                    }
                  } else {
                    const initialState = JSON.stringify(savedState.mainImageState);
                    setCanvasHistory([initialState]);
                  }

                  // Clear restoration flag BEFORE renderAll to allow proper state updates
                  isRestoringState.current = false;
                  console.log('🔓 Restoration lock released (existing image path)');

                  canvas.renderAll();

                  // Double-render after React state settles to ensure canvas displays properly
                  requestAnimationFrame(() => {
                    canvas.renderAll();
                  });
                  console.log('✅ Canvas restoration complete (existing image)');
                  return;
                }

                try {
                  // Create Fabric image from loaded element
                  const fabricImage = new fabric.Image(imgElement, {
                    left: imageData.left || 0,
                    top: imageData.top || 0,
                    scaleX: imageData.scaleX || 1,
                    scaleY: imageData.scaleY || 1,
                    angle: imageData.angle || 0,
                    flipX: imageData.flipX || false,
                    flipY: imageData.flipY || false,
                    opacity: imageData.opacity !== undefined ? imageData.opacity : 1,
                    selectable: imageData.selectable !== false,
                    hasControls: imageData.hasControls !== false,
                    excludeFromExport: imageData.excludeFromExport || false,
                    originX: imageData.originX || 'left',
                    originY: imageData.originY || 'top'
                  });

                  // Apply filters if they exist
                  if (imageData.filters && imageData.filters.length > 0) {
                    fabricImage.filters = imageData.filters;
                    fabricImage.applyFilters();
                  }

                  // Apply custom controls (L-shaped corners, rotation icon, arrows)
                  fabricImage.controls = normalControls.current;
                  // Remove border to match initial upload behavior
                  fabricImage.set({
                    hasBorders: false,
                    borderColor: 'transparent'
                  });
                  console.log('🎨 Applied custom controls to manually restored image');

                  console.log('✅ Fabric image created from native element');
                  canvas.add(fabricImage);
                  setUploadedImage(fabricImage);
                  setHasRestoredImage(true);
                  // Don't select the image - matches initial upload behavior
                  canvas.discardActiveObject();

                  // Clear restoration flag BEFORE renderAll to allow proper state updates
                  isRestoringState.current = false;
                  console.log('🔓 Restoration lock released (manual image path)');

                  canvas.renderAll();

                  // Double-render after React state settles to ensure canvas displays properly
                  requestAnimationFrame(() => {
                    canvas.renderAll();
                  });

                  // Restore canvas history from sessionStorage
                  const savedHistoryJson4 = sessionStorage.getItem(`canvas-history-${sessionId}`);
                  if (savedHistoryJson4) {
                    try {
                      const savedHistory4 = JSON.parse(savedHistoryJson4);
                      if (Array.isArray(savedHistory4) && savedHistory4.length > 0) {
                        setCanvasHistory(savedHistory4);
                      }
                    } catch (e) {
                      const initialState = JSON.stringify(savedState.mainImageState);
                      setCanvasHistory([initialState]);
                    }
                  } else {
                    const initialState = JSON.stringify(savedState.mainImageState);
                    setCanvasHistory([initialState]);
                  }
                  console.log('✅ Canvas restoration complete (manual image)');
                } catch (err) {
                  console.error('❌ Failed to create Fabric image from element:', err);
                }
              };

              imgElement.onerror = (err) => {
                console.error('❌ Native image loading failed:', err);
              };

              imgElement.src = imageData.src;
              console.log('🔄 Started loading image from base64 data...');
            } else {
              console.error('❌ No image data found in saved JSON');
            }
          }
        }

        canvas.renderAll();

        // Only clear restoration flag if not already cleared by one of the image paths
        // This handles the case where no image was found
        if (isRestoringState.current) {
          isRestoringState.current = false;
          console.log('🔓 Restoration lock released (no image found path)');
        }
        });
      } // End of fallbackToLoadFromJSON function

      // If no image found in saved state, use fallback immediately
      if (!imageData || !imageData.src) {
        console.log('⚠️ No image data in saved state, using fallback method');
        fallbackToLoadFromJSON();
      }
    } catch (error) {
      console.error('❌ Failed to restore canvas state:', error);
      isRestoringState.current = false;
    }
  }, [canvas, fabric, sessionId, uploadedImage, router.query.restore]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z for Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canvasHistory.length >= 2 && canvas && uploadedImage && fabric) {
          // Trigger undo button click
          const undoButton = document.querySelector('[data-undo-button]') as HTMLButtonElement;
          if (undoButton) undoButton.click();
        }
      }

      // Ctrl+Shift+Z or Ctrl+Y for Redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
          ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        if (canvasRedoStack.length > 0 && canvas && uploadedImage && fabric) {
          // Trigger redo button click
          const redoButton = document.querySelector('[data-redo-button]') as HTMLButtonElement;
          if (redoButton) redoButton.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    console.log('⌨️ Keyboard shortcuts enabled: Ctrl+Z (Undo), Ctrl+Shift+Z or Ctrl+Y (Redo)');

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      console.log('🧹 Keyboard shortcuts cleaned up');
    };
  }, [canvas, uploadedImage, fabric, canvasHistory, canvasRedoStack]);

  // Add pinch-to-zoom gesture support for mobile
  useEffect(() => {
    if (!canvas || !canvasRef.current) return;

    const canvasElement = canvasRef.current;
    let initialDistance = 0;
    let initialScale = { x: 1, y: 1 };
    let activeObject: any = null;
    let isPinching = false;

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      console.log('Touch start, touches:', e.touches.length);
      if (e.touches.length === 2) {
        // Two-finger touch detected
        const obj = canvas.getActiveObject();
        console.log('Active object:', obj);
        if (obj && obj.selectable !== false) {
          e.preventDefault();
          e.stopPropagation();
          isPinching = true;
          activeObject = obj;
          initialDistance = getDistance(e.touches);
          initialScale = {
            x: activeObject.scaleX || 1,
            y: activeObject.scaleY || 1
          };
          console.log('Pinch started, initial distance:', initialDistance, 'initial scale:', initialScale);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinching && activeObject && initialDistance > 0) {
        e.preventDefault();
        e.stopPropagation();
        const currentDistance = getDistance(e.touches);
        const scale = currentDistance / initialDistance;
        console.log('Pinching, scale:', scale);

        // Apply scaling to the active object
        activeObject.set({
          scaleX: initialScale.x * scale,
          scaleY: initialScale.y * scale
        });

        canvas.requestRenderAll();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      console.log('Touch end, remaining touches:', e.touches.length);
      if (e.touches.length < 2) {
        isPinching = false;
        initialDistance = 0;
        activeObject = null;
      }
    };

    // Add listeners to the wrapper div, not just the canvas
    const canvasWrapper = canvasElement.parentElement;
    if (canvasWrapper) {
      canvasWrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvasWrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvasWrapper.addEventListener('touchend', handleTouchEnd, { passive: false });

      return () => {
        canvasWrapper.removeEventListener('touchstart', handleTouchStart);
        canvasWrapper.removeEventListener('touchmove', handleTouchMove);
        canvasWrapper.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [canvas]);

  // Selection prevention is now handled by simple CSS (same as model selection page)

  // Initialize Cropper when modal opens
  useEffect(() => {
    const initCropper = async () => {
      if (showCropper && cropperElementRef.current && !cropperRef.current) {
        // Dynamically import Cropper to avoid SSR issues
        const Cropper = (await import('cropperjs')).default;
        cropperRef.current = new Cropper(cropperElementRef.current, {
          aspectRatio: NaN, // Free aspect ratio
          viewMode: 2, // Restrict canvas to container and crop box to canvas
          dragMode: 'move',
          autoCropArea: 0.9,
          restore: false,
          guides: true,
          center: true,
          highlight: true,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
          responsive: true,
          checkOrientation: false,
          minContainerWidth: 100,
          minContainerHeight: 100,
        });
      }
    };
    
    initCropper();
    
    // Cleanup on unmount or when modal closes
    return () => {
      if (cropperRef.current) {
        cropperRef.current.destroy();
        cropperRef.current = null;
      }
    };
  }, [showCropper]);

  // Sync canvas background color with state
  useEffect(() => {
    if (!canvas) return;

    // Find the background rectangle
    const objects = canvas.getObjects();
    const background = objects.find((obj: any) =>
      obj.type === 'rect' && obj.excludeFromExport === true
    );

    // Find the white border rectangle (the one with stroke)
    const borderRect = objects.find((obj: any) =>
      obj.type === 'rect' && obj.stroke && obj.fill === 'white'
    );

    if (background) {
      background.set('fill', canvasBackgroundColor);
    }

    if (borderRect) {
      borderRect.set('fill', canvasBackgroundColor);
    }

    // Update the canvas backgroundColor to match
    canvas.backgroundColor = canvasBackgroundColor;
    canvas.renderAll();
  }, [canvasBackgroundColor, canvas]);

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && canvas && fabric) {
      const file = acceptedFiles[0];

      // Store the original file for high-quality AI edits
      setOriginalImageFile(file);

      const reader = new FileReader();

      reader.onload = (e) => {
        if (e.target?.result) {
          const imgElement = new Image();
          imgElement.crossOrigin = 'anonymous'; // Enable high-quality rendering
          imgElement.onload = function() {
            const fabricImage = new fabric.Image(imgElement, {
              // Preserve image quality
              imageSmoothing: true,
              cacheProperties: ['fill', 'stroke', 'strokeWidth', 'strokeDashArray', 'width', 'height'],
              objectCaching: true,
              statefullCache: false,
              noScaleCache: false,
              strokeUniform: false,
              dirty: true
            });

            // Remove previous image if exists
            if (uploadedImage) {
              canvas.remove(uploadedImage);
            }

            // Clear edit history when uploading a new image (fresh start)
            setEditHistory([]);

            // Scale image to fill canvas height completely (top to bottom)
            const scale = DISPLAY_HEIGHT / fabricImage.height!;
            fabricImage.scale(scale);

            // Center the image on the canvas (accounting for padding)
            fabricImage.set({
              left: CONTROL_PADDING + DISPLAY_WIDTH / 2,  // Center position horizontally
              top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,   // Center position vertically
              originX: 'center',
              originY: 'center',
              // Ensure object is selectable and manipulable
              selectable: true,
              evented: true,
              moveable: true,
              rotatable: true,
              scalable: true,
              hasControls: true,
              hasBorders: false,  // Use custom L-shaped corners instead
              borderColor: 'transparent'
            });
            
            // Add crop mode toggle functionality
            fabricImage.on('selected', () => {
              if (isCropMode && cropControls.current) {
                (fabricImage as any).controls = cropControls.current;
              } else if (normalControls.current) {
                (fabricImage as any).controls = normalControls.current;
              }
              canvas.renderAll();
            });

            // Apply the custom controls (L-shaped corners and rotation icon)
            if (normalControls.current) {
              (fabricImage as any).controls = normalControls.current;
            }

            // Add image normally - crosshairs will stay on top due to render order
            canvas.add(fabricImage);

            // Ensure background rectangle stays at the bottom
            const objects = canvas.getObjects();
            const background = objects.find((obj: any) =>
              obj.type === 'rect' && obj.excludeFromExport === true
            );
            if (background) {
              canvas.sendObjectToBack(background);
            }

            canvas.setActiveObject(fabricImage);
            canvas.renderAll();
            setUploadedImage(fabricImage);
            setHasRestoredImage(true); // Mark that we have an image (either fresh or restored)

            // Save initial state after image is uploaded so undo appears on first edit
            setTimeout(() => {
              if (fabricImage) {
                const imageSrc = (fabricImage as any).getSrc ? (fabricImage as any).getSrc() : (fabricImage as any)._element?.src;
                const initialState = {
                  src: imageSrc,
                  left: fabricImage.left,
                  top: fabricImage.top,
                  scaleX: fabricImage.scaleX,
                  scaleY: fabricImage.scaleY,
                  angle: fabricImage.angle,
                  flipX: fabricImage.flipX,
                  flipY: fabricImage.flipY,
                  opacity: fabricImage.opacity,
                  originX: fabricImage.originX,
                  originY: fabricImage.originY,
                  filters: fabricImage.filters ? [...fabricImage.filters] : [],
                  backgroundColor: canvasBackgroundColor
                };
                setCanvasHistory([JSON.stringify(initialState)]);
                console.log('📸 Initial state saved after upload');

                // CRITICAL: Also update lastSavedStateRef to prevent duplicate saves from object:modified
                // Use transform-only format (without src) to match what saveCanvasState compares against
                const transformState = {
                  left: fabricImage.left,
                  top: fabricImage.top,
                  scaleX: fabricImage.scaleX,
                  scaleY: fabricImage.scaleY,
                  angle: fabricImage.angle,
                  flipX: fabricImage.flipX,
                  flipY: fabricImage.flipY,
                  opacity: fabricImage.opacity,
                  originX: fabricImage.originX,
                  originY: fabricImage.originY,
                  filters: fabricImage.filters ? [...fabricImage.filters] : [],
                  backgroundColor: canvasBackgroundColor
                };
                lastSavedStateRef.current = JSON.stringify(transformState);
                console.log('📸 lastSavedStateRef updated to prevent duplicates');

                // Also save to sessionStorage for refresh persistence with dimensions
                // We need to do this directly because uploadedImage state hasn't updated yet
                // IMPORTANT: sessionId state may not be set yet, so read from URL or sessionStorage
                const urlParams = new URLSearchParams(window.location.search);
                const currentSessionId = urlParams.get('session') || sessionId;

                console.log('🔍 Checking if we can save to sessionStorage:', {
                  hasSessionId: !!currentSessionId,
                  sessionId: currentSessionId,
                  sessionIdFromState: sessionId,
                  sessionIdFromURL: urlParams.get('session'),
                  hasCanvas: !!canvas
                });

                if (currentSessionId && canvas) {
                  try {
                    // Log what's on canvas before saving
                    const objectsBeforeSave = canvas.getObjects();
                    console.log('📊 Objects on canvas before saving:', objectsBeforeSave.length);
                    objectsBeforeSave.forEach((obj: any, i: number) => {
                      console.log(`  Object ${i}:`, {
                        type: obj.type,
                        selectable: obj.selectable,
                        excludeFromExport: obj.excludeFromExport
                      });
                    });

                    // Include all necessary properties for proper serialization
                    // On mobile: exclude 'src' to prevent quota errors (base64 images are 1-3MB)
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    const propsToInclude = isMobile
                      ? ['selectable', 'hasControls', 'excludeFromExport', 'hasBorders', 'borderColor', 'filters', 'crossOrigin']
                      : ['selectable', 'hasControls', 'excludeFromExport', 'hasBorders', 'borderColor', 'src', 'filters', 'crossOrigin'];

                    const fullCanvasState = canvas.toJSON(propsToInclude);
                    console.log('📊 Canvas JSON objects:', fullCanvasState.objects?.length, isMobile ? '(mobile - no src)' : '(desktop - with src)');

                    sessionStorage.setItem(`canvas-state-${currentSessionId}`, JSON.stringify({
                      canvasJSON: fullCanvasState,
                      mainImageState: initialState,
                      backgroundColor: canvasBackgroundColor,
                      savedAt: Date.now(),
                      isMobile: isMobile,
                      canvasDimensions: {
                        displayWidth: DISPLAY_WIDTH,
                        displayHeight: DISPLAY_HEIGHT,
                        exportWidth: EXPORT_WIDTH,
                        exportHeight: EXPORT_HEIGHT,
                        scaleFactor: SCALE_FACTOR,
                        viewportWidth: viewportWidth,
                        viewportHeight: viewportHeight
                      }
                    }));
                    console.log('💾 Canvas state persisted to sessionStorage (dimensions saved)');
                  } catch (err) {
                    console.error('❌ Failed to save canvas to sessionStorage:', err);
                  }
                } else {
                  console.warn('⚠️ Cannot save to sessionStorage - missing sessionId or canvas');
                }
              }
            }, 100);
          };
          imgElement.src = e.target.result as string;
        }
      };

      reader.readAsDataURL(file);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif']
    },
    multiple: false,
    noClick: true,  // Disable click-to-open so buttons inside work
    noKeyboard: true
  });

  // AI Editing Functions
  const toggleDrawingMode = () => {
    if (!canvas || !fabric) return;
    
    const newDrawingMode = !drawingMode;
    setDrawingMode(newDrawingMode);
    
    if (newDrawingMode) {
      // Enable drawing mode for masking
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = 'rgba(255, 0, 0, 0.5)';
      canvas.freeDrawingBrush.width = 20;
      canvas.renderAll();
    } else {
      // Disable drawing mode
      canvas.isDrawingMode = false;
      
      // Get the drawn mask if any
      const objects = canvas.getObjects('path');
      if (objects.length > 0) {
        // Create a temporary canvas for the mask
        const maskCanvas = new fabric.StaticCanvas(null, {
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
        });
        
        // Add white background
        maskCanvas.add(new fabric.Rect({
          left: 0,
          top: 0,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          fill: 'black',
        }));
        
        // Add drawn paths as white
        objects.forEach((path: any) => {
          // Create a new path with white color
          const pathData = path.path;
          const newPath = new fabric.Path(pathData, {
            stroke: 'white',
            strokeWidth: path.strokeWidth || 20,
            fill: 'white',
            left: path.left || 0,
            top: path.top || 0,
          });
          maskCanvas.add(newPath);
        });
        
        // Export mask
        const maskDataUrl = maskCanvas.toDataURL({
          format: 'png',
          multiplier: 1 / SCALE_FACTOR,
        });
        setDrawnMask(maskDataUrl);
        
        // Remove drawing paths from main canvas
        objects.forEach((path: any) => canvas.remove(path));
        canvas.renderAll();
      }
    }
  };
  
  const clearMask = () => {
    setDrawnMask(null);
    const objects = canvas.getObjects('path');
    objects.forEach((path: any) => canvas.remove(path));
    canvas.renderAll();
  };
  
  // New mask drawing functions for AI Masking feature
  const startMaskDrawing = () => {
    if (!canvas || !fabric || !uploadedImage) return;
    
    console.log('Starting mask drawing mode');
    
    // Enable drawing mode
    setIsMaskDrawing(true);
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = 'rgba(0, 255, 0, 0.5)';  // Green for distinction
    canvas.freeDrawingBrush.width = 20;
    
    // Remove any existing handler first
    if (canvas.__maskMouseUpHandler) {
      canvas.off('mouse:up', canvas.__maskMouseUpHandler);
    }
    
    // Use path:created event which fires when a path is completed
    const handlePathCreated = (e: any) => {
      console.log('Path created event fired');
      
      // Don't check isMaskDrawing state here - it might be stale due to closure
      
      // Small delay to allow for multiple strokes if needed
      setTimeout(() => {
        // Get all drawn paths
        const objects = canvas.getObjects('path');
        console.log('Found', objects.length, 'drawn paths');
        
        if (objects.length > 0) {
          // Create mask from drawn paths - match the export size
          const exportWidth = DISPLAY_WIDTH / SCALE_FACTOR;
          const exportHeight = DISPLAY_HEIGHT / SCALE_FACTOR;
          
          const maskCanvas = new fabric.StaticCanvas(null, {
            width: exportWidth,
            height: exportHeight,
          });
          
          // Black background
          maskCanvas.add(new fabric.Rect({
            left: 0,
            top: 0,
            width: exportWidth,
            height: exportHeight,
            fill: 'black',
          }));
          
          // White mask areas - create new paths based on existing ones
          objects.forEach((path: any) => {
            // Create a new path with the same path data but white color
            const pathData = path.path;
            
            // The path is already in the correct position relative to the canvas
            // We need to adjust it to be relative to the exported area
            const adjustedLeft = (path.left || 0) - CONTROL_PADDING;
            const adjustedTop = (path.top || 0) - VERTICAL_PADDING;
            
            // Scale down the path to match the export size
            const scaledPath = new fabric.Path(pathData, {
              stroke: 'white',
              strokeWidth: (path.strokeWidth || 20) / SCALE_FACTOR,
              fill: null,  // Don't fill, just stroke
              left: adjustedLeft / SCALE_FACTOR,
              top: adjustedTop / SCALE_FACTOR,
              scaleX: 1 / SCALE_FACTOR,
              scaleY: 1 / SCALE_FACTOR,
            });
            maskCanvas.add(scaledPath);
          });
          
          // Render the mask canvas to ensure all objects are drawn
          maskCanvas.renderAll();
          
          // Export mask - already at the correct size, no scaling needed
          const maskData = maskCanvas.toDataURL({
            format: 'png',
            multiplier: 1,
          });
          setCurrentMask(maskData);
          
          // Disable drawing mode
          canvas.isDrawingMode = false;
          setIsMaskDrawing(false);
          
          // Immediately show the prompt modal
          console.log('Opening mask modal...');
          setShowMaskModal(true);
          setMaskPrompt('');
          
          // Don't remove paths yet - keep them visible so user knows what area they selected
        }
      }, 200);
    };
    
    // Listen for when a path is created (drawing completed)
    canvas.on('path:created', handlePathCreated);
    
    // Store the handler so we can remove it later
    canvas.__maskPathHandler = handlePathCreated;
  };
  
  const clearMaskDrawing = () => {
    if (!canvas) return;
    
    console.log('Clearing mask drawings...');
    
    // Clear ALL paths (including green mask drawings)
    const allObjects = canvas.getObjects();
    const pathsToRemove = allObjects.filter((obj: any) => {
      // Remove any path that looks like a mask (green color)
      if (obj.type === 'path') {
        const stroke = obj.stroke || '';
        // Check if it's a green mask path
        if (stroke.includes('rgba(0, 255, 0') || stroke.includes('rgb(0, 255, 0') || stroke === 'green') {
          return true;
        }
      }
      return false;
    });
    
    console.log('Found', pathsToRemove.length, 'mask paths to remove');
    pathsToRemove.forEach((path: any) => {
      canvas.remove(path);
    });
    
    canvas.renderAll();
    setCurrentMask(null);
    
    // Remove the event handlers if they exist
    if (canvas.__maskPathHandler) {
      canvas.off('path:created', canvas.__maskPathHandler);
      delete canvas.__maskPathHandler;
    }
    if (canvas.__maskMouseUpHandler) {
      canvas.off('mouse:up', canvas.__maskMouseUpHandler);
      delete canvas.__maskMouseUpHandler;
    }
  };
  
  const handleMaskEdit = async () => {
    if (!canvas || !maskPrompt.trim() || !currentMask) return;
    
    setIsProcessing(true);
    setAiError(null);
    
    try {
      // Save current state to history
      if (uploadedImage) {
        const imageSrc = uploadedImage.toDataURL({
          format: 'png',
          multiplier: 1,
        });
        
        const imageState = {
          src: imageSrc,
          left: uploadedImage.left,
          top: uploadedImage.top,
          scaleX: uploadedImage.scaleX,
          scaleY: uploadedImage.scaleY,
          angle: uploadedImage.angle,
          flipX: uploadedImage.flipX,
          flipY: uploadedImage.flipY,
        };
        setEditHistory(prev => [...prev, JSON.stringify(imageState)]);
      }
      
      // Get the current canvas image at the same resolution we display
      // This ensures mask alignment is correct
      let imageData = '';
      if (uploadedImage) {
        // First, hide the mask paths temporarily
        const maskPaths = canvas.getObjects().filter((obj: any) => {
          if (obj.type === 'path') {
            const stroke = obj.stroke || '';
            return stroke.includes('rgba(0, 255, 0') || stroke.includes('rgb(0, 255, 0');
          }
          return false;
        });
        maskPaths.forEach((path: any) => path.set({ visible: false }));

        // Calculate multiplier to export at EXPORT size (high resolution)
        const exportMultiplier = EXPORT_WIDTH / DISPLAY_WIDTH;

        // Create a temporary canvas to crop only the visible portion of the uploaded image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = EXPORT_WIDTH;
        tempCanvas.height = EXPORT_HEIGHT;
        const tempCtx = tempCanvas.getContext('2d')!;

        if (uploadedImage) {
          // Get the uploaded image element
          const imgElement = uploadedImage.getElement();

          // Calculate the visible bounds in canvas coordinates
          const canvasLeft = CONTROL_PADDING;
          const canvasTop = VERTICAL_PADDING;
          const canvasRight = canvasLeft + DISPLAY_WIDTH;
          const canvasBottom = canvasTop + DISPLAY_HEIGHT;

          // Get image position and scale
          const imgLeft = uploadedImage.left || 0;
          const imgTop = uploadedImage.top || 0;
          const imgScaleX = uploadedImage.scaleX || 1;
          const imgScaleY = uploadedImage.scaleY || 1;
          const imgWidth = (uploadedImage.width || 0) * imgScaleX;
          const imgHeight = (uploadedImage.height || 0) * imgScaleY;

          // Calculate crop rectangle (intersection of image and canvas bounds)
          const cropLeft = Math.max(canvasLeft, imgLeft);
          const cropTop = Math.max(canvasTop, imgTop);
          const cropRight = Math.min(canvasRight, imgLeft + imgWidth);
          const cropBottom = Math.min(canvasBottom, imgTop + imgHeight);

          // Calculate source coordinates in the original image
          const srcX = (cropLeft - imgLeft) / imgScaleX;
          const srcY = (cropTop - imgTop) / imgScaleY;
          const srcWidth = (cropRight - cropLeft) / imgScaleX;
          const srcHeight = (cropBottom - cropTop) / imgScaleY;

          console.log('🔍 AI Edit Crop Debug:');
          console.log('  Canvas bounds:', canvasLeft, canvasTop, DISPLAY_WIDTH, DISPLAY_HEIGHT);
          console.log('  Image position:', imgLeft, imgTop);
          console.log('  Image scaled size:', imgWidth, 'x', imgHeight);
          console.log('  Image scale:', imgScaleX, imgScaleY);
          console.log('  Crop rect:', cropLeft, cropTop, cropRight - cropLeft, cropBottom - cropTop);
          console.log('  Source crop from original:', srcX, srcY, srcWidth, srcHeight);
          console.log('  Exporting to:', EXPORT_WIDTH, 'x', EXPORT_HEIGHT);

          // Draw the cropped portion to temp canvas at export size
          tempCtx.drawImage(
            imgElement,
            srcX, srcY, srcWidth, srcHeight,  // Source crop
            0, 0, EXPORT_WIDTH, EXPORT_HEIGHT  // Destination (full export size)
          );

          imageData = tempCanvas.toDataURL('image/png');
          console.log('✅ Exported cropped visible portion at export size:', EXPORT_WIDTH, 'x', EXPORT_HEIGHT);
        } else {
          // Fallback: export entire canvas if no uploaded image
          imageData = canvas.toDataURL({
            format: 'png',
            left: CONTROL_PADDING,
            top: VERTICAL_PADDING,
            width: DISPLAY_WIDTH,
            height: DISPLAY_HEIGHT,
            multiplier: exportMultiplier,
          });
          console.log('Exported full canvas at export size:', EXPORT_WIDTH, 'x', EXPORT_HEIGHT);
        }

        // Show the mask paths again
        maskPaths.forEach((path: any) => path.set({ visible: true }));
        canvas.renderAll();
      }
      
      console.log('Sending mask edit with prompt:', maskPrompt);
      console.log('Mask data exists:', !!currentMask);
      
      // Call backend AI edit API with mask
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');
      const response = await fetch(`${backendUrl}/api/ai-edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageData,
          prompt: maskPrompt,
          mask: currentMask,  // Include the mask
          width: EXPORT_WIDTH,  // Send actual phone case dimensions
          height: EXPORT_HEIGHT,
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        console.log('AI Edit failed:', result.error);
        
        // Close the modal and show user-friendly alert
        setShowAIModal(false);
        setAiModalTab('custom');
        setShowMaskModal(false);
        setIsProcessing(false);
        setFiltersTouched(false);
        setAiPrompt('');
        setMaskPrompt('');
        
        // Show appropriate alert based on error type
        if (result.error?.includes('balance') || result.error?.includes('Exhausted balance') || result.error?.includes('insufficient funds')) {
          alert('💳 Insufficient funds. Please top up your AI credits to continue.');
        } else if (result.errorType === 'safety_filter' || result.error?.includes('safety filter') || result.error?.includes('safety filters')) {
          alert('⚠️ The AI safety filter was triggered. Please try with a different prompt.');
        } else if (result.error?.includes('authentication') || result.error?.includes('401') || result.error?.includes('not configured')) {
          alert('❌ API authentication failed. Service may not be configured properly.');
        } else if (result.error?.includes('rate limit') || result.error?.includes('Rate limit exceeded') || result.error?.includes('429')) {
          alert('⏱️ Rate limit exceeded. You\'ve reached your hourly limit. Please wait a moment and try again.');
        } else if (result.error?.includes('timeout') || result.error?.includes('Request timeout')) {
          alert('⏰ Request timed out. The AI service took too long to respond. Please try again.');
        } else if (result.error?.includes('quota') || result.error?.includes('Quota exceeded')) {
          alert('📊 API quota exceeded. Please try again later or contact support.');
        } else if (result.error?.includes('422') || result.error?.includes('Invalid input')) {
          alert('🖼️ Invalid image format. Please try with a different image.');
        } else if (result.error?.includes('No candidates') || result.error?.includes('No edited image')) {
          alert('🤖 The AI couldn\'t process this edit after multiple attempts. This could be due to:\n\n• Safety filters blocking the content\n• The edit being too complex\n• Temporary AI service issues\n\nPlease try:\n• Using a simpler, more specific prompt\n• Waiting a moment and trying again\n• Using a different image');
        } else {
          alert('❌ AI Edit Failed: ' + (result.error || 'Please try again or contact support if the issue persists.'));
        }
        
        return; // Exit early without throwing error
      }
      
      // Validate we received an image URL
      if (!result.imageUrl) {
        console.error('❌ No edited image URL received from mask edit API');
        setIsProcessing(false);
        setShowMaskModal(false);
        alert('❌ Failed to receive edited image. Please try again.');
        return;
      }

      // Load the edited image
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';

      // Timeout to prevent infinite loading (30 seconds)
      const maskLoadTimeout = setTimeout(() => {
        console.error('⏱️ Mask edit image load timeout');
        setIsProcessing(false);
        setShowMaskModal(false);
        alert('⏱️ Image loading timed out. Please try again.');
      }, 30000);

      const handleMaskEditLoad = function() {
        clearTimeout(maskLoadTimeout);
        console.log('🔍 AI Edit Result Debug:');
        console.log('  Received image dimensions:', imgElement.width, 'x', imgElement.height);
        console.log('  Expected EXPORT dimensions:', EXPORT_WIDTH, 'x', EXPORT_HEIGHT);
        console.log('  DISPLAY dimensions:', DISPLAY_WIDTH, 'x', DISPLAY_HEIGHT);

        // Clear the mask drawings IMMEDIATELY before doing anything else
        clearMaskDrawing();
        
        // Close modal and clean up
        setShowMaskModal(false);
        setIsProcessing(false);
        setMaskPrompt('');
        
        // Replace image
        const fabricImage = new fabric.Image(imgElement);

        if (uploadedImage) {
          canvas.remove(uploadedImage);
        }

        // The returned image is at EXPORT size (e.g., 1181x2185)
        // We need to scale it down to DISPLAY size for the canvas
        const scaleToDisplay = DISPLAY_WIDTH / imgElement.width;

        console.log('  Calculated scale to display:', scaleToDisplay);
        console.log('  Final display size will be:', imgElement.width * scaleToDisplay, 'x', imgElement.height * scaleToDisplay);

        // Position it centered on the canvas and scale to display size
        fabricImage.set({
          left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
          top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scaleToDisplay,  // Scale down from export size to display size
          scaleY: scaleToDisplay,  // Scale down from export size to display size
          // Apply custom control settings
          hasBorders: false,
          borderColor: 'transparent'
        });
        
        // Apply the custom controls (L-shaped corners and rotation icon)
        if (normalControls.current) {
          (fabricImage as any).controls = normalControls.current;
        }
        
        // Add crop mode toggle functionality
        fabricImage.on('selected', () => {
          if (isCropMode && cropControls.current) {
            (fabricImage as any).controls = cropControls.current;
          } else if (normalControls.current) {
            (fabricImage as any).controls = normalControls.current;
          }
          canvas.renderAll();
        });
        
        canvas.add(fabricImage);
        canvas.setActiveObject(fabricImage);
        canvas.renderAll();
        setUploadedImage(fabricImage);

        console.log('Mask edited image replaced at scale:', SCALE_FACTOR);

        // CRITICAL: Save to sessionStorage so mask edits persist on refresh
        setTimeout(() => {
          isRestoringState.current = false;
          saveCanvasState(fabricImage);
          console.log('💾 Mask edit persisted to sessionStorage');
        }, 100);
      };

      imgElement.onload = handleMaskEditLoad;

      imgElement.onerror = function(error) {
        clearTimeout(maskLoadTimeout);
        console.error('Failed to load edited image:', error);
        setAiError('Failed to load edited image');
        setIsProcessing(false);
        setShowMaskModal(false);
        alert('❌ Failed to load edited image. Please try again.');
      };

      imgElement.src = result.imageUrl;

      // CRITICAL FIX: Handle cached images that load synchronously
      if (imgElement.complete && imgElement.naturalHeight !== 0) {
        console.log('🚀 Mask edit image loaded from cache - handling immediately');
        handleMaskEditLoad();
      }
      
    } catch (error: any) {
      console.error('Mask Edit Error:', error);
      // Close modal and show alert
      setShowMaskModal(false);
      setIsProcessing(false);
      setMaskPrompt('');
      alert('❌ Failed to process masked edit. Please try again.');
    }
  };
  
  const handleAIEdit = async () => {
    if (!canvas || !aiPrompt.trim()) return;

    // Check AI edit limit BEFORE processing
    if (!canUseAIEdit()) {
      alert(`🚫 You've used all ${MAX_AI_EDITS} free AI edits for this session.\n\nYour design has been saved and you can still:\n• Add text and stickers\n• Apply filters\n• Submit your design for printing`);
      return;
    }

    setIsProcessing(true);
    setAiError(null);

    try {
      // Save current image state to history BEFORE making changes (for undo)
      // This is needed because we need the src for AI edit undo to reload the original image
      // Skip if history already has a recent state with the same image (prevent duplicates)
      if (uploadedImage && canvasHistory.length > 0) {
        // Get current image src for comparison
        const currentSrc = (uploadedImage as any).getSrc ? (uploadedImage as any).getSrc() : (uploadedImage as any)._element?.src;

        // Check if ANY recent state (last 3) already has a matching src
        // This handles the case where object:modified fires after upload and adds a state without src
        let hasMatchingSrc = false;
        const recentStates = canvasHistory.slice(-3); // Check last 3 states
        for (const state of recentStates) {
          try {
            const parsed = JSON.parse(state);
            if (parsed.src && parsed.src === currentSrc) {
              hasMatchingSrc = true;
              console.log('⏭️ Pre-AI-edit: Found matching src in recent history, skipping save');
              break;
            }
          } catch (e) {
            // Continue checking other states
          }
        }

        if (!hasMatchingSrc) {
          // Need to save with src for AI edit undo capability
          const imageSrc = uploadedImage.toDataURL({ format: 'png', multiplier: 1 });
          const imageState = {
            src: imageSrc,
            left: uploadedImage.left,
            top: uploadedImage.top,
            scaleX: uploadedImage.scaleX,
            scaleY: uploadedImage.scaleY,
            angle: uploadedImage.angle,
            flipX: uploadedImage.flipX,
            flipY: uploadedImage.flipY,
            opacity: uploadedImage.opacity,
            originX: uploadedImage.originX,
            originY: uploadedImage.originY,
            filters: uploadedImage.filters ? [...uploadedImage.filters] : [],
            backgroundColor: canvasBackgroundColor
          };
          const newStateStr = JSON.stringify(imageState);
          lastSavedStateRef.current = newStateStr;
          setCanvasHistory(prev => {
            console.log('📸 Saved pre-AI-edit state WITH src to canvasHistory for undo');
            return [...prev, newStateStr].slice(-20);
          });
        }
      }

      // Export the CURRENT IMAGE for AI Edit (not the entire canvas with whitespace)
      // This ensures AI edits work on the actual image content only
      // The result will be scaled to fill the canvas perfectly
      console.log('🔍 AI Edit Export: Capturing current image from canvas');

      let imageData = '';

      if (uploadedImage) {
        // Export just the uploaded image object (no whitespace)
        console.log('  Exporting uploaded image object');
        imageData = uploadedImage.toDataURL({
          format: 'png',
          quality: 1.0,
          multiplier: 1,
        });
        console.log('  Image dimensions:', uploadedImage.width, 'x', uploadedImage.height);
      } else {
        // Fallback: export entire canvas if no specific image found
        console.warn('  No uploaded image object found, exporting entire canvas');
        imageData = canvas.toDataURL({
          format: 'png',
          quality: 1.0,
          multiplier: 1,
        });
      }

      console.log('✅ Using current image for AI edit (will be scaled to fill canvas)');
      
      // Call Vertex AI image edit API
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');
      console.log('🚀 Sending AI edit request to:', `${backendUrl}/api/vertex-ai/edit-image`);
      console.log('📦 Request payload size:', imageData.length, 'bytes');

      const response = await fetch(`${backendUrl}/api/vertex-ai/edit-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: imageData,  // Vertex AI uses imageUrl instead of image
          prompt: aiPrompt,
          userId: 'editor-user', // Optional: track usage per user
        }),
      });

      console.log('📡 Response status:', response.status, response.statusText);
      console.log('📊 Response headers:', {
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
      });

      const result = await response.json();
      console.log('✅ AI Edit API Response received:', {
        success: result.success,
        hasEditedImageUrl: !!result.editedImageUrl,
        hasImageUrl: !!result.imageUrl,
        editedImageUrlLength: result.editedImageUrl?.length || 0,
        imageUrlLength: result.imageUrl?.length || 0,
      });

      if (!result.success) {
        console.log('AI Edit failed:', result.error);
        
        // Close the modal and show user-friendly alert
        setShowAIModal(false);
        setAiModalTab('custom');
        setShowMaskModal(false);
        setIsProcessing(false);
        setFiltersTouched(false);
        setAiPrompt('');
        setMaskPrompt('');
        
        // Show appropriate alert based on error type
        if (result.error?.includes('balance') || result.error?.includes('Exhausted balance') || result.error?.includes('insufficient funds')) {
          alert('💳 Insufficient funds. Please top up your AI credits to continue.');
        } else if (result.errorType === 'safety_filter' || result.error?.includes('safety filter') || result.error?.includes('safety filters')) {
          alert('⚠️ The AI safety filter was triggered. Please try with a different prompt.');
        } else if (result.error?.includes('authentication') || result.error?.includes('401') || result.error?.includes('not configured')) {
          alert('❌ API authentication failed. Service may not be configured properly.');
        } else if (result.error?.includes('rate limit') || result.error?.includes('Rate limit exceeded') || result.error?.includes('429')) {
          alert('⏱️ Rate limit exceeded. You\'ve reached your hourly limit. Please wait a moment and try again.');
        } else if (result.error?.includes('timeout') || result.error?.includes('Request timeout')) {
          alert('⏰ Request timed out. The AI service took too long to respond. Please try again.');
        } else if (result.error?.includes('quota') || result.error?.includes('Quota exceeded')) {
          alert('📊 API quota exceeded. Please try again later or contact support.');
        } else if (result.error?.includes('422') || result.error?.includes('Invalid input')) {
          alert('🖼️ Invalid image format. Please try with a different image.');
        } else if (result.error?.includes('No candidates') || result.error?.includes('No edited image')) {
          alert('🤖 The AI couldn\'t process this edit after multiple attempts. This could be due to:\n\n• Safety filters blocking the content\n• The edit being too complex\n• Temporary AI service issues\n\nPlease try:\n• Using a simpler, more specific prompt\n• Waiting a moment and trying again\n• Using a different image');
        } else {
          alert('❌ AI Edit Failed: ' + (result.error || 'Please try again or contact support if the issue persists.'));
        }
        
        return; // Exit early without throwing error
      }
      
      // Load the edited image back to canvas
      const editedImageUrl = result.editedImageUrl || result.imageUrl; // Support both response formats
      console.log('Loading edited image to canvas...');
      console.log('Image data type:', typeof editedImageUrl);
      console.log('Image data preview:', editedImageUrl?.substring(0, 100));

      if (!editedImageUrl) {
        console.error('❌ No edited image URL received from API');
        setIsProcessing(false);
        setShowAIModal(false);
        alert('❌ Failed to receive edited image. Please try again.');
        return;
      }

      // Create a new Image element first to ensure it loads
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';

      // Timeout to prevent infinite loading (30 seconds)
      const loadTimeout = setTimeout(() => {
        console.error('⏱️ Image load timeout - taking too long');
        setIsProcessing(false);
        setShowAIModal(false);
        alert('⏱️ Image loading timed out. Please try again.');
      }, 30000);

      const handleImageLoad = function() {
        clearTimeout(loadTimeout);
        console.log('🔍 AI Edit Result:');
        console.log('  Received image dimensions:', imgElement.width, 'x', imgElement.height);

        // IMMEDIATELY close modal so user can see the result
        setShowAIModal(false);
        setAiModalTab('custom');
        setIsProcessing(false);
        setAiPrompt('');
        setFiltersTouched(false);

        // Create fabric image from the loaded element
        const fabricImage = new fabric.Image(imgElement);

        // Preserve the original image's position and scale
        let targetLeft = CONTROL_PADDING + DISPLAY_WIDTH / 2;
        let targetTop = VERTICAL_PADDING + DISPLAY_HEIGHT / 2;
        let targetScaleX = 1;
        let targetScaleY = 1;
        let targetAngle = 0;

        if (uploadedImage) {
          // Save the original position and rotation
          targetLeft = uploadedImage.left || targetLeft;
          targetTop = uploadedImage.top || targetTop;
          targetAngle = uploadedImage.angle || 0;

          // Calculate scale to FILL the canvas while maintaining aspect ratio
          // Use the printable area dimensions (DISPLAY_WIDTH and DISPLAY_HEIGHT are already calculated)
          const printableWidth = DISPLAY_WIDTH;
          const printableHeight = DISPLAY_HEIGHT;

          // Calculate scale to COVER (fill) the printable area while maintaining aspect ratio
          // Using Math.max ensures the image fills the entire canvas (no black margins)
          const scaleToFitWidth = printableWidth / (fabricImage.width || 1);
          const scaleToFitHeight = printableHeight / (fabricImage.height || 1);
          const uniformScale = Math.max(scaleToFitWidth, scaleToFitHeight); // Changed from Math.min to Math.max

          targetScaleX = uniformScale;
          targetScaleY = uniformScale; // Use same scale to maintain aspect ratio

          console.log('  Preserving original position:', targetLeft, targetTop);
          console.log('  New image size:', fabricImage.width, 'x', fabricImage.height);
          console.log('  Canvas printable area:', printableWidth, 'x', printableHeight);
          console.log('  Calculated uniform scale (FILL):', uniformScale);
          console.log('  Preserving original angle:', targetAngle);

          // Block automatic state saves during image replacement
          isRestoringState.current = true;

          // Remove old image
          canvas.remove(uploadedImage);
        }

        // Place edited image at the same position/scale as original
        fabricImage.set({
          left: targetLeft,
          top: targetTop,
          originX: 'center',
          originY: 'center',
          scaleX: targetScaleX,
          scaleY: targetScaleY,
          angle: targetAngle,
          // Apply custom control settings
          hasBorders: false,
          borderColor: 'transparent'
        });

        // Apply the custom controls (L-shaped corners and rotation icon)
        if (normalControls.current) {
          (fabricImage as any).controls = normalControls.current;
        }

        // Add crop mode toggle functionality for AI edited images
        fabricImage.on('selected', () => {
          if (isCropMode && cropControls.current) {
            (fabricImage as any).controls = cropControls.current;
          } else if (normalControls.current) {
            (fabricImage as any).controls = normalControls.current;
          }
          canvas.renderAll();
        });

        console.log('  Adding edited image to canvas');
        canvas.add(fabricImage);
        canvas.setActiveObject(fabricImage);
        canvas.renderAll();
        setUploadedImage(fabricImage);

        // Increment AI edit counter after successful edit
        incrementAIEditCount();

        // CRITICAL: Update originalImageFile so next AI edit uses this edited version (sequential editing)
        // Convert the edited image data URL to a File object
        fetch(result.editedImageUrl)
          .then(res => res.blob())
          .then(blob => {
            const editedFile = new File([blob], 'ai-edited-image.png', { type: 'image/png' });
            setOriginalImageFile(editedFile);
            console.log('✅ Updated originalImageFile for sequential AI edits');
          })
          .catch(err => {
            console.error('⚠️ Failed to update originalImageFile:', err);
            // Not critical - next edit will just use canvas export instead
          });

        // Save state after AI edit completes (new image added)
        // Keep isRestoringState=true during this to block automatic event-driven saves
        setTimeout(() => {
          if (fabricImage) {
            const imageSrc = (fabricImage as any).getSrc ? (fabricImage as any).getSrc() : (fabricImage as any)._element?.src;
            const newState = {
              src: imageSrc,
              left: fabricImage.left,
              top: fabricImage.top,
              scaleX: fabricImage.scaleX,
              scaleY: fabricImage.scaleY,
              angle: fabricImage.angle,
              flipX: fabricImage.flipX,
              flipY: fabricImage.flipY,
              opacity: fabricImage.opacity,
              originX: fabricImage.originX,
              originY: fabricImage.originY,
              filters: fabricImage.filters ? [...fabricImage.filters] : [],
              backgroundColor: canvasBackgroundColor
            };
            const newStateStr = JSON.stringify(newState);

            // Use ref for duplicate check (React batching causes setCanvasHistory to see stale prev)
            if (lastSavedStateRef.current === newStateStr) {
              console.log('⏭️ Post-AI-edit state already saved (ref check), skipping');
            } else {
              // Update ref synchronously BEFORE React state update
              lastSavedStateRef.current = newStateStr;

              setCanvasHistory(prev => {
                console.log('📸 Post-AI-edit state WITH src saved to canvasHistory');
                return [...prev, newStateStr].slice(-20);
              });
            }

            // CRITICAL: Ensure restoration flag is false before saving to sessionStorage
            isRestoringState.current = false;

            // Save to sessionStorage ONLY - skip history save since we already added state with src above
            saveCanvasState(fabricImage, true);
            console.log('💾 AI edit persisted to sessionStorage (history save skipped)');
          }
        }, 100);

        console.log('Image successfully added to canvas');
      };

      imgElement.onload = handleImageLoad;

      imgElement.onerror = function(error) {
        clearTimeout(loadTimeout);
        console.error('Failed to load image element:', error);
        setAiError('Failed to load edited image');
        setIsProcessing(false);
        setShowAIModal(false);
        alert('❌ Failed to load edited image. Please try again.');
      };

      // Set the source to trigger loading
      imgElement.src = editedImageUrl;

      // CRITICAL FIX: Handle cached images that load synchronously
      // If image is already loaded from cache before onload handler attached
      if (imgElement.complete && imgElement.naturalHeight !== 0) {
        console.log('🚀 Image loaded from cache - handling immediately');
        handleImageLoad();
      }
      
    } catch (error: any) {
      console.error('AI Edit Error:', error);
      // Close modal and show alert
      setShowAIModal(false);
      setAiModalTab('custom');
      setIsProcessing(false);
      setAiPrompt('');
      setFiltersTouched(false);

      // Check if error is network/server issue
      if (error.message?.includes('fetch') || error.message?.includes('NetworkError') || error.code === 'ECONNREFUSED') {
        alert('⚠️ Backend server is offline. Please start the backend server and try again.');
      } else {
        alert('❌ Failed to process image. Please try again.');
      }
    }
  };
  
  // Apply filters to the main uploaded image
  const applyFilters = () => {
    if (!uploadedImage || !fabric || !canvas) return;

    const filters: any[] = [];

    // Access filters directly from the fabric module
    const ImageFilters = (fabric as any).filters;
    if (!ImageFilters) {
      console.error('Image filters not available');
      return;
    }

    // Brightness filter
    if (brightness !== 0) {
      filters.push(new ImageFilters.Brightness({ brightness }));
    }

    // Contrast filter
    if (contrast !== 0) {
      filters.push(new ImageFilters.Contrast({ contrast }));
    }

    // Saturation filter
    if (saturation !== 0) {
      filters.push(new ImageFilters.Saturation({ saturation }));
    }

    // Blur filter
    if (blur > 0) {
      filters.push(new ImageFilters.Blur({ blur: blur * 0.5 }));
    }

    // Sharpness (using Convolute matrix)
    if (sharpness > 0) {
      const sharpnessMatrix = [
        0, -1 * sharpness, 0,
        -1 * sharpness, 1 + 4 * sharpness, -1 * sharpness,
        0, -1 * sharpness, 0
      ];
      filters.push(new ImageFilters.Convolute({ matrix: sharpnessMatrix }));
    }

    // Warmth (using HueRotation - approximate warm/cool)
    if (warmth !== 0) {
      filters.push(new ImageFilters.HueRotation({ rotation: warmth * 0.1 }));
    }

    uploadedImage.filters = filters;
    uploadedImage.applyFilters();
    canvas.renderAll();

    // Save state after filters are applied (filters don't trigger object:modified)
    setTimeout(() => saveCanvasState(), 100);
  };

  const resetFilters = () => {
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setBlur(0);
    setSharpness(0);
    setWarmth(0);
    setIsBlackAndWhite(false);
    setCanvasBackgroundColor('transparent');

    if (uploadedImage && canvas) {
      uploadedImage.filters = [];
      uploadedImage.applyFilters();

      // Reset background rectangle to transparent
      const objects = canvas.getObjects();
      const background = objects.find((obj: any) =>
        obj.type === 'rect' && obj.excludeFromExport === true
      );
      if (background) {
        background.set('fill', 'transparent');
      }

      canvas.renderAll();
    }
  };

  const handleCreateAIImage = async () => {
    if (!canvas || !createPrompt.trim()) return;

    // Check AI edit limit BEFORE processing
    if (!canUseAIEdit()) {
      alert(`🚫 You've used all ${MAX_AI_EDITS} free AI edits for this session.\n\nYour design has been saved and you can still:\n• Add text and stickers\n• Apply filters\n• Submit your design for printing`);
      return;
    }

    setIsProcessing(true);
    setAiError(null);

    // Set restoration flag to prevent saving canvas state during AI image replacement
    // This prevents the removal of the old image from triggering a save
    isRestoringState.current = true;
    console.log('🔒 Blocking state saves during AI image generation');

    try {
      // REMOVED: Don't save old image to history when generating brand new AI image
      // History will start fresh with the newly generated image
      // This prevents undo from bringing back the old deleted image
      // Call backend AI create API
      // Use relative URL if on same domain, otherwise use configured backend
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');
      const response = await fetch(`${backendUrl}/api/ai-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: createPrompt,
          width: EXPORT_WIDTH,  // Use actual phone case dimensions, not display dimensions
          height: EXPORT_HEIGHT,
        }),
      });
      
      const result = await response.json();

      if (!result.success) {
        console.log('AI Create failed:', result.error);

        // Stop processing but keep modal open so user can see their prompt
        setIsProcessing(false);

        // Show appropriate alert based on error type
        if (result.error?.includes('not available') || result.error?.includes('NOT_IMPLEMENTED')) {
          alert('ℹ️ ' + (result.error || 'This feature is not available. Please use AI Edit with an existing image instead.'));
        } else if (result.error?.includes('balance') || result.error?.includes('Exhausted balance') || result.error?.includes('insufficient funds')) {
          alert('💳 Insufficient funds. Please top up your AI credits to continue.');
        } else if (result.error?.includes('safety filter') || result.error?.includes('safety filters')) {
          alert('⚠️ The AI safety filter was triggered. Please try with a different prompt.');
        } else if (result.error?.includes('authentication') || result.error?.includes('401') || result.error?.includes('not configured')) {
          alert('❌ API authentication failed. Service may not be configured properly.');
        } else if (result.error?.includes('rate limit') || result.error?.includes('Rate limit exceeded') || result.error?.includes('429')) {
          alert('⏱️ Rate limit exceeded. You\'ve reached your hourly limit. Please wait a moment and try again.');
        } else if (result.error?.includes('timeout') || result.error?.includes('Request timeout')) {
          alert('⏰ Request timed out. The AI service took too long to respond. Please try again.');
        } else if (result.error?.includes('No candidates') || result.error?.includes('No edited image')) {
          alert('🤖 The AI couldn\'t process this request. This could be due to safety filters or the complexity of the request. Please try a simpler prompt.');
        } else {
          alert('❌ AI Generation Failed: ' + (result.error || 'Please try again or contact support if the issue persists.'));
        }

        return; // Exit early without throwing error
      }

      // Extract the generated image URL from the response
      const generatedImageUrl = result.imageUrl;
      console.log('Loading generated image to canvas...');

      // Validate we received an image URL
      if (!generatedImageUrl) {
        console.error('❌ No generated image URL received from API');
        setIsProcessing(false);
        alert('❌ Failed to receive generated image. Please try again.');
        return;
      }

      // Create a new Image element first to ensure it loads
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';

      // Timeout to prevent infinite loading (30 seconds)
      const loadTimeout = setTimeout(() => {
        console.error('⏱️ Generated image load timeout');
        setIsProcessing(false);
        // Re-enable state saves on timeout
        isRestoringState.current = false;
        console.log('🔓 State saves re-enabled after timeout');
        alert('⏱️ Image loading timed out. Please try again.');
      }, 30000);

      const handleGeneratedImageLoad = function() {
        clearTimeout(loadTimeout);
        console.log('Generated image loaded, dimensions:', imgElement.width, 'x', imgElement.height);
        
        // Clear processing state and prompt
        setIsProcessing(false);
        setCreatePrompt('');
        
        // Create fabric image from the loaded element
        const fabricImage = new fabric.Image(imgElement);
        
        // Remove current image if exists
        if (uploadedImage) {
          console.log('🗑️ Removing old image during AI generation (state saves blocked)');
          canvas.remove(uploadedImage);
        }

        // Position the new image (already at correct canvas dimensions from backend)
        // Scale to match canvas size exactly - fills canvas perfectly
        const scaleX = DISPLAY_WIDTH / fabricImage.width!;
        const scaleY = DISPLAY_HEIGHT / fabricImage.height!;

        fabricImage.set({
          left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
          top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scaleX,
          scaleY: scaleY,
          // Apply custom control settings
          hasBorders: false,
          borderColor: 'transparent'
        });

        // Apply normal controls (L-shaped corners) to AI generated images
        if (normalControls.current) {
          (fabricImage as any).controls = normalControls.current;
        }
        
        canvas.add(fabricImage);
        canvas.setActiveObject(fabricImage);
        canvas.renderAll();
        console.log('➕ New AI image added to canvas');
        setUploadedImage(fabricImage);

        // Increment AI edit counter after successful image generation
        incrementAIEditCount();

        // Clear restoration flag and save initial state for undo/redo
        // Pass fabricImage directly to avoid React async state update issues
        setTimeout(() => {
          isRestoringState.current = false;
          console.log('🔓 State saves re-enabled after AI image generation complete');
          // Save the initial state to enable undo (pass fabricImage directly!)
          console.log('💾 Saving initial state of new AI image');
          saveCanvasState(fabricImage);
        }, 200);

        // Add crop mode toggle functionality for AI generated images
        fabricImage.on('selected', () => {
          if (isCropMode && cropControls.current) {
            (fabricImage as any).controls = cropControls.current;
          } else if (normalControls.current) {
            (fabricImage as any).controls = normalControls.current;
          }
          canvas.renderAll();
        });
        
        console.log('Generated image successfully added to canvas');
      };

      imgElement.onload = handleGeneratedImageLoad;

      imgElement.onerror = function(error) {
        clearTimeout(loadTimeout);
        console.error('Failed to load generated image:', error);
        setAiError('Failed to load generated image');
        setIsProcessing(false);
        // Re-enable state saves on error
        isRestoringState.current = false;
        console.log('🔓 State saves re-enabled after image load error');
        alert('❌ Failed to load generated image. Please try again.');
      };

      // Set the source to trigger loading
      imgElement.src = generatedImageUrl;

      // CRITICAL FIX: Handle cached images that load synchronously
      if (imgElement.complete && imgElement.naturalHeight !== 0) {
        console.log('🚀 Generated image loaded from cache - handling immediately');
        handleGeneratedImageLoad();
      }
      
    } catch (error: any) {
      console.error('AI Create Error:', error);
      // Show alert and reset state
      setIsProcessing(false);
      setCreatePrompt('');
      // Re-enable state saves on error
      isRestoringState.current = false;
      console.log('🔓 State saves re-enabled after AI generation error');
      alert('❌ Failed to generate image. Please try again.');
    }
  };
  
  const undoCrop = () => {
    if (cropHistory.length === 0 || !canvas || !fabric) return;
    
    console.log('Undo Crop: History length before:', cropHistory.length);
    
    // Get the previous crop state (last item in history)
    const previousCropStateStr = cropHistory[cropHistory.length - 1];
    console.log('Undo Crop: Previous state exists:', !!previousCropStateStr);
    
    // Remove the last state from crop history
    setCropHistory(prev => prev.slice(0, -1));
    
    // Remove the current uploaded image
    if (uploadedImage) {
      console.log('Undo Crop: Removing current image');
      canvas.remove(uploadedImage);
      setUploadedImage(null);
    }
    
    // Restore the previous crop state using Image element approach
    console.log('Undo Crop: Creating image element from previous data...');
    const imgElement = new Image();
    imgElement.crossOrigin = 'anonymous';
    
    imgElement.onload = () => {
      console.log('Undo Crop: Image element loaded, creating fabric image...');
      const restoredImg = new fabric.Image(imgElement);
      console.log('Undo Crop: Restored fabric image created:', restoredImg);
      
      // Scale image to fit within display canvas if needed
      const maxDisplayWidth = DISPLAY_WIDTH * 0.8;  // 80% of canvas width
      const maxDisplayHeight = DISPLAY_HEIGHT * 0.8; // 80% of canvas height
      const scale = Math.min(maxDisplayWidth / restoredImg.width!, maxDisplayHeight / restoredImg.height!);
      if (scale < 1) {
        restoredImg.scale(scale);
      }
      
      // Center the restored image on the canvas (accounting for padding)
      restoredImg.set({
        left: CONTROL_PADDING + DISPLAY_WIDTH / 2,  // Center position with padding
        top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,   // Center position with padding
        originX: 'center',
        originY: 'center',
        // Apply custom control settings to this specific image
        hasBorders: false,
        borderColor: 'transparent'
      });
      
      // Apply normal controls to the restored image
      restoredImg.controls = normalControls.current;
      
      // Add the restored image back to canvas
      canvas.add(restoredImg);
      canvas.setActiveObject(restoredImg);
      setUploadedImage(restoredImg);
      canvas.renderAll();
      
      console.log('Undo Crop: Image restored successfully');
    };
    
    imgElement.onerror = (error) => {
      console.error('Undo Crop: Failed to load previous image:', error);
    };
    
    imgElement.src = previousCropStateStr;
  };

  const undoLastEdit = () => {
    if (editHistory.length === 0 || !canvas || !fabric) return;
    
    console.log('Undo: History length before:', editHistory.length);
    
    // Get the previous state (last item in history)
    const previousStateStr = editHistory[editHistory.length - 1];
    console.log('Undo: Previous state exists:', !!previousStateStr);
    
    // Remove the last state from history
    setEditHistory(prev => prev.slice(0, -1));
    
    // Remove the current uploaded image
    if (uploadedImage) {
      console.log('Undo: Removing current image');
      canvas.remove(uploadedImage);
      setUploadedImage(null);
    }
    
    // If we have a previous state, restore it
    if (previousStateStr && previousStateStr !== '') {
      try {
        const previousState = JSON.parse(previousStateStr);
        console.log('Undo: Restoring previous state:', previousState);
        
        // Create an image element first
        const imgElement = new Image();
        imgElement.crossOrigin = 'anonymous';
        
        imgElement.onload = function() {
          console.log('Undo: Previous image loaded, dimensions:', imgElement.width, 'x', imgElement.height);
          
          // Create fabric image from the element
          const fabricImage = new fabric.Image(imgElement);
          
          // Calculate standard scale to fit within 80% of canvas
          const maxDisplayWidth = DISPLAY_WIDTH * 0.8;
          const maxDisplayHeight = DISPLAY_HEIGHT * 0.8;
          const standardScale = Math.min(
            maxDisplayWidth / fabricImage.width!,
            maxDisplayHeight / fabricImage.height!
          );
          
          // Restore with consistent sizing and centered position
          fabricImage.set({
            left: CONTROL_PADDING + DISPLAY_WIDTH / 2,  // Always center horizontally
            top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,  // Always center vertically
            originX: 'center',
            originY: 'center',
            scaleX: standardScale,  // Use standard scale instead of saved scale
            scaleY: standardScale,  // Use standard scale instead of saved scale
            angle: previousState.angle || 0,  // Keep rotation if any
            flipX: previousState.flipX || false,
            flipY: previousState.flipY || false,
            // Apply custom control settings
            hasBorders: false,
            borderColor: 'transparent'
          });
          
          // Apply the custom controls (L-shaped corners and rotation icon)
          if (normalControls.current) {
            (fabricImage as any).controls = normalControls.current;
          }
          
          // Add crop mode toggle functionality
          fabricImage.on('selected', () => {
            if (isCropMode && cropControls.current) {
              (fabricImage as any).controls = cropControls.current;
            } else if (normalControls.current) {
              (fabricImage as any).controls = normalControls.current;
            }
            canvas.renderAll();
          });
          
          canvas.add(fabricImage);
          canvas.setActiveObject(fabricImage);
          setUploadedImage(fabricImage);
          canvas.renderAll();
          
          console.log('Undo: Image restored successfully at standard size and centered position');
        };
        
        imgElement.onerror = function() {
          console.error('Undo: Failed to load previous state image from src:', previousState.src?.substring(0, 50));
          canvas.renderAll();
        };
        
        // Set the source to load the image
        imgElement.src = previousState.src;
      } catch (e) {
        console.error('Undo: Failed to parse previous state:', e);
        canvas.renderAll();
      }
    } else {
      console.log('Undo: No previous state to restore');
      canvas.renderAll();
    }
  };

  const handleSubmit = async () => {
    // DEMO MODE: Allow preview to show, but block actual submission later
    if (!machineId) {
      console.log('🎮 Demo Mode: Showing preview (submission will be blocked)');
    }

    if (canvas) {
      // Prevent double-clicks
      if (isUploading) {
        console.log('⚠️ Already submitting, please wait...');
        return;
      }

      try {
        setIsUploading(true);
        setDebugInfo('Preparing design for submission...');
        // First, temporarily hide crosshair lines
        const originalVerticalVisible = crosshairLines.vertical?.visible;
        const originalHorizontalVisible = crosshairLines.horizontal?.visible;
        if (crosshairLines.vertical) crosshairLines.vertical.visible = false;
        if (crosshairLines.horizontal) crosshairLines.horizontal.visible = false;
        
        // Also hide the border rect
        const borderRect = canvas.getObjects().find((obj: any) =>
          obj.type === 'rect' && obj.stroke === '#333' && obj.fill === 'white'
        );
        const originalBorderVisible = borderRect?.visible;
        if (borderRect) borderRect.visible = false;

        // Export the canvas directly
        canvas.renderAll();

        // Export at exact dimensions needed for printing
        // Calculate multiplier to reach exact export dimensions
        const exportMultiplier = EXPORT_WIDTH / DISPLAY_WIDTH;

        console.log(`📐 Exporting for ${phoneModel?.displayName || 'default'} model`);
        console.log(`Display: ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}px, Export: ${EXPORT_WIDTH}x${EXPORT_HEIGHT}px`);
        console.log(`Export multiplier: ${exportMultiplier}x`);

        // Temporarily remove clipPath to avoid tainted canvas during export
        // (The print_img clipPath can taint the canvas even through proxy)
        const savedClipPath = canvas.clipPath;
        canvas.clipPath = undefined;

        // First, export the canvas design (rectangular, no rounded corners)
        const designDataURL = canvas.toDataURL({
          format: 'png',
          quality: 1.0,
          left: CONTROL_PADDING,
          top: VERTICAL_PADDING,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          multiplier: exportMultiplier,
          enableRetinaScaling: false,
          withoutTransform: false,
          withoutShadow: true
        });

        // Restore clipPath for visual display
        canvas.clipPath = savedClipPath;

        // APPLY MASKING: Composite design with print mask to create camera cutouts
        let dataURL = designDataURL;

        // Get print mask from either phone-models.ts or Chitu API (stored in sessionStorage)
        const printMaskUrl = phoneModel?.printMaskPath || sessionStorage.getItem('selectedPhoneModelPrintImg');

        if (printMaskUrl) {
          console.log('🎭 Applying print mask:', printMaskUrl);

          // Load the print mask (BLACK = design area, WHITE/TRANSPARENT = cutouts)
          const maskImage = new Image();
          maskImage.crossOrigin = 'anonymous';

          // Wait for mask to load
          await new Promise<void>((resolve, reject) => {
            maskImage.onload = () => {
              console.log('✅ Print mask loaded:', maskImage.width, 'x', maskImage.height);

              // Use phone model dimensions if available, otherwise use mask image dimensions
              // This handles dynamic models from Chitu API that don't have local dimension data
              const finalWidth = phoneModel?.dimensions?.widthPX || maskImage.width;
              const finalHeight = phoneModel?.dimensions?.heightPX || maskImage.height;
              console.log('🎯 Compositing at:', finalWidth, 'x', finalHeight, phoneModel?.dimensions ? '(from model)' : '(from mask image)');

              // Create a temporary canvas for compositing at mask resolution
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = finalWidth;
              tempCanvas.height = finalHeight;
              const ctx = tempCanvas.getContext('2d')!;

              // Load the design image
              const designImage = new Image();
              designImage.onload = () => {
                console.log('✅ Design loaded:', designImage.width, 'x', designImage.height);

                // Chitu print mask format: BLACK = design area, WHITE = camera cutouts (transparent)
                // Step 1: Draw user's design first
                ctx.drawImage(designImage, 0, 0, finalWidth, finalHeight);
                console.log('✅ Drew design at full resolution');

                // Step 2: Apply mask using its existing alpha channel
                // Transparent areas in mask = camera cutouts (stay transparent)
                // Opaque (black) areas in mask = phone case shape (show design)
                ctx.globalCompositeOperation = 'destination-in';
                ctx.drawImage(maskImage, 0, 0, finalWidth, finalHeight);
                console.log('✅ Applied mask - camera cutouts created');

                // Export as PNG to preserve transparency
                dataURL = tempCanvas.toDataURL('image/png');
                console.log('✅ Final masked image:', finalWidth, 'x', finalHeight, 'PNG with transparency');
                resolve();
              };
              designImage.onerror = reject;
              designImage.src = designDataURL;
            };
            maskImage.onerror = () => {
              console.warn('⚠️ Failed to load print mask, using unmasked design');
              resolve(); // Continue without mask if it fails to load
            };
            maskImage.src = printMaskUrl;
          });
        }
        
        // Check size and warn if too large
        const sizeInBytes = dataURL.length * 0.75; // Approximate size in bytes
        const sizeInMB = sizeInBytes / 1024 / 1024;
        console.log(`📦 Image size: ${sizeInMB.toFixed(2)} MB`);
        
        // Vercel has a 4.5MB limit for API requests
        const maxSizeMB = 4.0; // Stay under 4MB to be safe
        
        if (sizeInMB > maxSizeMB) {
          alert(`Image too large (${sizeInMB.toFixed(1)}MB). Maximum is ${maxSizeMB}MB for web upload. Please use a smaller photo.`);
          setDebugInfo(`Failed: Image ${sizeInMB.toFixed(1)}MB > ${maxSizeMB}MB limit`);
          return;
        }
        
        // Use SAME high-quality image for printer (no separate JPEG conversion)
        // This prevents quality loss from format conversion
        const jpegDataURL = dataURL;
        
        // Restore crosshair and border visibility
        if (crosshairLines.vertical) crosshairLines.vertical.visible = originalVerticalVisible;
        if (crosshairLines.horizontal) crosshairLines.horizontal.visible = originalHorizontalVisible;
        if (borderRect) borderRect.visible = originalBorderVisible;
        canvas.renderAll();
        
        // Debug: Check if image is actually in the export
        console.log('=== CANVAS EXPORT DEBUG ===');
        console.log('Canvas dimensions:', { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT });
        console.log('Canvas aspect ratio:', DISPLAY_WIDTH / DISPLAY_HEIGHT);
        console.log('Canvas objects before export:', canvas.getObjects().map((obj: any) => ({
          type: obj.type,
          visible: obj.visible,
          left: obj.left,
          top: obj.top,
          width: obj.width,
          height: obj.height,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY
        })));
        
        // Check what's visible in the canvas bounds (accounting for padding)
        const visibleObjects = canvas.getObjects().filter((obj: any) => {
          if (!obj.visible) return false;
          const bounds = obj.getBoundingRect();
          return bounds.left < CONTROL_PADDING + DISPLAY_WIDTH && 
                 bounds.top < VERTICAL_PADDING + DISPLAY_HEIGHT && 
                 bounds.left + bounds.width > CONTROL_PADDING && 
                 bounds.top + bounds.height > VERTICAL_PADDING;
        });
        console.log('Objects visible in canvas bounds:', visibleObjects.length);
        
        // Create a test export to verify content
        const testExport = canvas.toDataURL({
          format: 'png',
          left: CONTROL_PADDING,
          top: VERTICAL_PADDING,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          multiplier: 1
        });
        console.log('Test export (100x200) data URL length:', testExport.length);
        console.log('Test export starts with:', testExport.substring(0, 50));
        
        // Debug: Check data URL
        console.log('High-quality PNG multiplier:', exportMultiplier);
        console.log('Export size:', `${DISPLAY_WIDTH * exportMultiplier}x${DISPLAY_HEIGHT * exportMultiplier}`);
        console.log('PNG data URL starts with:', dataURL.substring(0, 50));
        console.log('PNG data size:', dataURL.length);
        
        // Get canvas state for debugging
        const canvasData = {
          objects: canvas.getObjects().filter((obj: any) => {
            // Filter out UI elements
            return obj !== crosshairLines.vertical && 
                   obj !== crosshairLines.horizontal && 
                   !(obj.type === 'rect' && obj.stroke === '#333' && obj.fill === 'transparent');
          }).map((obj: any) => ({
          type: obj.type,
          left: obj.left,
          top: obj.top,
          width: obj.width,
          height: obj.height,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          angle: obj.angle,
          fill: obj.fill,
          stroke: obj.stroke,
          strokeWidth: obj.strokeWidth,
          src: obj.type === 'image' ? obj.getSrc() : undefined
        })),
          width: DISPLAY_WIDTH,   // 100px = 100mm exact
          height: DISPLAY_HEIGHT, // 200px = 200mm exact
          backgroundColor: 'white'
        };
        
        // Prepare preview data (no backend upload yet)
        console.log('📋 Preparing preview...');
        setDebugInfo(`Preparing preview...`);

        // Save canvas state as JSON to restore all layers when going back
        const canvasJSON = canvas.toJSON([
          'selectable',
          'hasControls',
          'excludeFromExport',
          'hasBorders',
          'borderColor',
          'src',  // Critical for images!
          'filters',
          'crossOrigin'
        ]);
        console.log('💾 Saved canvas state with', canvas.getObjects().length, 'objects');

        // Store preview data in global window object (too large for sessionStorage)
        // NOTE: Masking is NOW ENABLED - design has camera cutouts applied
        // Get dynamic product_id (fetched from API) or fallback to hardcoded
        const dynamicProductId = sessionStorage.getItem('selectedPhoneModelProductId');
        const finalProductId = dynamicProductId || phoneModel?.chituProductId;

        console.log('📦 Product ID selection:', {
          dynamicFromAPI: dynamicProductId,
          hardcodedFallback: phoneModel?.chituProductId,
          finalUsed: finalProductId,
          source: dynamicProductId ? 'API (dynamic)' : 'phone-models.ts (hardcoded)'
        });

        // Preview data for confirmation page
        const previewData = {
          designImage: dataURL, // Masked design WITH camera cutouts applied
          canvasState: canvasJSON, // Save full canvas state for restoration
          phoneTemplate: phoneModel?.thumbnailPath || null, // WebP thumbnail for UI preview
          phoneName: phoneModel?.displayName || 'Custom Phone Case',
          submissionData: {
            image: dataURL, // Send masked design to printer (WITH camera cutouts)
            machineId: machineId,
            sessionId: sessionId || `session_${Date.now()}`,
            phoneModel: phoneModel?.displayName || 'Default Phone Case',
            phoneModelId: phoneModel?.id || 'default',
            // Use DYNAMIC product_id from sessionStorage (fetched from API), not hardcoded
            productId: finalProductId,
            dimensions: {
              widthPX: EXPORT_WIDTH,
              heightPX: EXPORT_HEIGHT,
              widthMM: phoneModel?.dimensions?.widthMM || DEFAULT_WIDTH_MM,
              heightMM: phoneModel?.dimensions?.heightMM || DEFAULT_HEIGHT_MM
            }
          }
        };

        // Store preview image for modal
        setPreviewImage(dataURL);

        // Store submission data for payment completion
        (window as any).__submissionData = previewData.submissionData;

        console.log('✅ Showing preview modal...');
        setIsUploading(false);

        // Show preview modal instead of navigating
        setShowPreviewModal(true);

        // Persist preview modal state in sessionStorage
        // NOTE: We do NOT lock the session here - preview is just a modal overlay
        // Session only gets locked when user submits and goes to waiting/payment page
        // NOTE: We do NOT store images or canvas data in sessionStorage - they're too large (1-2MB each)
        // All data is already stored in React state and window.__submissionData
        if (sessionId) {
          try {
            sessionStorage.setItem(`page-state-${sessionId}`, 'preview');
            // Do NOT store submissionData - it contains base64 images that are too large
            // All necessary data is in React state (previewImage) and window object (__submissionData)
            console.log('💾 Persisted preview page state to sessionStorage for session:', sessionId);
            console.log('📦 Submission data stored in memory (window.__submissionData) - too large for sessionStorage');
          } catch (error) {
            console.error('⚠️ Failed to persist preview state to sessionStorage:', error);
            // Continue anyway - the preview will still work from React state and window object
          }
        } else {
          console.error('❌ Cannot persist preview state - sessionId is null!');
        }
      } catch (error) {
        console.error('Error submitting design:', error);
        alert('Failed to submit design');
      }
    }
  };

  // Session Expired Overlay - shows on top of any page when session times out (30 min)
  if (showSessionExpired) {
    return (
      <>
        <Head>
          <title>Session Expired - SweetRobo</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-touch-fullscreen" content="yes" />
          <meta name="format-detection" content="telephone=no" />
          <style dangerouslySetInnerHTML={{__html: `
            * {
              -webkit-touch-callout: none !important;
              -webkit-user-select: none !important;
              -webkit-tap-highlight-color: transparent !important;
              user-select: none !important;
            }
          `}} />
        </Head>
        <div className="fixed inset-0 bg-black bg-opacity-80 z-[9999] flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
            {/* Timer Icon */}
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="13" r="8" stroke="#6B7280" strokeWidth="2" fill="none"/>
                  <path d="M12 9v4l2.5 2.5" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 3h6" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 3v2" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-3">Session Expired</h1>

            <p className="text-gray-600 mb-6 leading-relaxed">
              Your session has timed out after 30 minutes of inactivity.
            </p>

            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5 mb-6">
              <div className="text-4xl mb-3">📱</div>
              <p className="text-purple-800 font-semibold">
                Scan the QR code on the machine to start a new session
              </p>
            </div>

            {isDemoMode && (
              <button
                onClick={() => {
                  // In demo mode, allow starting a new session
                  router.push('/select-model?demo=true');
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold py-3 px-6 rounded-lg transition shadow-md"
              >
                Start New Demo Session
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  // Show loading screen while checking session OR show Waiting/Thank You pages
  if (isCheckingSession || showWaitingForPayment || showThankYou) {
    // If still checking, show loading
    if (isCheckingSession) {
      return (
        <>
          <Head>
            <title>SweetRobo CaseBot</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-touch-fullscreen" content="yes" />
            <meta name="format-detection" content="telephone=no" />
            <style dangerouslySetInnerHTML={{__html: `
              * {
                -webkit-touch-callout: none !important;
                -webkit-user-select: none !important;
                -webkit-tap-highlight-color: transparent !important;
                user-select: none !important;
              }
            `}} />
          </Head>
          <div className="h-screen text-white flex flex-col items-center justify-center p-6">
            <div className="glass-panel p-8 text-center floating-element">
              <img src="/icons/sweetrobo-logo.gif" alt="SweetRobo" className="w-24 h-24 mx-auto mb-6" />
              <div className="text-2xl mb-4" style={{background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>Loading...</div>
            </div>
          </div>
        </>
      );
    }

    // Show Waiting for Payment page (first page after submission)
    if (showWaitingForPayment) {
      return (
      <>
        <Head>
          <title>Waiting for Payment - SweetRobo</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-touch-fullscreen" content="yes" />
          <meta name="format-detection" content="telephone=no" />
          <style dangerouslySetInnerHTML={{__html: `
            * {
              -webkit-touch-callout: none !important;
              -webkit-user-select: none !important;
              -webkit-tap-highlight-color: transparent !important;
              user-select: none !important;
            }
          `}} />
        </Head>
        <div className="min-h-screen bg-white flex items-center justify-center p-5">
          <div className="max-w-md w-full text-center">
            {/* Animated Hourglass/Waiting Icon */}
            <div className="mb-8">
              <div className="inline-block animate-bounce">
                <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="50" cy="50" r="40" stroke="#9333EA" strokeWidth="4" fill="none" opacity="0.2"/>
                  <circle cx="50" cy="50" r="40" stroke="#9333EA" strokeWidth="4" fill="none" strokeDasharray="251.2" strokeDashoffset="125.6" strokeLinecap="round">
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 50 50"
                      to="360 50 50"
                      dur="2s"
                      repeatCount="indefinite"/>
                  </circle>
                  <text x="50" y="60" fontSize="40" textAnchor="middle" fill="#9333EA">⏳</text>
                </svg>
              </div>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">Design Submitted!</h1>

            <p className="text-base text-gray-600 mb-8 leading-relaxed">
              Please proceed to the machine to complete your payment.
            </p>

            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-6 mb-6">
              <p className="text-purple-800 font-semibold mb-2">Waiting for payment confirmation...</p>
              <p className="text-sm text-purple-600">This page will automatically update once payment is received.</p>
            </div>

            {/* Order Status Display */}
            {orderStatus && (
              <div className="mb-6 space-y-3">
                {/* Payment Status */}
                {orderStatus.payStatus && (
                  <div className={`rounded-xl p-4 ${
                    orderStatus.payStatus === 'paid'
                      ? 'bg-green-100 border-2 border-green-500'
                      : orderStatus.payStatus === 'refunded'
                      ? 'bg-yellow-100 border-2 border-yellow-500'
                      : 'bg-gray-100 border-2 border-gray-300'
                  }`}>
                    <p className="text-xs uppercase tracking-wide mb-1 font-semibold text-gray-600">Payment Status</p>
                    <div className="flex items-center gap-2">
                      {orderStatus.payStatus === 'paid' && <span className="text-2xl">✅</span>}
                      {orderStatus.payStatus === 'refunded' && <span className="text-2xl">↩️</span>}
                      {orderStatus.payStatus === 'unpaid' && <span className="text-2xl">⏳</span>}
                      <p className="text-lg font-bold capitalize">{orderStatus.payStatus}</p>
                    </div>
                    {orderStatus.payType && (
                      <p className="text-sm text-gray-600 mt-1">via {orderStatus.payType}</p>
                    )}
                    {orderStatus.amount && (
                      <p className="text-sm text-gray-600 mt-1">Amount: ${orderStatus.amount.toFixed(2)}</p>
                    )}
                  </div>
                )}

                {/* Order Status */}
                {orderStatus.status && (
                  <div className={`rounded-xl p-4 ${
                    orderStatus.status === 'completed'
                      ? 'bg-green-100 border-2 border-green-500'
                      : orderStatus.status === 'printing'
                      ? 'bg-blue-100 border-2 border-blue-500'
                      : orderStatus.status === 'failed'
                      ? 'bg-red-100 border-2 border-red-500'
                      : 'bg-gray-100 border-2 border-gray-300'
                  }`}>
                    <p className="text-xs uppercase tracking-wide mb-1 font-semibold text-gray-600">Order Status</p>
                    <div className="flex items-center gap-2">
                      {orderStatus.status === 'completed' && <span className="text-2xl">🎉</span>}
                      {orderStatus.status === 'printing' && <span className="text-2xl">🖨️</span>}
                      {orderStatus.status === 'failed' && <span className="text-2xl">❌</span>}
                      {orderStatus.status === 'pending' && <span className="text-2xl">⏳</span>}
                      {orderStatus.status === 'paid' && <span className="text-2xl">📦</span>}
                      <p className="text-lg font-bold capitalize">{orderStatus.status}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sessionId && (
              <div className="bg-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">Session ID</p>
                <p className="text-sm font-mono text-gray-700 break-all">{sessionId}</p>
              </div>
            )}

            {/* Demo Mode: Simulate Payment Button */}
            {isDemoMode && (
              <div className="mt-6">
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 mb-4">
                  <p className="text-yellow-800 text-sm font-semibold">🎮 Demo Mode</p>
                  <p className="text-yellow-700 text-xs mt-1">Click below to simulate a payment confirmation</p>
                </div>
                <button
                  onClick={async () => {
                    if (!jobId) {
                      alert('No job ID found. Please submit a design first.');
                      return;
                    }

                    try {
                      const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');
                      console.log('🎮 Simulating payment for jobId:', jobId);

                      const response = await fetch(`${backendUrl}/api/chitu/test/payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          machineId: machineId || 'DEMO_MACHINE',
                          jobId: jobId,
                          amount: 25.99
                        })
                      });

                      const result = await response.json();
                      console.log('🎮 Simulate payment result:', result);

                      if (!result.success) {
                        alert('Failed to simulate payment: ' + (result.message || 'Unknown error'));
                      }
                      // If successful, the WebSocket will receive the payment confirmation
                      // and automatically transition to the thank you page
                    } catch (error: any) {
                      console.error('❌ Simulate payment error:', error);
                      alert('Failed to simulate payment: ' + error.message);
                    }
                  }}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-white font-semibold py-3 px-6 rounded-lg transition shadow-md"
                >
                  🧪 Simulate Payment
                </button>
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-bounce {
            animation: fadeIn 0.6s ease-out;
          }
        `}</style>
      </>
      );
    }

    // Show Thank You page (second page after payment confirmed)
    if (showThankYou) {
      return (
      <>
        <Head>
          <title>SweetRobo CaseBot</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-touch-fullscreen" content="yes" />
          <meta name="format-detection" content="telephone=no" />
          <style dangerouslySetInnerHTML={{__html: `
            * { 
              -webkit-touch-callout: none !important;
              -webkit-user-select: none !important;
              -webkit-tap-highlight-color: transparent !important;
              user-select: none !important;
            }
          `}} />
        </Head>
        <div className="min-h-screen bg-white flex items-center justify-center p-5">
          <div className="max-w-md w-full text-center">
            {/* Animated Checkmark */}
            <div className="checkmark-wrapper mb-8">
              <svg className="checkmark" viewBox="0 0 52 52" width="100" height="100">
                <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {orderStatus?.status === 'completed' ? 'All Done!' : 'Thank you!'}
            </h1>

            <p className="text-base text-gray-600 mb-8 leading-relaxed">
              {orderStatus?.status === 'completed'
                ? 'Your custom phone case is ready for pickup!'
                : orderStatus?.status === 'printing'
                ? 'Your design is being printed right now...'
                : 'Your order has been received and is being processed.'}
            </p>

            {/* Order Status Display */}
            {orderStatus && (
              <div className="mb-6 space-y-3">
                {/* Payment Status */}
                {orderStatus.payStatus && (
                  <div className={`rounded-xl p-4 ${
                    orderStatus.payStatus === 'paid'
                      ? 'bg-green-100 border-2 border-green-500'
                      : orderStatus.payStatus === 'refunded'
                      ? 'bg-yellow-100 border-2 border-yellow-500'
                      : 'bg-gray-100 border-2 border-gray-300'
                  }`}>
                    <p className="text-xs uppercase tracking-wide mb-1 font-semibold text-gray-600">Payment Status</p>
                    <div className="flex items-center gap-2">
                      {orderStatus.payStatus === 'paid' && <span className="text-2xl">✅</span>}
                      {orderStatus.payStatus === 'refunded' && <span className="text-2xl">↩️</span>}
                      {orderStatus.payStatus === 'unpaid' && <span className="text-2xl">⏳</span>}
                      <p className="text-lg font-bold capitalize">{orderStatus.payStatus}</p>
                    </div>
                    {orderStatus.payType && (
                      <p className="text-sm text-gray-600 mt-1">via {orderStatus.payType}</p>
                    )}
                    {orderStatus.amount && (
                      <p className="text-sm text-gray-600 mt-1">Amount: ${orderStatus.amount.toFixed(2)}</p>
                    )}
                  </div>
                )}

                {/* Order Status */}
                {orderStatus.status && (
                  <div className={`rounded-xl p-4 ${
                    orderStatus.status === 'completed'
                      ? 'bg-green-100 border-2 border-green-500'
                      : orderStatus.status === 'printing'
                      ? 'bg-blue-100 border-2 border-blue-500'
                      : orderStatus.status === 'failed'
                      ? 'bg-red-100 border-2 border-red-500'
                      : 'bg-gray-100 border-2 border-gray-300'
                  }`}>
                    <p className="text-xs uppercase tracking-wide mb-1 font-semibold text-gray-600">Print Status</p>
                    <div className="flex items-center gap-2">
                      {orderStatus.status === 'completed' && <span className="text-2xl">🎉</span>}
                      {orderStatus.status === 'printing' && <span className="text-2xl">🖨️</span>}
                      {orderStatus.status === 'failed' && <span className="text-2xl">❌</span>}
                      {orderStatus.status === 'pending' && <span className="text-2xl">⏳</span>}
                      {orderStatus.status === 'paid' && <span className="text-2xl">⏳</span>}
                      <p className="text-lg font-bold">
                        {orderStatus.status === 'completed' ? 'Ready for Pickup!' :
                         orderStatus.status === 'printing' ? 'Printing...' :
                         orderStatus.status === 'failed' ? 'Print Failed' :
                         orderStatus.status === 'pending' ? 'Preparing...' :
                         orderStatus.status === 'paid' ? 'Preparing...' :
                         orderStatus.status}
                      </p>
                    </div>
                    {orderStatus.status === 'completed' && (
                      <p className="text-sm text-green-700 mt-2 font-medium">
                        Your phone case is ready! Please collect it from the machine.
                      </p>
                    )}
                    {orderStatus.status === 'printing' && (
                      <p className="text-sm text-blue-700 mt-2">
                        Your design is being printed. Please wait...
                      </p>
                    )}
                    {orderStatus.status === 'failed' && (
                      <p className="text-sm text-red-700 mt-2">
                        Something went wrong. Please contact staff for assistance.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {sessionId && (
              <div className="bg-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">Session ID</p>
                <p className="text-sm font-mono text-gray-700 break-all">{sessionId}</p>
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          .checkmark-wrapper {
            display: flex;
            justify-content: center;
          }

          .checkmark {
            border-radius: 50%;
            display: block;
            stroke-width: 2;
            stroke: #fff;
            stroke-miterlimit: 10;
            animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
          }

          .checkmark-circle {
            stroke-dasharray: 166;
            stroke-dashoffset: 166;
            stroke-width: 2;
            stroke-miterlimit: 10;
            stroke: #d946ef;
            fill: #d946ef;
            animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
          }

          .checkmark-check {
            transform-origin: 50% 50%;
            stroke-dasharray: 48;
            stroke-dashoffset: 48;
            stroke: white;
            stroke-width: 3;
            animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
          }

          @keyframes stroke {
            100% {
              stroke-dashoffset: 0;
            }
          }

          @keyframes scale {
            0%, 100% {
              transform: none;
            }
            50% {
              transform: scale3d(1.1, 1.1, 1);
            }
          }

          @keyframes fill {
            100% {
              box-shadow: inset 0px 0px 0px 30px #d946ef;
            }
          }
        `}</style>
      </>
      );
    }
  }

  return (
    <>
      <Head>
        <title>SweetRobo CaseBot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-touch-fullscreen" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        <style dangerouslySetInnerHTML={{__html: `
          * {
            -webkit-touch-callout: none !important;
            -webkit-user-select: none !important;
            -webkit-tap-highlight-color: transparent !important;
            user-select: none !important;
          }

          /* Critical: Ensure submit button is always accessible on mobile */
          .pb-safe {
            padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0.75rem)) !important;
          }

          /* Prevent virtual keyboard from hiding submit button */
          @media screen and (max-height: 600px) {
            .sticky.bottom-0 {
              position: fixed !important;
              bottom: 0 !important;
              left: 0 !important;
              right: 0 !important;
              max-width: 32rem !important;
              margin: 0 auto !important;
            }
          }

          /* Ensure proper viewport height accounting for mobile browser chrome */
          @supports (-webkit-touch-callout: none) {
            .h-full {
              height: -webkit-fill-available !important;
            }
          }

          /* Additional safeguard for very small screens */
          @media screen and (max-height: 500px) {
            .sticky.bottom-0 {
              position: fixed !important;
              z-index: 9999 !important;
            }
          }

          /* Slide up animation for drawer */
          @keyframes slideUp {
            from {
              transform: translateY(100%);
            }
            to {
              transform: translateY(0);
            }
          }

          /* Slide down animation for drawer */
          @keyframes slideDown {
            from {
              transform: translateY(0);
            }
            to {
              transform: translateY(100%);
            }
          }

          /* Fade in animation for backdrop */
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          /* Fade out animation for backdrop */
          @keyframes fadeOut {
            from {
              opacity: 1;
            }
            to {
              opacity: 0;
            }
          }

          .animate-slide-up {
            animation: slideUp 0.3s ease-out;
          }

          .animate-slide-down {
            animation: slideDown 0.3s ease-out;
          }

          .animate-fade-in {
            animation: fadeIn 0.3s ease-out;
          }

          .animate-fade-out {
            animation: fadeOut 0.3s ease-out;
          }
        `}} />
      </Head>
      <div className="editor-page fixed inset-0 bg-white no-select">
        {/* Mobile container wrapper - matches upload panel structure */}
        <div className="h-full w-full flex flex-col items-center justify-center">
          <div className="w-full max-w-sm h-full bg-white flex flex-col relative">
            {/* Top Header - Fixed height section */}
            {uploadedImage && (
              <div className="flex-shrink-0 px-4 py-2">
                <div className="flex items-center gap-3 relative">
                  <img src="/icons/sweetrobo-logo.gif" alt="SweetRobo" className="w-16 h-16 object-contain" />
                  <h1 className="text-base font-bold text-gray-900">Case Bot App</h1>

                  {/* Undo Button - Top right corner at header level */}
                  {canvasHistory.length >= 2 && (
                    <button
                      data-undo-button
                      onClick={() => {
                        if (canvasHistory.length < 2 || !canvas || !uploadedImage || !fabric) return;

                        isRestoringState.current = true;

                        // Get the CURRENT state (to save to redo stack) and PREVIOUS state (to restore)
                        const currentState = canvasHistory[canvasHistory.length - 1];
                        const previousState = canvasHistory[canvasHistory.length - 2];

                        // Save current state to redo stack before removing
                        setCanvasRedoStack(prev => [...prev, currentState]);

                        // Remove the last state (current state) from history
                        setCanvasHistory(prev => prev.slice(0, -1));

                        try {
                          const savedState = JSON.parse(previousState);
                          const currentSrc = (uploadedImage as any).getSrc ? (uploadedImage as any).getSrc() : (uploadedImage as any)._element?.src;

                          console.log('🔄 Restoring image transformation state');
                          console.log('📊 Current state:', {
                            left: uploadedImage.left,
                            top: uploadedImage.top,
                            scaleX: uploadedImage.scaleX,
                            scaleY: uploadedImage.scaleY,
                            angle: uploadedImage.angle
                          });
                          console.log('📊 Restoring to:', {
                            left: savedState.left,
                            top: savedState.top,
                            scaleX: savedState.scaleX,
                            scaleY: savedState.scaleY,
                            angle: savedState.angle
                          });

                          // Check if we need to reload the image (AI edit undo)
                          if (savedState.src && savedState.src !== currentSrc) {
                            console.log('🔄 Image source changed, reloading previous image...');

                            // Remove current image (isRestoringState already true, blocks auto-saves)
                            canvas.remove(uploadedImage);

                            // Load the previous image
                            const imgElement = new Image();
                            imgElement.onload = function() {
                              const fabricImage = new fabric.Image(imgElement, {
                                left: savedState.left,
                                top: savedState.top,
                                scaleX: savedState.scaleX,
                                scaleY: savedState.scaleY,
                                angle: savedState.angle,
                                flipX: savedState.flipX,
                                flipY: savedState.flipY,
                                opacity: savedState.opacity,
                                originX: savedState.originX || 'center',
                                originY: savedState.originY || 'center',
                                selectable: true,
                                evented: true,
                                hasControls: true,
                                hasBorders: false
                              });

                              // Apply saved filters
                              if (savedState.filters && savedState.filters.length > 0) {
                                fabricImage.filters = savedState.filters;
                                fabricImage.applyFilters();
                              }

                              // Restore background color if it exists
                              if (savedState.backgroundColor !== undefined) {
                                setCanvasBackgroundColor(savedState.backgroundColor);
                                canvas.backgroundColor = savedState.backgroundColor;
                              }

                              // Apply custom controls
                              if (normalControls.current) {
                                (fabricImage as any).controls = normalControls.current;
                              }

                              // Add image back (still in restoring state to block auto-saves)
                              canvas.add(fabricImage);
                              canvas.setActiveObject(fabricImage);
                              canvas.renderAll();

                              // Update the uploaded image reference
                              setUploadedImage(fabricImage);

                              // Delay longer than event listener timeouts (100ms) to prevent auto-saves
                              setTimeout(() => {
                                isRestoringState.current = false;
                                console.log('✅ Undo successful, restored previous image');
                              }, 150);
                            };
                            imgElement.src = savedState.src;
                          } else {
                            // Get the actual image object from canvas (more reliable than state)
                            const canvasObjects = canvas.getObjects();
                            const actualImage = canvasObjects.find((obj: any) =>
                              obj.type?.toLowerCase() === 'image' && obj.selectable !== false
                            ) || uploadedImage;

                            console.log('🎯 Using image from:', actualImage === uploadedImage ? 'state' : 'canvas');

                            // Just restore transformations (no image change)
                            actualImage.set({
                              left: savedState.left,
                              top: savedState.top,
                              scaleX: savedState.scaleX,
                              scaleY: savedState.scaleY,
                              angle: savedState.angle,
                              flipX: savedState.flipX,
                              flipY: savedState.flipY,
                              opacity: savedState.opacity
                            });

                            // Restore filters if they exist
                            if (savedState.filters && savedState.filters.length > 0) {
                              actualImage.filters = savedState.filters;
                              actualImage.applyFilters();
                            } else {
                              actualImage.filters = [];
                              actualImage.applyFilters();
                            }

                            // Restore background color if it exists
                            if (savedState.backgroundColor !== undefined) {
                              setCanvasBackgroundColor(savedState.backgroundColor);
                              canvas.backgroundColor = savedState.backgroundColor;
                            }

                            // Update control coordinates to match new position/transformation
                            actualImage.setCoords();

                            canvas.setActiveObject(actualImage);
                            canvas.renderAll();

                            // Update state if we used a different object
                            if (actualImage !== uploadedImage) {
                              setUploadedImage(actualImage);
                            }

                            // Delay longer than event listener timeouts (100ms) to prevent auto-saves
                            setTimeout(() => {
                              isRestoringState.current = false;
                              console.log('✅ Undo successful, restored to previous state');
                            }, 150);
                          }
                        } catch (error) {
                          console.error('Failed to undo:', error);
                          isRestoringState.current = false;
                        }
                      }}
                      className="absolute top-1/2 -translate-y-1/2 right-0 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg shadow-lg transition-all transform active:scale-95 flex items-center gap-1 text-sm font-semibold z-10"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      Undo
                    </button>
                  )}

                  {/* Redo Button - Next to undo button */}
                  {canvasRedoStack.length > 0 && (
                    <button
                      data-redo-button
                      onClick={() => {
                        if (canvasRedoStack.length === 0 || !canvas || !uploadedImage || !fabric) return;

                        isRestoringState.current = true;

                        // Get the state to redo (last item in redo stack)
                        const redoState = canvasRedoStack[canvasRedoStack.length - 1];

                        // Remove from redo stack
                        setCanvasRedoStack(prev => prev.slice(0, -1));

                        // Add the redo state to history (not current state - that's already in history!)
                        setCanvasHistory(prev => [...prev, redoState]);

                        try {
                          const savedState = JSON.parse(redoState);
                          const currentSrc = (uploadedImage as any).getSrc ? (uploadedImage as any).getSrc() : (uploadedImage as any)._element?.src;

                          console.log('🔄 Redo: Restoring forward state');

                          // Check if we need to reload the image (AI edit redo)
                          if (savedState.src && savedState.src !== currentSrc) {
                            console.log('🔄 Redo: Image source changed, reloading image...');

                            // Remove current image
                            canvas.remove(uploadedImage);

                            // Load the redo image
                            const imgElement = new Image();
                            imgElement.onload = function() {
                              const fabricImage = new fabric.Image(imgElement, {
                                left: savedState.left,
                                top: savedState.top,
                                scaleX: savedState.scaleX,
                                scaleY: savedState.scaleY,
                                angle: savedState.angle,
                                flipX: savedState.flipX,
                                flipY: savedState.flipY,
                                opacity: savedState.opacity,
                                originX: savedState.originX || 'center',
                                originY: savedState.originY || 'center',
                                selectable: true,
                                evented: true,
                                hasControls: true,
                                hasBorders: false
                              });

                              // Apply saved filters
                              if (savedState.filters && savedState.filters.length > 0) {
                                fabricImage.filters = savedState.filters;
                                fabricImage.applyFilters();
                              }

                              // Restore background color
                              if (savedState.backgroundColor !== undefined) {
                                setCanvasBackgroundColor(savedState.backgroundColor);
                                canvas.backgroundColor = savedState.backgroundColor;
                              }

                              // Apply custom controls
                              if (normalControls.current) {
                                (fabricImage as any).controls = normalControls.current;
                              }

                              canvas.add(fabricImage);
                              canvas.setActiveObject(fabricImage);
                              canvas.renderAll();
                              setUploadedImage(fabricImage);

                              setTimeout(() => {
                                isRestoringState.current = false;
                                console.log('✅ Redo successful, restored forward image');
                              }, 150);
                            };
                            imgElement.src = savedState.src;
                          } else {
                            // Get the actual image object from canvas (more reliable than state)
                            const canvasObjects = canvas.getObjects();
                            const actualImage = canvasObjects.find((obj: any) =>
                              obj.type?.toLowerCase() === 'image' && obj.selectable !== false
                            ) || uploadedImage;

                            // Just restore transformations
                            actualImage.set({
                              left: savedState.left,
                              top: savedState.top,
                              scaleX: savedState.scaleX,
                              scaleY: savedState.scaleY,
                              angle: savedState.angle,
                              flipX: savedState.flipX,
                              flipY: savedState.flipY,
                              opacity: savedState.opacity
                            });

                            // Restore filters
                            if (savedState.filters && savedState.filters.length > 0) {
                              actualImage.filters = savedState.filters;
                              actualImage.applyFilters();
                            } else {
                              actualImage.filters = [];
                              actualImage.applyFilters();
                            }

                            // Restore background color
                            if (savedState.backgroundColor !== undefined) {
                              setCanvasBackgroundColor(savedState.backgroundColor);
                              canvas.backgroundColor = savedState.backgroundColor;
                            }

                            actualImage.setCoords();
                            canvas.setActiveObject(actualImage);
                            canvas.renderAll();

                            // Update state if we used a different object
                            if (actualImage !== uploadedImage) {
                              setUploadedImage(actualImage);
                            }

                            setTimeout(() => {
                              isRestoringState.current = false;
                              console.log('✅ Redo successful, restored to forward state');
                            }, 150);
                          }
                        } catch (error) {
                          console.error('Failed to redo:', error);
                          isRestoringState.current = false;
                        }
                      }}
                      className="absolute top-1/2 -translate-y-1/2 right-20 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg shadow-lg transition-all transform active:scale-95 flex items-center gap-1 text-sm font-semibold z-10"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                      </svg>
                      Redo
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Loading overlay while restoration is in progress */}
            {!uploadedImage && hasRestoredImage && (
              <div className="absolute inset-0 z-30 bg-white flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-purple-200 border-t-purple-600 animate-spin"></div>
                  <p className="text-gray-600 font-medium">Restoring your design...</p>
                </div>
              </div>
            )}

            {/* Upload card overlay - NO SCROLLING, fixed layout */}
            {!uploadedImage && !hasRestoredImage && (
              <div className="absolute inset-0 z-30 bg-white flex flex-col">
                {/* Header - Fixed at top */}
                <div className="flex-shrink-0 px-4 py-3">
                  <div className="flex items-center gap-3 relative">
                    <img src="/icons/sweetrobo-logo.gif" alt="SweetRobo" className="w-16 h-16 object-contain" />
                    <div className="flex-1">
                      <h1 className="text-base font-bold text-gray-900">Case Bot App</h1>
                      <p className="text-xs text-gray-500">Upload or Create amazing images with AI</p>
                    </div>
                    {/* Back button - Preserve machineId dynamically */}
                    <button
                      onClick={() => {
                        const machineId = router.query.machineId as string;
                        if (machineId) {
                          // Always preserve the machineId when going back
                          router.push(`/select-model?machineId=${machineId}`);
                        } else {
                          // Fallback to select-model without machineId (demo mode)
                          router.push('/select-model');
                        }
                      }}
                      className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                      title="Change phone model"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Upload Area - Dynamically sized to fill space */}
                <div className="flex-1 px-4 flex items-center justify-center" style={{ minHeight: 0 }}>
                  <div
                    {...getRootProps()}
                    className="w-full h-full max-h-full border-2 border-dashed border-purple-300 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer active:border-purple-400 active:bg-purple-50 transition-all bg-white"
                    onClick={() => {
                      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
                      if (input) input.click();
                    }}
                  >
                    <input {...getInputProps()} />
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center relative" style={{ background: 'linear-gradient(135deg, #a78bfa, #ec4899)', padding: '2px' }}>
                      <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                        <span className="text-2xl font-light" style={{
                          background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                          display: 'block',
                          lineHeight: '1',
                          marginTop: '-1px',
                          textAlign: 'center'
                        }}>+</span>
                      </div>
                    </div>
                    <p className="text-gray-700 font-medium mb-1 text-base">Add your image here</p>
                    <p className="text-xs text-gray-500">Upload from camera roll</p>
                  </div>
                </div>

                {/* AI Generate Button - Fixed at bottom (triggers drawer) */}
                <div className="flex-shrink-0 px-4 pb-3 pt-2">
                  <button
                    onClick={() => setShowAIUploadDrawer(true)}
                    className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
                  >
                    <div className="w-5 h-5 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                      <span className="text-xs">✨</span>
                    </div>
                    <span>Generate with AI</span>
                    <span className="text-xs bg-white bg-opacity-20 px-2 py-0.5 rounded-full">AI</span>
                  </button>
                </div>
              </div>
            )}

            {/* AI Upload Drawer - Slides up/down with animated backdrop */}
            {showAIUploadDrawer && (
              <div
                className={`fixed inset-0 z-40 flex items-end ${isAIDrawerClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
                onClick={() => {
                  // Prevent closing while processing
                  if (isProcessing) return;

                  setIsAIDrawerClosing(true);
                  setTimeout(() => {
                    setShowAIUploadDrawer(false);
                    setIsAIDrawerClosing(false);
                  }, 300); // Match animation duration
                }}
              >
                {/* Backdrop - Blur with fade animation */}
                <div className={`absolute inset-0 backdrop-blur-sm ${isAIDrawerClosing ? 'animate-fade-out' : 'animate-fade-in'}`}></div>

                {/* Drawer Content */}
                <div
                  className={`relative w-full max-w-sm mx-auto bg-white rounded-t-3xl shadow-2xl ${isAIDrawerClosing ? 'animate-slide-down' : 'animate-slide-up'}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    maxHeight: '70vh'
                  }}
                >
                  {/* Handle bar */}
                  <div className="flex justify-center pt-3 pb-2">
                    <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
                  </div>

                  {/* Drawer Header */}
                  <div className="px-4 pb-3 flex items-center justify-between border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✨</span>
                      </div>
                      <h2 className="font-bold text-gray-900">Generate AI Image</h2>
                      {/* AI Counter Badge */}
                      <div className="flex items-center gap-1 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                        <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <span className={`text-xs font-semibold ${aiEditCount >= MAX_AI_EDITS ? 'text-red-600' : 'text-purple-600'}`}>
                          {MAX_AI_EDITS - aiEditCount} AI attempts left
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        // Prevent closing while processing
                        if (isProcessing) return;

                        setIsAIDrawerClosing(true);
                        setTimeout(() => {
                          setShowAIUploadDrawer(false);
                          setIsAIDrawerClosing(false);
                        }, 300);
                      }}
                      disabled={isProcessing}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Drawer Body - Scrollable if needed */}
                  <div className="px-4 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 120px)' }}>
                    <input
                      type="text"
                      placeholder="Describe your image..."
                      value={createPrompt}
                      onChange={(e) => setCreatePrompt(e.target.value)}
                      disabled={isProcessing}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    />

                    <button
                      onClick={async () => {
                        // Call the AI generation function
                        await handleCreateAIImage();

                        // Only close drawer AFTER generation is complete (success or error)
                        // isProcessing will be false by now if generation succeeded/failed
                        if (!isProcessing) {
                          setIsAIDrawerClosing(true);
                          setTimeout(() => {
                            setShowAIUploadDrawer(false);
                            setIsAIDrawerClosing(false);
                          }, 300);
                        }
                      }}
                      disabled={!createPrompt.trim() || isProcessing}
                      className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] text-sm"
                    >
                      {isProcessing ? (
                        <div className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Generating...</span>
                        </div>
                      ) : 'Generate Image'}
                    </button>

                    {/* Quick Prompts */}
                    <div className="pt-2">
                      <p className="text-xs text-gray-500 mb-2">Quick prompts:</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { emoji: '🌅', label: 'Sunset', prompt: 'Sunset landscape' },
                          { emoji: '🐱', label: 'Cartoon Cat', prompt: 'Cartoon Cat' },
                          { emoji: '🎨', label: 'Abstract Art', prompt: 'Abstract Art' },
                          { emoji: '🌌', label: 'Space', prompt: 'Space Galaxy' },
                          { emoji: '🌸', label: 'Cherry Blossom', prompt: 'Cherry Blossom' },
                          { emoji: '🌆', label: 'Synthwave', prompt: 'Retro Synthwave' },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => setCreatePrompt(item.prompt)}
                            disabled={isProcessing}
                            className="flex flex-col items-center p-2 border border-gray-200 rounded-lg bg-gray-50 active:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="text-2xl mb-1">{item.emoji}</span>
                            <span className="text-[10px] text-gray-600">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Content Area - Canvas + Right Sidebar */}
            <div className="flex-1 flex min-h-0 relative">
              {/* Canvas Section - Takes remaining space */}
              <div className="flex-1 flex items-center justify-center">
                <canvas ref={canvasRef} className="no-select" />
              </div>

              {/* Right Sidebar - Vertical Tools (Fixed to right edge) */}
              {uploadedImage && !hideEditButtons && (
                <div className="fixed right-0 top-[80px] bottom-[90px] w-[70px] bg-transparent flex flex-col gap-2.5 py-3 items-center z-40 overflow-y-auto">
                  {/* AI Edit Button with Counter */}
                  <button
                    onClick={() => {
                      setInitialBWState(isBlackAndWhite);
                      setInitialBgColor(canvasBackgroundColor);
                      setInitialTextColor(textColor);
                      setShowAIModal(true);
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-0.5 relative"
                    title="AI Edit"
                  >
                    <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-white text-sm font-bold">AI</span>
                    </div>
                    <span className="text-[9px] text-gray-600 text-center">AI Edit</span>
                    {/* Counter badge */}
                    <div className="absolute -top-1 -right-1 bg-purple-100 rounded-full px-1.5 py-0.5 min-w-[18px] flex items-center justify-center">
                      <span className={`text-[9px] font-semibold whitespace-nowrap ${aiEditCount >= MAX_AI_EDITS ? 'text-red-600' : 'text-purple-600'}`}>
                        {MAX_AI_EDITS - aiEditCount}
                      </span>
                    </div>
                  </button>

                  {/* Stickers/Text Button */}
                  <button
                    onClick={() => {
                      setInitialTextColor(textColor);
                      setShowStickersModal(true);
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-0.5"
                    title="Stickers & Text"
                  >
                    <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-xl">🎨</span>
                    </div>
                    <span className="text-[9px] text-gray-600 text-center">Stickers</span>
                  </button>

                  {/* Rotate Left */}
                  <button
                    onClick={() => {
                      if (uploadedImage && canvas) {
                        const angle = uploadedImage.angle - 90;
                        uploadedImage.rotate(angle);
                        uploadedImage.controls = normalControls.current;
                        canvas.discardActiveObject();
                        canvas.setActiveObject(uploadedImage);
                        canvas.renderAll();
                        canvas.requestRenderAll();
                      }
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-0.5"
                    title="Rotate Left"
                  >
                    <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-xl text-black">↺</span>
                    </div>
                    <span className="text-[9px] text-gray-600 text-center">Rotate L</span>
                  </button>

                  {/* Rotate Right */}
                  <button
                    onClick={() => {
                      if (uploadedImage && canvas) {
                        const angle = uploadedImage.angle + 90;
                        uploadedImage.rotate(angle);
                        uploadedImage.controls = normalControls.current;
                        canvas.discardActiveObject();
                        canvas.setActiveObject(uploadedImage);
                        canvas.renderAll();
                        canvas.requestRenderAll();
                      }
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-0.5"
                    title="Rotate Right"
                  >
                    <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-xl text-black">↻</span>
                    </div>
                    <span className="text-[9px] text-gray-600 text-center">Rotate R</span>
                  </button>

                  {/* Crop */}
                  <button
                    onClick={() => {
                      if (uploadedImage && uploadedImage.type === 'image') {
                        const imageDataUrl = uploadedImage.toDataURL({
                          format: 'png',
                          multiplier: 2,
                          quality: 1.0
                        });
                        (window as any).currentCropTarget = uploadedImage;
                        const img = new Image();
                        img.onload = () => {
                          cropperImageRef.current = img;
                          const viewportHeight = window.innerHeight;
                          const viewportWidth = window.innerWidth;
                          const reservedHeight = 284;
                          const maxHeight = viewportHeight - reservedHeight;
                          const maxWidth = Math.min(viewportWidth - 32, 500);
                          const imgWidth = img.width;
                          const imgHeight = img.height;
                          const scaleX = maxWidth / imgWidth;
                          const scaleY = maxHeight / imgHeight;
                          const scale = Math.min(scaleX, scaleY, 1);
                          const displayWidth = Math.round(imgWidth * scale);
                          const displayHeight = Math.round(imgHeight * scale);
                          setCropperDimensions({ width: displayWidth, height: displayHeight });
                          setShowCropper(true);
                        };
                        img.src = imageDataUrl;
                      }
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-0.5"
                    title="Crop"
                  >
                    <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <img src="/icons/crop.png" alt="Crop" className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] text-gray-600 text-center">Crop</span>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (!canvas) return;
                      const activeObject = canvas.getActiveObject();
                      if (activeObject) {
                        if (activeObject === uploadedImage) {
                          setShowDeleteConfirmation(true);
                        } else {
                          canvas.remove(activeObject);
                          canvas.discardActiveObject();
                          canvas.renderAll();
                        }
                      } else {
                        if (uploadedImage) {
                          setShowDeleteConfirmation(true);
                        }
                      }
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-0.5"
                    title="Delete"
                  >
                    <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <img src="/icons/delete.png" alt="Delete" className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] text-gray-600 text-center">Delete</span>
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Toolbar - REMOVED (all buttons moved to right side) */}
            {false && uploadedImage && (
              <div className="flex-shrink-0 px-3 py-1">
                <div className="flex justify-between items-center gap-2 w-full">
              {/* All buttons moved to right side - this toolbar is hidden */}
              {/* Crop Button - HIDDEN (moved to right side) */}
              {false && <button
                onClick={() => {
                  if (uploadedImage && uploadedImage.type === 'image') {
                    const imageDataUrl = uploadedImage.toDataURL({
                      format: 'png',
                      multiplier: 2,
                      quality: 1.0
                    });
                    (window as any).currentCropTarget = uploadedImage;
                    const img = new Image();
                    img.onload = () => {
                      cropperImageRef.current = img;

                      // Calculate dynamic dimensions based on image size and viewport
                      const viewportHeight = window.innerHeight;
                      const viewportWidth = window.innerWidth;

                      // Reserve space for modal elements: header (~72px) + buttons (~116px) + dark bg padding (32px) + modal padding (32px) + screen margins (32px)
                      const reservedHeight = 284;
                      const maxModalHeight = viewportHeight * 0.9; // Modal is max-h-[90vh]

                      const maxWidth = Math.min(300, viewportWidth - 96); // Reduced max width with more horizontal padding
                      const maxHeight = Math.min(maxModalHeight - reservedHeight, 450); // Available height for image, capped at reasonable max

                      const imgWidth = img.width;
                      const imgHeight = img.height;

                      // Calculate scale to fit within bounds while maintaining aspect ratio
                      const scaleX = maxWidth / imgWidth;
                      const scaleY = maxHeight / imgHeight;
                      const scale = Math.min(scaleX, scaleY, 1); // Don't upscale small images

                      const displayWidth = Math.round(imgWidth * scale);
                      const displayHeight = Math.round(imgHeight * scale);

                      setCropperDimensions({ width: displayWidth, height: displayHeight });
                      setShowCropper(true);
                    };
                    img.src = imageDataUrl;
                  }
                }}
                className="w-11 h-11 bg-white rounded-lg flex items-center justify-center shadow-lg"
              >
                <img src="/icons/crop.png" alt="Crop" className="w-5 h-5" />
              </button>}

              {/* Delete Button - HIDDEN (moved to right side) */}
                </div>
              </div>
            )}

            {/* Submit Button - Always visible at bottom */}
            <div className="flex-shrink-0 bg-white p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
              <button
                onClick={handleSubmit}
                className="w-full font-semibold py-3 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
                style={{
                  background: !uploadedImage || isUploading ? '#e5e7eb' : 'linear-gradient(135deg, #a855f7, #ec4899)',
                  color: !uploadedImage || isUploading ? '#9ca3af' : 'white',
                }}
                disabled={!uploadedImage || isUploading}
              >
                {isUploading ? 'Processing...' : !machineId ? 'Preview Design' : 'Submit Image'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* AI Edit Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white flex flex-col rounded-2xl shadow-2xl max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 relative">
              <h2 className="text-gray-900 text-base font-semibold">Edit with AI</h2>
              <button
                onClick={() => {
                  // If filters were touched but not applied, revert changes
                  if (filtersTouched && uploadedImage && canvas) {
                    // Revert black and white to initial state
                    if (isBlackAndWhite !== initialBWState) {
                      if (initialBWState) {
                        // Add grayscale back
                        const filters = uploadedImage.filters || [];
                        filters.push(new (fabric as any).filters.Grayscale());
                        uploadedImage.filters = filters;
                      } else {
                        // Remove grayscale
                        uploadedImage.filters = (uploadedImage.filters || []).filter((f: any) => f.type !== 'Grayscale');
                      }
                      uploadedImage.applyFilters();
                      setIsBlackAndWhite(initialBWState);
                    }

                    // Revert background color to initial state
                    if (canvasBackgroundColor !== initialBgColor) {
                      setCanvasBackgroundColor(initialBgColor);
                    }

                    canvas.renderAll();
                  }
                  // Revert text color to initial state if changed
                  if (textColor !== initialTextColor) {
                    setTextColor(initialTextColor);
                  }
                  // Reset custom text color icon
                  setCustomTextColor(null);
                  // Clear AI inputs
                  setAiPrompt('');
                  setTextInput('');
                  setShowAIModal(false);
                  setAiModalTab('custom');
                  setFiltersTouched(false);
                }}
                className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600"
                disabled={isProcessing}
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-4 overflow-y-auto">
              <div>
                {/* AI Prompt Textarea */}
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe your edit (e.g., 'Make it look like oil painting')..."
                  className="w-full px-3 py-2 bg-gray-50 rounded-lg border border-gray-300 focus:border-purple-500 focus:outline-none text-gray-900 text-sm mb-4"
                  rows={3}
                  disabled={isProcessing}
                />

                <p className="text-xs text-gray-500 mb-2">Or choose a quick action:</p>

                {/* Quick Action Buttons Grid - 3x2 */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setAiPrompt('Make it look like oil painting')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-sm"
                    disabled={isProcessing}
                  >
                    <span className="text-xl">🎨</span>
                    <span className="text-gray-700 font-medium">Oil Painting</span>
                  </button>
                  <button
                    onClick={() => setAiPrompt('Convert to cartoon style')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-sm"
                    disabled={isProcessing}
                  >
                    <span className="text-xl">🎭</span>
                    <span className="text-gray-700 font-medium">Cartoon Style</span>
                  </button>
                  <button
                    onClick={() => setAiPrompt('Make it vintage')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-sm"
                    disabled={isProcessing}
                  >
                    <span className="text-xl">📷</span>
                    <span className="text-gray-700 font-medium">Vintage</span>
                  </button>
                  <button
                    onClick={() => setAiPrompt('Add sunset lighting')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-sm"
                    disabled={isProcessing}
                  >
                    <span className="text-xl">🌅</span>
                    <span className="text-gray-700 font-medium">Sunset</span>
                  </button>
                  <button
                    onClick={() => setAiPrompt('Apply watercolor effect')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-sm"
                    disabled={isProcessing}
                  >
                    <span className="text-xl">💧</span>
                    <span className="text-gray-700 font-medium">Watercolor</span>
                  </button>
                  <button
                    onClick={() => setAiPrompt('Add dramatic cinematic lighting')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-sm"
                    disabled={isProcessing}
                  >
                    <span className="text-xl">🎬</span>
                    <span className="text-gray-700 font-medium">Cinematic</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  // Handle AI edit
                  handleAIEdit();
                }}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                disabled={isProcessing || !aiPrompt.trim()}
              >
                {isProcessing ? (
                  <>
                    <span className="animate-spin">⚙️</span>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>&#10003;</span>
                    <span>Apply</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowAIModal(false);
                  setAiPrompt('');
                  setAiError(null);
                }}
                className="w-full py-3 bg-white text-gray-700 rounded-xl font-semibold border border-gray-300 flex items-center justify-center gap-2"
                disabled={isProcessing}
              >
                <span>&times;</span>
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stickers & Effects Modal */}
      {showStickersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white flex flex-col rounded-2xl shadow-2xl max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 relative">
              <h2 className="text-gray-900 text-base font-semibold">Stickers & Effects</h2>
              <button
                onClick={() => {
                  // Revert text color to initial state if changed
                  if (textColor !== initialTextColor) {
                    setTextColor(initialTextColor);
                  }
                  // Reset custom text color icon
                  setCustomTextColor(null);
                  setShowStickersModal(false);
                  setStickersModalTab('stickers');
                  setTextInput('');
                }}
                className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>

            {/* Tab Icons */}
            <div className="flex items-center justify-around p-4 border-b border-gray-200">
              <button
                onClick={() => setStickersModalTab('text')}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${stickersModalTab === 'text' ? 'bg-purple-100' : ''}`}
              >
                <span className="text-2xl">T</span>
                <span className="text-xs text-gray-700">Text</span>
              </button>
              <button
                onClick={() => setStickersModalTab('stickers')}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${stickersModalTab === 'stickers' ? 'bg-purple-100' : ''}`}
              >
                <span className="text-2xl">🎨</span>
                <span className="text-xs text-gray-700">Stickers</span>
              </button>
              <button
                onClick={() => setStickersModalTab('filters')}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${stickersModalTab === 'filters' ? 'bg-purple-100' : ''}`}
              >
                <span className="text-2xl">☰</span>
                <span className="text-xs text-gray-700">Filters</span>
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-4 overflow-y-auto">
              {/* Text Tab */}
              {stickersModalTab === 'text' && (
                <div>
                  {/* Text Templates */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      onClick={() => {
                        setTextTemplate('quote');
                        setTextInput('"Beautiful moment"');
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border ${textTemplate === 'quote' ? 'border-purple-500 bg-purple-50' : 'border-gray-300 bg-white'}`}
                    >
                      <span className="text-2xl">💭</span>
                      <span className="text-xs text-gray-700 font-medium">Quote</span>
                    </button>
                    <button
                      onClick={() => {
                        setTextTemplate('title');
                        setTextInput('MAIN TITLE');
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border ${textTemplate === 'title' ? 'border-purple-500 bg-purple-50' : 'border-gray-300 bg-white'}`}
                    >
                      <span className="text-2xl font-bold">T</span>
                      <span className="text-xs text-gray-700 font-medium">Title</span>
                    </button>
                    <button
                      onClick={() => {
                        setTextTemplate('signature');
                        setTextInput('Your Name');
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border ${textTemplate === 'signature' ? 'border-purple-500 bg-purple-50' : 'border-gray-300 bg-white'}`}
                    >
                      <span className="text-2xl">✍️</span>
                      <span className="text-xs text-gray-700 font-medium">Signature</span>
                    </button>
                    <button
                      onClick={() => {
                        setTextTemplate('date');
                        setTextInput(new Date().toLocaleDateString());
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border ${textTemplate === 'date' ? 'border-purple-500 bg-purple-50' : 'border-gray-300 bg-white'}`}
                    >
                      <span className="text-2xl">📅</span>
                      <span className="text-xs text-gray-700 font-medium">Date</span>
                    </button>
                  </div>

                  {/* Add Custom Text Label */}
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Add Custom Text</label>

                  {/* Text Input */}
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Enter your text..."
                    className="w-full px-3 py-2 bg-gray-50 rounded-lg border border-gray-300 focus:border-purple-500 focus:outline-none text-gray-900 text-sm mb-3"
                    rows={2}
                  />

                  {/* Font Family */}
                  <label className="block text-xs font-semibold text-gray-900 mb-1">Font Family</label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 rounded-lg border border-gray-300 focus:border-purple-500 focus:outline-none text-gray-900 text-sm mb-3"
                    style={{ fontFamily: fontFamily }}
                  >
                    <option value="Arial" style={{ fontFamily: 'Arial' }}>Arial</option>
                    <option value="Roboto" style={{ fontFamily: 'Roboto' }}>Roboto</option>
                    <option value="Open Sans" style={{ fontFamily: 'Open Sans' }}>Open Sans</option>
                    <option value="Lato" style={{ fontFamily: 'Lato' }}>Lato</option>
                    <option value="Montserrat" style={{ fontFamily: 'Montserrat' }}>Montserrat</option>
                    <option value="Poppins" style={{ fontFamily: 'Poppins' }}>Poppins</option>
                    <option value="Raleway" style={{ fontFamily: 'Raleway' }}>Raleway</option>
                    <option value="Playfair Display" style={{ fontFamily: 'Playfair Display' }}>Playfair Display</option>
                    <option value="Merriweather" style={{ fontFamily: 'Merriweather' }}>Merriweather</option>
                    <option value="Oswald" style={{ fontFamily: 'Oswald' }}>Oswald</option>
                    <option value="Bebas Neue" style={{ fontFamily: 'Bebas Neue' }}>Bebas Neue</option>
                    <option value="Pacifico" style={{ fontFamily: 'Pacifico' }}>Pacifico</option>
                    <option value="Dancing Script" style={{ fontFamily: 'Dancing Script' }}>Dancing Script</option>
                    <option value="Lobster" style={{ fontFamily: 'Lobster' }}>Lobster</option>
                    <option value="Great Vibes" style={{ fontFamily: 'Great Vibes' }}>Great Vibes</option>
                    <option value="Satisfy" style={{ fontFamily: 'Satisfy' }}>Satisfy</option>
                    <option value="Caveat" style={{ fontFamily: 'Caveat' }}>Caveat</option>
                    <option value="Indie Flower" style={{ fontFamily: 'Indie Flower' }}>Indie Flower</option>
                    <option value="Permanent Marker" style={{ fontFamily: 'Permanent Marker' }}>Permanent Marker</option>
                    <option value="Shadows Into Light" style={{ fontFamily: 'Shadows Into Light' }}>Shadows Into Light</option>
                    <option value="Architects Daughter" style={{ fontFamily: 'Architects Daughter' }}>Architects Daughter</option>
                  </select>

                  {/* Font Size */}
                  <label className="block text-xs font-semibold text-gray-900 mb-1">Font Size: {fontSize}px</label>
                  <input
                    type="range"
                    min="12"
                    max="120"
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                    className="w-full mb-3"
                  />

                  {/* Text Style */}
                  <label className="block text-xs font-semibold text-gray-900 mb-1">Text Style</label>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setTextBold(!textBold)}
                      className={`flex-1 py-2 rounded-lg border font-bold ${textBold ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
                    >
                      B
                    </button>
                    <button
                      onClick={() => setTextItalic(!textItalic)}
                      className={`flex-1 py-2 rounded-lg border italic ${textItalic ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
                    >
                      I
                    </button>
                    <button
                      onClick={() => setTextUnderline(!textUnderline)}
                      className={`flex-1 py-2 rounded-lg border underline ${textUnderline ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
                    >
                      U
                    </button>
                  </div>

                  {/* Text Alignment */}
                  <label className="block text-xs font-semibold text-gray-900 mb-1">Text Alignment</label>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setTextAlign('left')}
                      className={`flex-1 py-2 rounded-lg border flex items-center justify-center ${textAlign === 'left' ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
                    >
                      <div className="flex flex-col items-start" style={{ gap: '1px' }}>
                        <div style={{ fontSize: '8px', lineHeight: '6px' }}>━━━</div>
                        <div style={{ fontSize: '8px', lineHeight: '6px' }}>━━</div>
                        <div style={{ fontSize: '8px', lineHeight: '6px' }}>━━━━</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setTextAlign('center')}
                      className={`flex-1 py-2 rounded-lg border flex items-center justify-center ${textAlign === 'center' ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
                    >
                      <div className="flex flex-col items-center" style={{ gap: '1px' }}>
                        <div style={{ fontSize: '8px', lineHeight: '6px' }}>━━━</div>
                        <div style={{ fontSize: '8px', lineHeight: '6px' }}>━━</div>
                        <div style={{ fontSize: '8px', lineHeight: '6px' }}>━━━━</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setTextAlign('right')}
                      className={`flex-1 py-2 rounded-lg border flex items-center justify-center ${textAlign === 'right' ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
                    >
                      <div className="flex flex-col items-end" style={{ gap: '1px' }}>
                        <div style={{ fontSize: '8px', lineHeight: '6px' }}>━━━</div>
                        <div style={{ fontSize: '8px', lineHeight: '6px' }}>━━</div>
                        <div style={{ fontSize: '8px', lineHeight: '6px' }}>━━━━</div>
                      </div>
                    </button>
                  </div>

                  {/* Text Color */}
                  <label className="block text-xs font-semibold text-gray-900 mb-1">Text Color</label>
                  <div className="grid grid-cols-8 gap-2 mb-3">
                    {['#000000', '#EF4444', '#F97316', '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#F472B6', '#C084FC', '#FCA5A5', '#7C2D12', '#FFFFFF'].map((color) => (
                      <button
                        key={color}
                        onClick={() => setTextColor(color)}
                        className={`w-8 h-8 rounded-full ${textColor === color ? 'ring-2 ring-purple-500 ring-offset-2' : ''}`}
                        style={{ backgroundColor: color, border: color === '#FFFFFF' ? '1px solid #d1d5db' : 'none' }}
                      />
                    ))}
                    {/* Custom Color Picker */}
                    <div className="relative w-8 h-8">
                      <input
                        type="color"
                        value={customTextColor || textColor}
                        onChange={(e) => {
                          const newColor = e.target.value;
                          setTextColor(newColor);
                          setCustomTextColor(newColor);
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        style={{ zIndex: 10 }}
                      />
                      <div
                        className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center pointer-events-none"
                        style={{ backgroundColor: customTextColor || '#FFFFFF' }}
                      >
                        <span className="text-lg leading-none">🎨</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Stickers Tab */}
              {stickersModalTab === 'stickers' && (
                <div className="flex flex-col h-full">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Stickers</h3>

                  {/* Upload Custom Sticker Button */}
                  <label className="w-full mb-3 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium text-sm text-center cursor-pointer hover:opacity-90 transition flex items-center justify-center gap-2">
                    <span>📤</span>
                    <span>Upload Custom Sticker</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        console.log('File input changed');
                        const file = e.target.files?.[0];
                        console.log('File:', file);
                        console.log('Canvas:', canvas);
                        console.log('Fabric:', fabric);

                        if (!file) {
                          console.log('No file selected');
                          return;
                        }
                        if (!canvas) {
                          console.log('Canvas not available');
                          return;
                        }
                        if (!fabric) {
                          console.log('Fabric not available');
                          return;
                        }

                        const reader = new FileReader();
                        reader.onload = (event) => {
                          console.log('File loaded');
                          const imgUrl = event.target?.result as string;
                          console.log('Image URL length:', imgUrl?.length);

                          // Create an HTML Image element first
                          const imgElement = new Image();
                          imgElement.crossOrigin = 'anonymous';

                          imgElement.onload = () => {
                            console.log('Image element loaded, dimensions:', imgElement.width, 'x', imgElement.height);

                            // Now create fabric image from the loaded element
                            const fabricImage = new fabric.Image(imgElement);
                            console.log('Fabric image created:', fabricImage);

                            // Scale to reasonable size
                            const maxSize = 150;
                            const scale = Math.min(maxSize / fabricImage.width!, maxSize / fabricImage.height!);
                            console.log('Scale:', scale, 'Width:', fabricImage.width, 'Height:', fabricImage.height);

                            fabricImage.set({
                              left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
                              top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
                              scaleX: scale,
                              scaleY: scale,
                              originX: 'center',
                              originY: 'center',
                            });

                            canvas.add(fabricImage);
                            canvas.setActiveObject(fabricImage);
                            canvas.renderAll();
                            console.log('Image added to canvas');

                            setShowStickersModal(false);
                            setStickersModalTab('stickers');
                            console.log('Modal closed');
                          };

                          imgElement.onerror = (error) => {
                            console.error('Image element load error:', error);
                          };

                          // Set the source to trigger loading
                          imgElement.src = imgUrl;
                        };

                        reader.onerror = (error) => {
                          console.error('FileReader error:', error);
                        };

                        console.log('Starting to read file');
                        reader.readAsDataURL(file);

                        // Reset input
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {/* Search Bar with Paste Support */}
                  <input
                    type="text"
                    value={stickerSearch}
                    onChange={(e) => setStickerSearch(e.target.value)}
                    onPaste={async (e) => {
                      const items = e.clipboardData?.items;
                      if (!items || !canvas || !fabric) return;

                      // Check for images in clipboard
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf('image') !== -1) {
                          e.preventDefault();
                          const blob = items[i].getAsFile();
                          if (!blob) continue;

                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const imgUrl = event.target?.result as string;

                            // Create an HTML Image element first
                            const imgElement = new Image();
                            imgElement.crossOrigin = 'anonymous';

                            imgElement.onload = () => {
                              // Now create fabric image from the loaded element
                              const fabricImage = new fabric.Image(imgElement);

                              // Scale to reasonable size
                              const maxSize = 150;
                              const scale = Math.min(maxSize / fabricImage.width!, maxSize / fabricImage.height!);

                              fabricImage.set({
                                left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
                                top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
                                scaleX: scale,
                                scaleY: scale,
                                originX: 'center',
                                originY: 'center',
                              });

                              canvas.add(fabricImage);
                              canvas.setActiveObject(fabricImage);
                              canvas.renderAll();
                              setShowStickersModal(false);
                              setStickersModalTab('stickers');
                            };

                            // Set the source to trigger loading
                            imgElement.src = imgUrl;
                          };
                          reader.readAsDataURL(blob);
                          break;
                        }
                      }
                    }}
                    placeholder="Search or paste stickers..."
                    className="w-full px-3 py-2 mb-3 bg-gray-50 rounded-lg border border-gray-300 focus:border-purple-500 focus:outline-none text-gray-900 text-sm"
                  />

                  {/* Sticker Grid - Scrollable */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-4 gap-2 pb-2">
                      {(() => {
                        const allStickers = [
                          // Smileys & Emotions
                          { emoji: '😀', label: 'Smile', keywords: 'smile happy face grin' },
                          { emoji: '😂', label: 'Joy', keywords: 'laugh joy tears funny' },
                          { emoji: '🥰', label: 'Love', keywords: 'love hearts adore' },
                          { emoji: '😎', label: 'Cool', keywords: 'cool sunglasses awesome' },
                          { emoji: '🤩', label: 'Star Eyes', keywords: 'star struck wow amazed' },
                          { emoji: '😍', label: 'Heart Eyes', keywords: 'love heart eyes' },
                          { emoji: '😘', label: 'Kiss', keywords: 'kiss love heart' },
                          { emoji: '😊', label: 'Blush', keywords: 'blush smile happy' },
                          { emoji: '🥳', label: 'Party', keywords: 'party celebrate birthday' },
                          { emoji: '😇', label: 'Angel', keywords: 'angel innocent halo' },
                          { emoji: '🤗', label: 'Hug', keywords: 'hug embrace care' },
                          { emoji: '🤔', label: 'Think', keywords: 'think hmm wondering' },

                          // Hearts & Symbols
                          { emoji: '❤️', label: 'Red Heart', keywords: 'heart love red' },
                          { emoji: '💖', label: 'Sparkle Heart', keywords: 'heart sparkle love' },
                          { emoji: '💕', label: 'Two Hearts', keywords: 'hearts love pink' },
                          { emoji: '💗', label: 'Growing Heart', keywords: 'heart grow love' },
                          { emoji: '💓', label: 'Beating Heart', keywords: 'heart beat pulse' },
                          { emoji: '💝', label: 'Heart Gift', keywords: 'heart gift box' },
                          { emoji: '💘', label: 'Cupid', keywords: 'heart arrow cupid love' },
                          { emoji: '✨', label: 'Sparkles', keywords: 'sparkle shine star' },
                          { emoji: '⭐', label: 'Star', keywords: 'star yellow' },
                          { emoji: '🌟', label: 'Glowing Star', keywords: 'star glow shine' },
                          { emoji: '💫', label: 'Dizzy', keywords: 'dizzy stars spinning' },
                          { emoji: '⚡', label: 'Lightning', keywords: 'lightning bolt electric' },
                          { emoji: '🔥', label: 'Fire', keywords: 'fire hot flame' },
                          { emoji: '💎', label: 'Diamond', keywords: 'diamond gem jewel' },
                          { emoji: '👑', label: 'Crown', keywords: 'crown king queen royal' },
                          { emoji: '🎀', label: 'Ribbon', keywords: 'ribbon bow gift' },

                          // Nature
                          { emoji: '🌸', label: 'Cherry Blossom', keywords: 'flower blossom spring pink' },
                          { emoji: '🌺', label: 'Hibiscus', keywords: 'flower tropical hibiscus' },
                          { emoji: '🌻', label: 'Sunflower', keywords: 'sunflower yellow flower' },
                          { emoji: '🌹', label: 'Rose', keywords: 'rose flower red romantic' },
                          { emoji: '🌷', label: 'Tulip', keywords: 'tulip flower spring' },
                          { emoji: '🌈', label: 'Rainbow', keywords: 'rainbow colors sky' },
                          { emoji: '☀️', label: 'Sun', keywords: 'sun sunny bright day' },
                          { emoji: '🌙', label: 'Moon', keywords: 'moon night crescent' },
                          { emoji: '⭐', label: 'Star', keywords: 'star night sky' },
                          { emoji: '☁️', label: 'Cloud', keywords: 'cloud weather sky' },
                          { emoji: '🦋', label: 'Butterfly', keywords: 'butterfly insect nature' },
                          { emoji: '🐝', label: 'Bee', keywords: 'bee insect honey' },
                          { emoji: '🐶', label: 'Dog', keywords: 'dog puppy pet animal' },
                          { emoji: '🐱', label: 'Cat', keywords: 'cat kitten pet animal' },
                          { emoji: '🦄', label: 'Unicorn', keywords: 'unicorn magic fantasy' },
                          { emoji: '🐼', label: 'Panda', keywords: 'panda bear animal' },

                          // Food & Drinks
                          { emoji: '🍕', label: 'Pizza', keywords: 'pizza food italian' },
                          { emoji: '🍔', label: 'Burger', keywords: 'burger hamburger food' },
                          { emoji: '🍟', label: 'Fries', keywords: 'fries french food' },
                          { emoji: '🌭', label: 'Hot Dog', keywords: 'hotdog food' },
                          { emoji: '🍿', label: 'Popcorn', keywords: 'popcorn movie snack' },
                          { emoji: '🍰', label: 'Cake', keywords: 'cake dessert birthday' },
                          { emoji: '🎂', label: 'Birthday Cake', keywords: 'birthday cake celebrate' },
                          { emoji: '🧁', label: 'Cupcake', keywords: 'cupcake dessert sweet' },
                          { emoji: '🍪', label: 'Cookie', keywords: 'cookie dessert sweet' },
                          { emoji: '🍩', label: 'Donut', keywords: 'donut doughnut sweet' },
                          { emoji: '🍦', label: 'Ice Cream', keywords: 'icecream dessert sweet' },
                          { emoji: '🍭', label: 'Lollipop', keywords: 'lollipop candy sweet' },
                          { emoji: '🍬', label: 'Candy', keywords: 'candy sweet' },
                          { emoji: '☕', label: 'Coffee', keywords: 'coffee drink hot' },
                          { emoji: '🥤', label: 'Drink', keywords: 'drink soda beverage' },
                          { emoji: '🧃', label: 'Juice', keywords: 'juice box drink' },

                          // Activities & Objects
                          { emoji: '⚽', label: 'Soccer', keywords: 'soccer football ball sport' },
                          { emoji: '🏀', label: 'Basketball', keywords: 'basketball ball sport' },
                          { emoji: '🏈', label: 'Football', keywords: 'football american sport' },
                          { emoji: '⚾', label: 'Baseball', keywords: 'baseball ball sport' },
                          { emoji: '🎾', label: 'Tennis', keywords: 'tennis ball sport' },
                          { emoji: '🎮', label: 'Game', keywords: 'game controller gaming' },
                          { emoji: '🎯', label: 'Target', keywords: 'target dart bullseye' },
                          { emoji: '🎨', label: 'Art', keywords: 'art paint palette' },
                          { emoji: '🎭', label: 'Theater', keywords: 'theater masks drama' },
                          { emoji: '🎪', label: 'Circus', keywords: 'circus tent fun' },
                          { emoji: '🎸', label: 'Guitar', keywords: 'guitar music rock' },
                          { emoji: '🎹', label: 'Piano', keywords: 'piano music keyboard' },
                          { emoji: '🎵', label: 'Music', keywords: 'music note song' },
                          { emoji: '🎤', label: 'Mic', keywords: 'microphone sing karaoke' },
                          { emoji: '🎧', label: 'Headphones', keywords: 'headphones music audio' },
                          { emoji: '📷', label: 'Camera', keywords: 'camera photo picture' },
                          { emoji: '📸', label: 'Flash Camera', keywords: 'camera flash photo' },
                          { emoji: '🎬', label: 'Movie', keywords: 'movie film cinema' },
                          { emoji: '🎥', label: 'Video', keywords: 'video camera recording' },
                          { emoji: '🎁', label: 'Gift', keywords: 'gift present box' },
                          { emoji: '🎈', label: 'Balloon', keywords: 'balloon party celebrate' },
                          { emoji: '🎉', label: 'Party Popper', keywords: 'party celebrate confetti' },
                          { emoji: '🎊', label: 'Confetti', keywords: 'confetti party celebrate' },

                          // Travel & Places
                          { emoji: '✈️', label: 'Airplane', keywords: 'airplane plane travel flight' },
                          { emoji: '🚗', label: 'Car', keywords: 'car auto vehicle' },
                          { emoji: '🚙', label: 'SUV', keywords: 'suv car vehicle' },
                          { emoji: '🚕', label: 'Taxi', keywords: 'taxi cab car' },
                          { emoji: '🚌', label: 'Bus', keywords: 'bus vehicle transport' },
                          { emoji: '🚲', label: 'Bike', keywords: 'bike bicycle cycle' },
                          { emoji: '🛴', label: 'Scooter', keywords: 'scooter kick ride' },
                          { emoji: '🏠', label: 'House', keywords: 'house home building' },
                          { emoji: '🏡', label: 'Home', keywords: 'home house garden' },
                          { emoji: '🏢', label: 'Office', keywords: 'office building work' },
                          { emoji: '🏪', label: 'Store', keywords: 'store shop market' },
                          { emoji: '🏖️', label: 'Beach', keywords: 'beach vacation sand' },
                          { emoji: '🏝️', label: 'Island', keywords: 'island tropical paradise' },
                          { emoji: '🗼', label: 'Tower', keywords: 'tower tokyo landmark' },
                          { emoji: '🗽', label: 'Liberty', keywords: 'liberty statue newyork' },

                          // Objects & Tech
                          { emoji: '📱', label: 'Phone', keywords: 'phone mobile cell' },
                          { emoji: '💻', label: 'Laptop', keywords: 'laptop computer tech' },
                          { emoji: '⌨️', label: 'Keyboard', keywords: 'keyboard type computer' },
                          { emoji: '🖥️', label: 'Desktop', keywords: 'desktop computer monitor' },
                          { emoji: '🖱️', label: 'Mouse', keywords: 'mouse computer click' },
                          { emoji: '⌚', label: 'Watch', keywords: 'watch time clock' },
                          { emoji: '📚', label: 'Books', keywords: 'books reading library' },
                          { emoji: '📖', label: 'Book', keywords: 'book read open' },
                          { emoji: '✏️', label: 'Pencil', keywords: 'pencil write draw' },
                          { emoji: '✒️', label: 'Pen', keywords: 'pen write ink' },
                          { emoji: '📝', label: 'Note', keywords: 'note memo write' },
                          { emoji: '💼', label: 'Briefcase', keywords: 'briefcase work business' },
                          { emoji: '👔', label: 'Tie', keywords: 'tie formal business' },
                          { emoji: '🎓', label: 'Graduate', keywords: 'graduate cap education' },
                          { emoji: '🔑', label: 'Key', keywords: 'key lock unlock' },
                          { emoji: '🔒', label: 'Lock', keywords: 'lock secure closed' },
                          { emoji: '🔓', label: 'Unlock', keywords: 'unlock open' },
                          { emoji: '💡', label: 'Bulb', keywords: 'bulb light idea' },
                          { emoji: '🔦', label: 'Flashlight', keywords: 'flashlight torch light' },
                          { emoji: '🕯️', label: 'Candle', keywords: 'candle light fire' },
                        ];

                        // Filter stickers based on search
                        const filteredStickers = stickerSearch.trim()
                          ? allStickers.filter(s =>
                              s.label.toLowerCase().includes(stickerSearch.toLowerCase()) ||
                              s.keywords.toLowerCase().includes(stickerSearch.toLowerCase())
                            )
                          : allStickers;

                        return filteredStickers.map((sticker, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              if (!canvas || !fabric) return;
                              const stickerObj = new fabric.Text(sticker.emoji, {
                                left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
                                top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
                                fontSize: 60,
                                originX: 'center',
                                originY: 'center',
                              });
                              canvas.add(stickerObj);
                              canvas.setActiveObject(stickerObj);
                              canvas.renderAll();
                              setShowStickersModal(false);
                              setStickersModalTab('stickers');
                              setStickerSearch('');
                            }}
                            className="flex flex-col items-center gap-1 p-2 bg-white border border-gray-300 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition"
                          >
                            <span className="text-3xl">{sticker.emoji}</span>
                            <span className="text-[10px] text-gray-700 font-medium truncate w-full text-center">{sticker.label}</span>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Filters Tab */}
              {stickersModalTab === 'filters' && (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Quick Effects</h3>
                  </div>

                  {/* Black & White and Background Color */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      {(isBlackAndWhite || canvasBackgroundColor !== 'transparent') && (
                        <button
                          onClick={() => {
                            setIsBlackAndWhite(false);
                            setCanvasBackgroundColor('transparent');

                            // Remove grayscale filter from image
                            if (uploadedImage && canvas) {
                              uploadedImage.filters = (uploadedImage.filters || []).filter((f: any) =>
                                f.type !== 'Grayscale'
                              );
                              uploadedImage.applyFilters();
                              canvas.backgroundColor = 'transparent';
                              canvas.renderAll();
                            }

                            // Close modal immediately
                            setShowStickersModal(false);
                            setStickersModalTab('filters');
                          }}
                          className="text-xs text-red-600 font-medium hover:text-red-700"
                        >
                          Remove Effects
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <button
                        onClick={() => {
                          if (!uploadedImage || !canvas) return;
                          const newValue = !isBlackAndWhite;
                          setIsBlackAndWhite(newValue);

                          // Apply or remove grayscale filter
                          if (newValue) {
                            const filters = uploadedImage.filters || [];
                            filters.push(new (fabric as any).filters.Grayscale());
                            uploadedImage.filters = filters;
                          } else {
                            // Remove grayscale filter
                            uploadedImage.filters = (uploadedImage.filters || []).filter((f: any) =>
                              f.type !== 'Grayscale'
                            );
                          }
                          uploadedImage.applyFilters();
                          canvas.renderAll();

                          // Save state after black & white filter is toggled
                          setTimeout(() => saveCanvasState(), 100);
                        }}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition text-sm ${
                          isBlackAndWhite
                            ? 'bg-purple-500 border-purple-500 text-white'
                            : 'bg-white border-gray-300 hover:border-purple-500 hover:bg-purple-50 text-gray-700'
                        }`}
                      >
                        <span className="text-xl">⚫⚪</span>
                        <span className="font-medium">{isBlackAndWhite ? 'B&W Active' : 'Black & White'}</span>
                      </button>
                      <div className="relative">
                        <input
                          type="color"
                          value={canvasBackgroundColor === 'transparent' ? '#FFFFFF' : canvasBackgroundColor}
                          onChange={(e) => {
                            setCanvasBackgroundColor(e.target.value);
                            // Clear and close modal immediately
                            setShowStickersModal(false);
                            setStickersModalTab('filters');
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          style={{ zIndex: 10 }}
                        />
                        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-sm pointer-events-none">
                          <span className="text-xl">🎨</span>
                          <span className="text-gray-700 font-medium">Background Color</span>
                          <div
                            className="w-5 h-5 rounded border border-gray-300 ml-1"
                            style={{ backgroundColor: canvasBackgroundColor }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Filters List - Scrollable */}
                  <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                    {/* Brightness */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">☀️</span>
                          <label className="text-sm font-medium text-gray-700">Brightness</label>
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(brightness * 100)}</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={brightness}
                        onChange={(e) => {
                          setBrightness(parseFloat(e.target.value));
                          setFiltersTouched(true);
                          applyFilters();
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>

                    {/* Contrast */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">◐</span>
                          <label className="text-sm font-medium text-gray-700">Contrast</label>
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(contrast * 100)}</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={contrast}
                        onChange={(e) => {
                          setContrast(parseFloat(e.target.value));
                          setFiltersTouched(true);
                          applyFilters();
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>

                    {/* Saturation */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🎨</span>
                          <label className="text-sm font-medium text-gray-700">Saturation</label>
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(saturation * 100)}</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={saturation}
                        onChange={(e) => {
                          setSaturation(parseFloat(e.target.value));
                          setFiltersTouched(true);
                          applyFilters();
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>

                    {/* Blur */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">💨</span>
                          <label className="text-sm font-medium text-gray-700">Blur</label>
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(blur * 100)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={blur}
                        onChange={(e) => {
                          setBlur(parseFloat(e.target.value));
                          setFiltersTouched(true);
                          applyFilters();
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>

                    {/* Sharpness */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">◇</span>
                          <label className="text-sm font-medium text-gray-700">Sharpness</label>
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(sharpness * 100)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={sharpness}
                        onChange={(e) => {
                          setSharpness(parseFloat(e.target.value));
                          setFiltersTouched(true);
                          applyFilters();
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>

                    {/* Warmth */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🔥</span>
                          <label className="text-sm font-medium text-gray-700">Warmth</label>
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(warmth * 100)}</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={warmth}
                        onChange={(e) => {
                          setWarmth(parseFloat(e.target.value));
                          setFiltersTouched(true);
                          applyFilters();
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>
                  </div>

                  {/* Apply and Reset buttons - Only show when filters have been touched */}
                  {filtersTouched && (
                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        onClick={() => {
                          setShowStickersModal(false);
                          setStickersModalTab('filters');
                          setFiltersTouched(false);
                        }}
                        className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        ✓ Apply
                      </button>
                    </div>
                  )}

                  {/* Reset button - Show when any filter is not at default */}
                  {(brightness !== 0 || contrast !== 0 || saturation !== 0 || blur !== 0 || sharpness !== 0 || warmth !== 0 || isBlackAndWhite || canvasBackgroundColor !== '#FFFFFF') && (
                    <div className={filtersTouched ? "flex flex-col gap-2" : "mt-4 flex flex-col gap-2"}>
                      <button
                        onClick={() => {
                          resetFilters();
                          setFiltersTouched(false);
                        }}
                        className="w-full py-2.5 px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                      >
                        Reset to Default
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Buttons - Only show on Text tab */}
            {stickersModalTab === 'text' && (
              <div className="p-4 flex flex-col gap-2">
                <button
                  onClick={() => {
                    // Handle text addition
                    if (!canvas || !fabric || !textInput.trim()) return;

                    const text = new fabric.IText(textInput, {
                      left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
                      top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
                      fontFamily: fontFamily,
                      fontSize: fontSize,
                      fontWeight: textBold ? 'bold' : 'normal',
                      fontStyle: textItalic ? 'italic' : 'normal',
                      underline: textUnderline,
                      fill: textColor,
                      textAlign: textAlign,
                      originX: 'center',
                      originY: 'center',
                    });

                    canvas.add(text);
                    canvas.setActiveObject(text);
                    canvas.renderAll();

                    // Close modal and reset
                    setShowStickersModal(false);
                    setStickersModalTab('stickers');
                    setTextInput('');
                    setTextTemplate(null);
                    // Reset custom text color icon
                    setCustomTextColor(null);
                  }}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                  disabled={!textInput.trim()}
                >
                  <span>&#10003;</span>
                  <span>Apply</span>
                </button>
                <button
                  onClick={() => {
                    // Revert text color to initial state if changed
                    if (textColor !== initialTextColor) {
                      setTextColor(initialTextColor);
                    }
                    // Reset custom text color icon
                    setCustomTextColor(null);
                    setShowStickersModal(false);
                    setStickersModalTab('stickers');
                    setTextInput('');
                  }}
                  className="w-full py-3 bg-white text-gray-700 rounded-xl font-semibold border border-gray-300 flex items-center justify-center gap-2"
                >
                  <span>&times;</span>
                  <span>Cancel</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Create AI Image Modal */}
      <Modal
        isOpen={showCreateModal}
        onRequestClose={() => !isProcessing && setShowCreateModal(false)}
        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 glass-panel p-4 w-[90%] max-w-sm max-h-[85vh] overflow-y-auto"
        overlayClassName="fixed inset-0 bg-black bg-opacity-75 z-50"
        shouldCloseOnOverlayClick={true}
      >
        <div className="text-white relative">
          {/* Close button */}
          <button
            onClick={() => setShowCreateModal(false)}
            className="absolute -top-2 -right-2 w-8 h-8 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white font-bold"
            disabled={isProcessing}
          >
            ×
          </button>
          <h2 className="text-2xl font-bold mb-4">✨ Create AI Image</h2>
          
          {/* Inspiration Templates */}
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">Inspiration:</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCreatePrompt('Beautiful sunset over mountains with dramatic clouds')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Sunset Landscape
              </button>
              <button
                onClick={() => setCreatePrompt('Cute cartoon cat wearing sunglasses')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Cartoon Cat
              </button>
              <button
                onClick={() => setCreatePrompt('Abstract colorful geometric pattern')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Abstract Art
              </button>
              <button
                onClick={() => setCreatePrompt('Galaxy with nebula and stars, cosmic colors')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Space/Galaxy
              </button>
              <button
                onClick={() => setCreatePrompt('Japanese cherry blossom tree in full bloom')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Cherry Blossom
              </button>
              <button
                onClick={() => setCreatePrompt('Retro 80s synthwave style with neon colors')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Retro Synthwave
              </button>
            </div>
          </div>
          
          {/* Main Prompt Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Describe what you want to create:
            </label>
            <textarea
              value={createPrompt}
              onChange={(e) => setCreatePrompt(e.target.value)}
              placeholder="e.g., A magical forest with glowing mushrooms and fireflies, fantasy art style..."
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-white"
              rows={4}
              disabled={isProcessing}
            />
            <p className="text-xs text-gray-400 mt-1">
              💡 Tip: Be specific! Include style (realistic, cartoon, oil painting), colors, mood, and details
            </p>
          </div>
          
          {/* Error Display */}
          {aiError && (
            <div className="mb-4 p-3 bg-red-900 bg-opacity-50 border border-red-600 rounded">
              <p className="text-red-300 text-sm">{aiError}</p>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setShowCreateModal(false);
                setCreatePrompt('');
                setAiError(null);
              }}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded font-medium transition"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateAIImage}
              className="neon-button px-6 py-2 rounded font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{background: 'var(--gradient-accent)', border: '2px solid var(--neon-green)', color: 'var(--foreground)'}}
              disabled={isProcessing || !createPrompt.trim()}
            >
              {isProcessing ? (
                <>
                  <span className="animate-spin">⚙️</span>
                  Generating...
                </>
              ) : (
                <>
                  🎨 Generate Image
                </>
              )}
            </button>
          </div>
          
          {/* Processing Status */}
          {isProcessing && (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-400">AI is creating your image...</p>
              <p className="text-xs text-gray-500 mt-1">This may take 15-30 seconds</p>
            </div>
          )}
        </div>
      </Modal>
      

      {/* Cropper Modal */}
      {showCropper && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowCropper(false);
            if (cropperRef.current) {
              cropperRef.current.destroy();
              cropperRef.current = null;
            }
            cropperImageRef.current = null;
          }
        }}>
          <div className="w-full max-w-sm bg-white flex flex-col rounded-2xl shadow-2xl max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 relative">
              <h2 className="text-gray-900 text-base font-semibold">Crop Image</h2>
              {/* Close button */}
              <button
                onClick={() => {
                  setShowCropper(false);
                  if (cropperRef.current) {
                    cropperRef.current.destroy();
                    cropperRef.current = null;
                  }
                  cropperImageRef.current = null;
                }}
                className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            {/* Image area with dark rounded background */}
            <div className="flex-1 p-4 flex items-center justify-center overflow-hidden">
              <div className="bg-gray-900 rounded-2xl p-4 inline-block" style={{ maxWidth: 'fit-content' }}>
                <img
                  ref={cropperElementRef}
                  src={cropperImageRef.current?.src}
                  style={{ maxWidth: `${cropperDimensions.width}px`, maxHeight: `${cropperDimensions.height}px`, width: 'auto', height: 'auto', display: 'block' }}
                />
              </div>
            </div>
            {/* Buttons */}
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={() => {
                    if (cropperRef.current) {
                      console.log('Cropper instance exists:', cropperRef.current);
                      // Get the cropped canvas using v1 API with high quality options
                      const croppedCanvas = cropperRef.current.getCroppedCanvas({
                        maxWidth: 4096,
                        maxHeight: 4096,
                        fillColor: '#fff',
                        imageSmoothingEnabled: true,
                        imageSmoothingQuality: 'high'
                      });
                      console.log('Cropped canvas:', croppedCanvas);
                      if (!croppedCanvas) {
                        console.error('Failed to get cropped canvas');
                        return;
                      }
                      
                      const croppedDataUrl = croppedCanvas.toDataURL('image/png', 1.0);
                      console.log('Cropped data URL length:', croppedDataUrl.length);
                      
                      // Save current image state to crop history before cropping
                      const target = (window as any).currentCropTarget;
                      if (target) {
                        const currentImageData = target.toDataURL({
                          format: 'png',
                          multiplier: 2,
                          quality: 1.0
                        });
                        setCropHistory(prev => [...prev, currentImageData]);
                      }
                      
                      // Create new fabric image from cropped result using Image element
                      console.log('Creating image element from cropped data...');
                      const imgElement = new Image();
                      imgElement.crossOrigin = 'anonymous';
                      
                      imgElement.onload = () => {
                        console.log('Image element loaded, creating fabric image...');
                        const newImg = new fabric.Image(imgElement);
                        console.log('New fabric image created:', newImg);
                        
                        console.log('Current crop target:', target);
                        
                        if (target && canvas) {
                          // Copy position and rotation from original
                          newImg.set({
                            left: target.left,
                            top: target.top,
                            angle: target.angle || 0,
                            originX: 'center',
                            originY: 'center'
                          });
                          
                          // Scale to fit if needed
                          const maxWidth = DISPLAY_WIDTH * 0.8;
                          const maxHeight = DISPLAY_HEIGHT * 0.8;
                          const scale = Math.min(maxWidth / newImg.width!, maxHeight / newImg.height!);
                          if (scale < 1) {
                            newImg.scale(scale);
                          }
                          
                          // Apply normal controls to the new image
                          newImg.controls = normalControls.current;
                          
                          // Remove old image and add new one
                          canvas.remove(target);
                          canvas.add(newImg);
                          canvas.setActiveObject(newImg);
                          setUploadedImage(newImg);
                          canvas.renderAll();
                          
                          console.log('Crop applied successfully!');
                        }
                        
                        // Clean up and close modal AFTER the image is processed
                        if (cropperRef.current) {
                          cropperRef.current.destroy();
                          cropperRef.current = null;
                        }
                        cropperImageRef.current = null;
                        setShowCropper(false);
                      };
                      
                      imgElement.onerror = (error) => {
                        console.error('Failed to load cropped image:', error);
                        // Clean up on error
                        if (cropperRef.current) {
                          cropperRef.current.destroy();
                          cropperRef.current = null;
                        }
                        cropperImageRef.current = null;
                        setShowCropper(false);
                      };
                      
                      imgElement.src = croppedDataUrl;
                    }
                  }}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  <span>&#10003;</span>
                  <span>Crop</span>
                </button>
                <button
                  onClick={() => {
                    if (cropperRef.current) {
                      cropperRef.current.destroy();
                      cropperRef.current = null;
                    }
                    cropperImageRef.current = null;
                    setShowCropper(false);
                  }}
                  className="w-full py-3 bg-white text-gray-700 rounded-xl font-semibold border border-gray-300 flex items-center justify-center gap-2"
                >
                  <span>&times;</span>
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4">
            {/* Sad Cat Icon */}
            <div className="text-6xl">😿</div>

            {/* Title */}
            <h2 className="text-gray-900 text-xl font-bold text-center">Delete Everything?</h2>

            {/* Message */}
            <p className="text-gray-600 text-center text-sm">
              This will delete your image and all added elements (text, stickers, etc.). This action cannot be undone.
            </p>

            {/* Buttons */}
            <div className="w-full flex flex-col gap-3 mt-2">
              <button
                onClick={() => {
                  if (!canvas) return;

                  // Set deletion flag to prevent saveCanvasState from running during removal
                  isDeletingImage.current = true;
                  console.log('🗑️ Starting deletion, blocking state saves');

                  // Remove all objects except border and background
                  const objectsToRemove = canvas.getObjects().filter((obj: any) =>
                    !obj.excludeFromExport && obj.selectable !== false
                  );
                  objectsToRemove.forEach((obj: any) => canvas.remove(obj));
                  canvas.renderAll();

                  setUploadedImage(null);
                  setCropHistory([]);
                  setHasRestoredImage(false);

                  // Clear undo/redo history when deleting everything
                  setCanvasHistory([]);
                  setCanvasRedoStack([]);
                  console.log('🗑️ Cleared undo/redo history');

                  // Clear canvas state from sessionStorage to prevent restoration
                  if (sessionId) {
                    sessionStorage.removeItem(`canvas-state-${sessionId}`);
                    console.log('🗑️ Cleared canvas state from sessionStorage');
                  }

                  // Reset text customization states
                  setTextInput('');
                  setTextTemplate(null);
                  setFontFamily('Arial');
                  setFontSize(32);
                  setTextBold(false);
                  setTextItalic(false);
                  setTextUnderline(false);
                  setTextAlign('center');
                  setTextColor('#000000');

                  setShowDeleteConfirmation(false);

                  // Re-enable state saves after deletion completes AND after all event handlers fire
                  // handleRemoved has a 100ms setTimeout, so we wait 200ms to be safe
                  setTimeout(() => {
                    isDeletingImage.current = false;
                    console.log('🗑️ Deletion complete, state saves re-enabled');
                  }, 200);
                  console.log('Everything deleted, returning to upload page');
                }}
                className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
              >
                Yes, Delete Everything
              </button>

              <button
                onClick={() => setShowDeleteConfirmation(false)}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                No, Keep It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && previewImage && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          {/* Preview Container - Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 pt-8" style={{ paddingBottom: 'calc(180px + env(safe-area-inset-bottom))' }}>
            <div className="max-w-md mx-auto">
              {/* Phone Model Preview */}
              <div className="relative mx-auto mb-6" style={{ maxWidth: '280px', maxHeight: '60vh' }}>
                {/* Design Image - Clean display without platform effect */}
                <img
                  src={previewImage}
                  alt="Your design"
                  className="w-full h-auto object-contain"
                  style={{ maxHeight: '60vh', borderRadius: '48px' }}
                />
              </div>

              {/* Phone Model Name */}
              <h2 className="text-center text-xl font-semibold text-gray-800 mb-2">
                {phoneModel?.displayName}
              </h2>
              <p className="text-center text-gray-600 text-sm mb-4">
                Your custom phone case design
              </p>
            </div>
          </div>

          {/* Fixed Bottom Buttons - With safe area padding for mobile notches/home indicators */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <div className="max-w-md mx-auto space-y-3">
              <button
                onClick={async () => {
                  if (!previewImage) return;

                  setIsUploading(true);

                  try {
                    // Get submission data from window
                    const submissionData = (window as any).__submissionData;

                    // DEMO MODE: Mark submission as demo (no Chitu order, S3 upload only)
                    if (isDemoMode) {
                      submissionData.isDemo = true;
                      submissionData.machineId = null; // Ensure no machineId sent
                      console.log('🎮 DEMO MODE: Submitting design (S3 only, no Chitu order)');
                    }

                    // Submit to backend (S3 upload + print job)
                    const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');
                    const response = await fetch(`${backendUrl}/api/chitu/print`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(submissionData),
                    });

                    const result = await response.json();

                    if (result.success) {
                      // Store job ID for WebSocket order tracking
                      if (result.jobId) {
                        setJobId(result.jobId);
                        console.log('✅ Print job submitted with ID:', result.jobId);
                      }

                      // Clear data
                      delete (window as any).__submissionData;
                      setShowPreviewModal(false);
                      setPreviewImage(null);

                      // Clear preview data from sessionStorage
                      if (sessionId) {
                        sessionStorage.removeItem(`preview-image-${sessionId}`);
                        sessionStorage.removeItem(`submission-data-${sessionId}`);
                      }

                      // Show waiting for payment page (same flow for both demo and production)
                      setIsSessionLocked(true);
                      setShowWaitingForPayment(true);
                      setShowThankYou(false);
                      console.log(isDemoMode ? '🎮 DEMO MODE: Showing waiting page (use Simulate Payment to continue)' : '🏭 PRODUCTION: Showing waiting page');

                      // Persist lock and page state in sessionStorage
                      if (sessionId) {
                        sessionStorage.setItem(`session-locked-${sessionId}`, 'true');
                        sessionStorage.setItem(`session-lock-timestamp-${sessionId}`, Date.now().toString());
                        sessionStorage.setItem(`page-state-${sessionId}`, 'waiting');
                        console.log('💾 Persisted page state to sessionStorage');
                      }

                      // Prevent back navigation
                      window.history.pushState(null, '', window.location.href);
                      window.onpopstate = () => {
                        window.history.go(1);
                      };

                      // Note: We no longer prevent page refresh/reload with beforeunload
                      // because sessionStorage persistence now handles page state restoration correctly
                    } else {
                      alert('Submission failed: ' + (result.error || 'Unknown error'));
                      setIsUploading(false);
                    }
                  } catch (error: any) {
                    console.error('Submission error:', error);
                    alert('Failed to submit design: ' + error.message);
                    setIsUploading(false);
                  }
                }}
                disabled={isUploading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 active:bg-purple-800 text-white font-semibold py-4 px-6 rounded-lg transition shadow-md"
              >
                {isUploading ? 'Submitting...' : 'Submit Design'}
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  console.log('👈 Back to Edit clicked');

                  // Clear the page-state from sessionStorage
                  // This prevents the useEffect from restoring the preview modal on page refresh
                  if (sessionId) {
                    sessionStorage.removeItem(`page-state-${sessionId}`);
                    console.log('🗑️ Cleared page-state from sessionStorage');
                  }

                  // Simply hide the modal - canvas stays alive underneath
                  setShowPreviewModal(false);
                  console.log('✅ Preview modal hidden, returning to editor');
                }}
                disabled={isUploading}
                className="w-full bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 font-semibold py-4 px-6 rounded-lg transition"
              >
                Back to Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal removed - users pay at physical machine after submission */}
    </>
  );
}
