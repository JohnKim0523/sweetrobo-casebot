import React, { useRef, useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useDropzone } from 'react-dropzone';
import Modal from 'react-modal';
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

export default function Editor() {
  const router = useRouter();
  const { model: modelId } = router.query;
  
  // Get phone model configuration
  const phoneModel = modelId ? getPhoneModel(modelId as string) : null;

  // Initialize state variables first
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<any>(null);
  const [uploadedImage, setUploadedImage] = useState<any>(null);
  const [fabric, setFabric] = useState<any>(null);

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
  const FIXED_SUBMIT_HEIGHT = 90; // Submit button at bottom (fixed)
  const FIXED_EDIT_BUTTONS_HEIGHT = 60; // Edit buttons (fixed physical size)
  const SAFETY_BUFFER = 20; // Extra buffer to ensure no overlap

  // STEP 2: Calculate total space needed for ALL UI elements except canvas
  const TOTAL_UI_HEIGHT = FIXED_HEADER_HEIGHT + FIXED_EDIT_BUTTONS_HEIGHT + FIXED_SUBMIT_HEIGHT + SAFETY_BUFFER;

  // STEP 3: Calculate space available ONLY for canvas
  // Layout: [Header] [Canvas] [Edit Buttons] [Submit Button]
  const SPACE_FOR_CANVAS_ONLY = viewportHeight - TOTAL_UI_HEIGHT;

  // STEP 4: Calculate available width (accounting for container constraints)
  const AVAILABLE_WIDTH = Math.min(viewportWidth, CONTAINER_MAX_WIDTH);
  const AVAILABLE_WIDTH_FOR_CANVAS = AVAILABLE_WIDTH - 20; // Small padding

  // STEP 5: Get phone model dimensions
  const modelWidthMM = phoneModel?.dimensions.widthMM || DEFAULT_WIDTH_MM;
  const modelHeightMM = phoneModel?.dimensions.heightMM || DEFAULT_HEIGHT_MM;

  // STEP 6: Calculate scale factors to fit in available canvas space
  const scaleX = AVAILABLE_WIDTH_FOR_CANVAS / modelWidthMM;
  const scaleY = SPACE_FOR_CANVAS_ONLY / modelHeightMM;

  // STEP 7: Use smaller scale to maintain aspect ratio and fit maximally WITHOUT overflow
  const SCALE_FACTOR = Math.min(scaleX, scaleY);

  // STEP 8: Calculate final display dimensions (scaled to fit perfectly)
  const DISPLAY_WIDTH = Math.round(modelWidthMM * SCALE_FACTOR);
  const DISPLAY_HEIGHT = Math.round(modelHeightMM * SCALE_FACTOR);

  // Export dimensions (actual size for printing)
  const EXPORT_WIDTH = phoneModel ? phoneModel.dimensions.widthPX : Math.round(DEFAULT_WIDTH_MM * 11.81);
  const EXPORT_HEIGHT = phoneModel ? phoneModel.dimensions.heightPX : Math.round(DEFAULT_HEIGHT_MM * 11.81);

  // Canvas dimensions - add small padding to ensure borders are fully visible
  const CANVAS_TOTAL_WIDTH = AVAILABLE_WIDTH;
  const CANVAS_TOTAL_HEIGHT = DISPLAY_HEIGHT + 6; // Add 6px for border visibility (2px stroke + padding)
  const CONTROL_PADDING = Math.round((CANVAS_TOTAL_WIDTH - DISPLAY_WIDTH) / 2);
  const VERTICAL_PADDING = 3; // Padding for borders (ensures 2px stroke is fully visible)

  // Debug log to monitor scaling
  console.log('Dynamic Canvas Scaling:', {
    viewport: { width: viewportWidth, height: viewportHeight },
    fixedElements: {
      header: FIXED_HEADER_HEIGHT,
      submit: FIXED_SUBMIT_HEIGHT,
      editButtons: FIXED_EDIT_BUTTONS_HEIGHT,
      totalUIHeight: TOTAL_UI_HEIGHT
    },
    calculated: {
      spaceForCanvasOnly: SPACE_FOR_CANVAS_ONLY
    },
    model: { widthMM: modelWidthMM, heightMM: modelHeightMM },
    scaleFactor: SCALE_FACTOR,
    display: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
    canvas: { width: CANVAS_TOTAL_WIDTH, height: CANVAS_TOTAL_HEIGHT }
  });

  const [machineId, setMachineId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTimestamp, setSessionTimestamp] = useState<number | null>(null);
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const sessionCheckRef = useRef(false); // Prevent double session checks
  const [debugInfo, setDebugInfo] = useState<string>(''); // Debug info for mobile
  const [showThankYou, setShowThankYou] = useState(false);
  const [thankYouMessage, setThankYouMessage] = useState('Thank you for your design!');
  const [isCheckingSession, setIsCheckingSession] = useState(true); // Loading state
  const [crosshairLines, setCrosshairLines] = useState<{vertical: any, horizontal: any}>({vertical: null, horizontal: null});
  const [isSnapping, setIsSnapping] = useState(false);
  
  // AI Editing states
  const [showAIModal, setShowAIModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMaskModal, setShowMaskModal] = useState(false);  // New modal for mask editing
  const [aiPrompt, setAiPrompt] = useState('');
  const [createPrompt, setCreatePrompt] = useState('');
  const [maskPrompt, setMaskPrompt] = useState('');  // Separate prompt for mask editing
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMaskDrawing, setIsMaskDrawing] = useState(false);  // New state for mask drawing mode
  const [currentMask, setCurrentMask] = useState<string | null>(null);  // Current mask being drawn
  const [aiError, setAiError] = useState<string | null>(null);
  const [editHistory, setEditHistory] = useState<string[]>([]);
  const [cropHistory, setCropHistory] = useState<string[]>([]);
  const [drawingMode, setDrawingMode] = useState<boolean>(false);
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

  useEffect(() => {
    // Extract URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const machine = urlParams.get('machineId');
    const session = urlParams.get('session');
    const modelParam = urlParams.get('model');
    
    console.log('🔍 URL params:', { machine, session, model: modelParam });
    
    // Check if we're in model selection flow (no machine ID required)
    if (modelParam) {
      console.log('📱 Phone model flow - model:', modelParam);
      setMachineId('demo-' + modelParam); // Use model-based ID for demo
      setSessionId('model-session-' + Date.now());
      setIsCheckingSession(false);
      return;
    }
    
    // Original kiosk flow - validate machineId
    if (!machine || machine === 'null' || machine === 'undefined' || machine === '') {
      // Check if we have a session but invalid machineId (URL corruption)
      if (session && session !== 'null' && session !== 'undefined') {
        console.error('❌ Invalid machine ID with existing session - URL may be corrupted');
        setShowThankYou(true);
        setThankYouMessage('Invalid URL. Please scan the QR code again to access the designer.');
        setIsSessionLocked(true);
        setIsCheckingSession(false);
        return;
      }
      
      // No valid machine ID and no session - redirect to model selection
      console.log('🔄 No machine ID - redirecting to model selection');
      router.push('/select-model');
      return;
    }
    
    // Valid machine ID found
    setMachineId(machine);
    console.log('🏭 Machine ID detected:', machine);
    
    // Handle session logic
    if (!session || session === 'null' || session === 'undefined') {
      // No valid session - generate new one, register it, and redirect
      // Use crypto.randomUUID if available, otherwise fallback
      const newSessionId = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
      console.log('🎫 Generating new session:', newSessionId);
      
      // Set the session ID in state immediately
      setSessionId(newSessionId);
      setSessionTimestamp(Date.now());
      
      // Session registration handled elsewhere
      console.log('✅ Session created locally:', newSessionId);
      
      router.push(`/editor?machineId=${machine}&session=${newSessionId}`);
      setIsCheckingSession(false);
    } else {
      // Valid session exists - check if it was already used
      console.log('📋 Checking existing session:', session);
      
      // Check localStorage to see if this session already submitted
      const submittedSessions = JSON.parse(localStorage.getItem('submittedSessions') || '[]');
      if (submittedSessions.includes(session)) {
        console.log('🔒 Session already submitted - showing thank you page');
        setIsSessionLocked(true);
        setShowThankYou(true);
        setThankYouMessage('Your design has already been submitted. Your custom print will be ready shortly!');
        setIsCheckingSession(false);
        return;
      }
      
      setSessionId(session);
      setSessionTimestamp(Date.now());
      setIsCheckingSession(false);
    }
  }, []); // Run once on mount

  // Define control sets at component level to avoid scope issues
  const normalControls = useRef<any>(null);
  const cropControls = useRef<any>(null);

  useEffect(() => {
    // Only initialize canvas when all conditions are met
    if (!canvasRef.current || !fabric || isCheckingSession || isSessionLocked || showThankYou || canvas) {
      return;
    }
    
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
        enableRetinaScaling: false,  // Disable retina scaling
        imageSmoothingEnabled: false,  // Disable image smoothing for performance
        renderOnAddRemove: true,  // Control rendering behavior
        skipOffscreen: true,  // Skip offscreen rendering
        stateful: false  // Disable state tracking for better performance
      });
      
      // Add white background rectangle for the actual canvas area
      const canvasBackground = new fabric.Rect({
        left: CONTROL_PADDING,
        top: VERTICAL_PADDING,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        fill: 'white',
        selectable: false,
        evented: false,
        excludeFromExport: true
      });
      
      fabricCanvas.add(canvasBackground);
      
      // Set up clipping to hide image parts outside white canvas area
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
      fabric.Object.prototype.cornerSize = 15;
      fabric.Object.prototype.cornerStyle = 'rect';
      fabric.Object.prototype.borderColor = 'transparent';
      fabric.Object.prototype.borderScaleFactor = 0;
      fabric.Object.prototype.hasBorders = false;
      fabric.Object.prototype.padding = 15;
      
      // Custom L-shaped corner renderer
      const renderLCorner = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any, flipX = false, flipY = false) => {
        const size = fabricObject.cornerSize || 15;
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
        const size = (fabricObject.cornerSize || 15) + 4;
        
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
        const size = 12;
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
      // Inset the border by half the stroke width to prevent clipping
      const borderStrokeWidth = 2;
      const borderInset = borderStrokeWidth / 2;
      const border = new fabric.Rect({
        left: CONTROL_PADDING + borderInset,
        top: VERTICAL_PADDING + borderInset,
        width: DISPLAY_WIDTH - borderStrokeWidth,
        height: DISPLAY_HEIGHT - borderStrokeWidth,
        fill: 'white',  // White background for the actual canvas area
        stroke: '#333',
        strokeWidth: borderStrokeWidth,
        selectable: false,
        evented: false
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
  }, [fabric, isCheckingSession, isSessionLocked, showThankYou]); // Removed isCropMode to prevent re-initialization

  // Selection prevention is now handled by simple CSS (same as model selection page)

  // Initialize Cropper when modal opens
  useEffect(() => {
    const initCropper = async () => {
      if (showCropper && cropperElementRef.current && !cropperRef.current) {
        // Dynamically import Cropper to avoid SSR issues
        const Cropper = (await import('cropperjs')).default;
        cropperRef.current = new Cropper(cropperElementRef.current, {
          aspectRatio: NaN, // Free aspect ratio
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 1,
          restore: false,
          guides: true,
          center: true,
          highlight: true,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
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

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && canvas && fabric) {
      const file = acceptedFiles[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        if (e.target?.result) {
          const imgElement = new Image();
          imgElement.onload = function() {
            const fabricImage = new fabric.Image(imgElement);
            
            // Remove previous image if exists
            if (uploadedImage) {
              canvas.remove(uploadedImage);
            }

            // Clear edit history when uploading a new image (fresh start)
            setEditHistory([]);

            // Scale image to fit within display canvas
            const maxDisplayWidth = DISPLAY_WIDTH * 0.8;  // 80% of canvas width
            const maxDisplayHeight = DISPLAY_HEIGHT * 0.8; // 80% of canvas height
            const scale = Math.min(maxDisplayWidth / fabricImage.width!, maxDisplayHeight / fabricImage.height!);
            fabricImage.scale(scale);
            
            // Center the image on the canvas (accounting for padding)
            fabricImage.set({
              left: CONTROL_PADDING + DISPLAY_WIDTH / 2,  // Center position with padding
              top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,   // Center position with padding
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
            
            canvas.setActiveObject(fabricImage);
            canvas.renderAll();
            setUploadedImage(fabricImage);
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
    multiple: false
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
        
        // Export the image without mask overlays
        imageData = canvas.toDataURL({
          format: 'png',
          left: CONTROL_PADDING,
          top: VERTICAL_PADDING,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          multiplier: 1,  // Keep at display size for correct mask alignment
        });
        
        // Show the mask paths again
        maskPaths.forEach((path: any) => path.set({ visible: true }));
        canvas.renderAll();
        
        console.log('Exported image for mask edit at display size:', DISPLAY_WIDTH, 'x', DISPLAY_HEIGHT);
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
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        console.log('AI Edit failed:', result.error);
        
        // Close the modal and show user-friendly alert
        setShowAIModal(false);
        setShowMaskModal(false);
        setIsProcessing(false);
        setAiPrompt('');
        setMaskPrompt('');
        
        // Show appropriate alert based on error type
        if (result.errorType === 'safety_filter' || result.error?.includes('safety filter')) {
          alert('⚠️ The AI safety filter was triggered. Please try with a different prompt.');
        } else if (result.error?.includes('authentication') || result.error?.includes('401')) {
          alert('❌ API authentication failed. Please check your settings.');
        } else if (result.error?.includes('rate limit') || result.error?.includes('429')) {
          alert('⏱️ Rate limit exceeded. Please wait a moment and try again.');
        } else if (result.error?.includes('422') || result.error?.includes('Invalid input')) {
          alert('🖼️ Invalid image format. Please try with a different image.');
        } else {
          alert('❌ ' + (result.error || 'AI processing failed. Please try again.'));
        }
        
        return; // Exit early without throwing error
      }
      
      // Load the edited image
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';
      
      imgElement.onload = function() {
        console.log('Mask edited image loaded, dimensions:', imgElement.width, 'x', imgElement.height);
        
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
        
        // The returned image is already at display size (250x462.5)
        // Position it centered on the canvas like the regular AI edit
        fabricImage.set({
          left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
          top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
          originX: 'center',
          originY: 'center',
          scaleX: 1,  // No scaling needed - already at display size
          scaleY: 1,  // No scaling needed - already at display size
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
      };
      
      imgElement.onerror = function(error) {
        console.error('Failed to load edited image:', error);
        setAiError('Failed to load edited image');
        setIsProcessing(false);
      };
      
      imgElement.src = result.imageUrl;
      
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
    
    setIsProcessing(true);
    setAiError(null);
    
    try {
      // Save current image state to history BEFORE making changes
      if (uploadedImage) {
        // Save just the image object's data as a data URL
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
        console.log('Saved image state to history with position:', uploadedImage.left, uploadedImage.top);
      }
      
      // Get ONLY the uploaded image itself, not based on canvas bounds
      let imageData = '';
      
      if (uploadedImage) {
        // Export the image object directly to avoid black margins
        // This gets the actual image content regardless of position/scale
        const maxDimension = 2048; // Increased from 1024 to 2048 for higher quality
        
        // Get the original image dimensions (before scaling)
        const originalWidth = uploadedImage.width!;
        const originalHeight = uploadedImage.height!;
        
        // Calculate export multiplier based on original dimensions
        let exportMultiplier = 1;
        
        // Only scale down if image is larger than max, otherwise keep original or scale up
        if (originalWidth > maxDimension || originalHeight > maxDimension) {
          exportMultiplier = maxDimension / Math.max(originalWidth, originalHeight);
          console.log('Image larger than 2048px, scaling to fit:', exportMultiplier);
        } else if (originalWidth < 1024 && originalHeight < 1024) {
          // Scale up small images to at least 1024px for better AI processing
          exportMultiplier = 1024 / Math.max(originalWidth, originalHeight);
          console.log('Small image detected, scaling up by:', exportMultiplier);
        }
        
        // Export as PNG for lossless quality (better than JPEG compression)
        // PNG preserves all details without compression artifacts
        imageData = uploadedImage.toDataURL({
          format: 'png',  // Changed from 'jpeg' to 'png' for lossless quality
          quality: 1.0,    // Maximum quality
          multiplier: exportMultiplier,
        });
        
        console.log('Exporting actual image, original dimensions:', originalWidth, 'x', originalHeight);
        console.log('Export dimensions:', originalWidth * exportMultiplier, 'x', originalHeight * exportMultiplier);
        console.log('Image data size:', imageData.length, 'bytes');
        console.log('Image format:', imageData.substring(0, 30));
      } else {
        // Fallback to full canvas if no specific image
        const maxDimension = 2048;
        let exportMultiplier = 2; // Start with 2x for better quality
        
        if (DISPLAY_WIDTH * exportMultiplier > maxDimension || DISPLAY_HEIGHT * exportMultiplier > maxDimension) {
          const scale = maxDimension / Math.max(DISPLAY_WIDTH, DISPLAY_HEIGHT);
          exportMultiplier = scale;
        }
        
        imageData = canvas.toDataURL({
          format: 'png',  // PNG for lossless quality
          quality: 1.0,   // Maximum quality
          left: CONTROL_PADDING,
          top: VERTICAL_PADDING,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          multiplier: exportMultiplier,
        });
      }
      
      // Call backend AI edit API
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');
      const response = await fetch(`${backendUrl}/api/ai-edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageData,
          prompt: aiPrompt,
          // No mask for regular AI Edit
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        console.log('AI Edit failed:', result.error);
        
        // Close the modal and show user-friendly alert
        setShowAIModal(false);
        setShowMaskModal(false);
        setIsProcessing(false);
        setAiPrompt('');
        setMaskPrompt('');
        
        // Show appropriate alert based on error type
        if (result.errorType === 'safety_filter' || result.error?.includes('safety filter')) {
          alert('⚠️ The AI safety filter was triggered. Please try with a different prompt.');
        } else if (result.error?.includes('authentication') || result.error?.includes('401')) {
          alert('❌ API authentication failed. Please check your settings.');
        } else if (result.error?.includes('rate limit') || result.error?.includes('429')) {
          alert('⏱️ Rate limit exceeded. Please wait a moment and try again.');
        } else if (result.error?.includes('422') || result.error?.includes('Invalid input')) {
          alert('🖼️ Invalid image format. Please try with a different image.');
        } else {
          alert('❌ ' + (result.error || 'AI processing failed. Please try again.'));
        }
        
        return; // Exit early without throwing error
      }
      
      // Load the edited image back to canvas
      console.log('Loading edited image to canvas...');
      console.log('Image data type:', typeof result.imageUrl);
      console.log('Image data preview:', result.imageUrl.substring(0, 100));
      
      // Create a new Image element first to ensure it loads
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';
      
      imgElement.onload = function() {
        console.log('Image element loaded, dimensions:', imgElement.width, 'x', imgElement.height);
        
        // IMMEDIATELY close modal so user can see the result
        setShowAIModal(false);
        setIsProcessing(false);
        setAiPrompt('');
        
        // Create fabric image from the loaded element
        const fabricImage = new fabric.Image(imgElement);
        
        // Remove current image
        if (uploadedImage) {
          console.log('Removing old image from canvas');
          canvas.remove(uploadedImage);
        }
        
        // Scale and position the new image
        const scale = Math.min(
          (DISPLAY_WIDTH * 0.8) / fabricImage.width!,
          (DISPLAY_HEIGHT * 0.8) / fabricImage.height!
        );
        fabricImage.scale(scale);
        fabricImage.set({
          left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
          top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
          originX: 'center',
          originY: 'center',
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
        
        console.log('Adding new image to canvas with scale:', scale);
        canvas.add(fabricImage);
        canvas.setActiveObject(fabricImage);
        canvas.renderAll();
        setUploadedImage(fabricImage);
        
        console.log('Image successfully added to canvas');
      };
      
      imgElement.onerror = function(error) {
        console.error('Failed to load image element:', error);
        setAiError('Failed to load edited image');
        setIsProcessing(false);
      };
      
      // Set the source to trigger loading
      imgElement.src = result.imageUrl;
      
    } catch (error: any) {
      console.error('AI Edit Error:', error);
      // Close modal and show alert
      setShowAIModal(false);
      setIsProcessing(false);
      setAiPrompt('');
      alert('❌ Failed to process image. Please try again.');
    }
  };
  
  const ensureCanvasBackground = () => {
    // Check if white background exists
    const objects = canvas.getObjects();
    const hasBackground = objects.some((obj: any) => 
      obj.type === 'rect' && obj.fill === 'white' && obj.left === CONTROL_PADDING && obj.top === VERTICAL_PADDING
    );
    
    if (!hasBackground) {
      // Recreate white background
      const canvasBackground = new fabric.Rect({
        left: CONTROL_PADDING,
        top: CONTROL_PADDING,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        fill: 'white',
        selectable: false,
        evented: false,
        excludeFromExport: true
      });
      canvas.add(canvasBackground);
      canvas.sendToBack(canvasBackground);
    }
  };
  
  const handleCreateAIImage = async () => {
    if (!canvas || !createPrompt.trim()) return;
    
    setIsProcessing(true);
    setAiError(null);
    
    try {
      // Save current image state to history BEFORE creating new image
      if (uploadedImage) {
        // Save just the image object's data as a data URL
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
        console.log('Saved image state to history before AI create with position:', uploadedImage.left, uploadedImage.top);
      }
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
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'AI generation failed');
      }
      
      console.log('Loading generated image to canvas...');
      
      // Create a new Image element first to ensure it loads
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';
      
      imgElement.onload = function() {
        console.log('Generated image loaded, dimensions:', imgElement.width, 'x', imgElement.height);
        
        // Clear processing state and prompt
        setIsProcessing(false);
        setCreatePrompt('');
        
        // Create fabric image from the loaded element
        const fabricImage = new fabric.Image(imgElement);
        
        // Remove current image if exists
        if (uploadedImage) {
          canvas.remove(uploadedImage);
        }
        
        // Scale and position the new image
        const scale = Math.min(
          (DISPLAY_WIDTH * 0.8) / fabricImage.width!,
          (DISPLAY_HEIGHT * 0.8) / fabricImage.height!
        );
        fabricImage.scale(scale);
        fabricImage.set({
          left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
          top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
          originX: 'center',
          originY: 'center',
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
        setUploadedImage(fabricImage);
        
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
      
      imgElement.onerror = function(error) {
        console.error('Failed to load generated image:', error);
        setAiError('Failed to load generated image');
        setIsProcessing(false);
      };
      
      // Set the source to trigger loading
      imgElement.src = result.imageUrl;
      
    } catch (error: any) {
      console.error('AI Create Error:', error);
      // Show alert and reset state
      setIsProcessing(false);
      setCreatePrompt('');
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
    
    // Ensure canvas background is still there
    ensureCanvasBackground();
    
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
        
        const dataURL = canvas.toDataURL({
          format: 'png',
          quality: 1.0, // Maximum PNG quality
          left: CONTROL_PADDING,
          top: VERTICAL_PADDING,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          multiplier: exportMultiplier, // Scale to exact print dimensions
          enableRetinaScaling: false,
          withoutTransform: false,
          withoutShadow: true
        });
        
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
        
        // Step 1: Get presigned URL from backend
        console.log('📤 Uploading to backend...');
        setDebugInfo(`Uploading image... Size: ${sizeInMB.toFixed(2)}MB`);
        
        let uploadData;
        try {
          // Upload to backend, which will handle S3
          const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');
          console.log('📤 Uploading to backend:', `${backendUrl}/api/upload-design`);
          setDebugInfo(`Uploading to: ${backendUrl}/api/upload-design`);
          
          const uploadResponse = await fetch(`${backendUrl}/api/chitu/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: dataURL,
              machineId: machineId,
              sessionId: sessionId || `session_${Date.now()}`,
              phoneModel: phoneModel?.displayName || 'Default Phone Case',
              phoneModelId: phoneModel?.id || 'default',
              dimensions: {
                widthPX: EXPORT_WIDTH,
                heightPX: EXPORT_HEIGHT,
                widthMM: phoneModel?.dimensions.widthMM || DEFAULT_WIDTH_MM,
                heightMM: phoneModel?.dimensions.heightMM || DEFAULT_HEIGHT_MM
              }
            }),
          });
          
          console.log('Upload response status:', uploadResponse.status);
          console.log('Upload response ok:', uploadResponse.ok);
          
          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error('Upload error response:', errorText);
            throw new Error(`Failed to upload to backend: ${uploadResponse.status} - ${errorText}`);
          }
          
          uploadData = await uploadResponse.json();
          console.log('✅ Upload successful:', uploadData);
          console.log('Image URL:', uploadData.imageUrl);
        } catch (error: any) {
          console.error('Failed to upload:', error);
          console.error('Error details:', error.stack);
          setDebugInfo(`Upload Error: ${error.message}`);
          
          // Check if it's a duplicate submission error
          if (error.message?.includes('Duplicate') || uploadData?.error?.includes('Duplicate')) {
            alert('Please wait a moment before submitting again.');
          } else {
            alert(`Failed to prepare upload: ${error.message}`);
          }
          
          setIsUploading(false);
          return;
        }
        
        // Backend now handles S3 upload AND job creation/printer notification
        console.log('✅ Backend handled S3 upload and job creation');
        console.log('✅ Job created with ID:', uploadData.jobId);
        console.log('📍 Queue position:', uploadData.queuePosition);
        setDebugInfo(`Success! Queue position: ${uploadData.queuePosition || 1}`);
        setIsUploading(false); // Ensure we stop the loading state
        
        // Mark session as submitted in localStorage
        if (sessionId) {
          const submittedSessions = JSON.parse(localStorage.getItem('submittedSessions') || '[]');
          if (!submittedSessions.includes(sessionId)) {
            submittedSessions.push(sessionId);
            localStorage.setItem('submittedSessions', JSON.stringify(submittedSessions));
            console.log('📝 Marked session as submitted:', sessionId);
          }
        }
        
        // Success! Show thank you page and lock session
        setIsSessionLocked(true);
        setThankYouMessage('Your design has been submitted successfully. Your custom print will be ready shortly!');
        setShowThankYou(true);
        
        console.log('✅ Thank you page should now be showing');
        
        // Prevent back navigation
        window.history.pushState(null, '', window.location.href);
        window.onpopstate = () => {
          window.history.go(1);
        };
      } catch (error) {
        console.error('Error submitting design:', error);
        alert('Failed to submit design');
      }
    }
  };

  // Show loading screen while checking session OR show Thank You page
  if (isCheckingSession || showThankYou) {
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
              <div className="text-3xl mb-6 pulse-glow" style={{color: 'var(--neon-cyan)'}}>⚡</div>
              <div className="text-2xl mb-4" style={{background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>Loading...</div>
              <div className="text-sm" style={{color: 'var(--foreground-muted)'}}>Initializing neural interface</div>
            </div>
          </div>
        </>
      );
    }
    
    // Show Thank You page if session is completed
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
        <div className="h-screen text-white flex flex-col items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="glass-panel p-8 floating-element">
              <div className="text-6xl mb-6 pulse-glow" style={{color: thankYouMessage.includes('expired') || thankYouMessage.includes('Invalid') ? 'var(--neon-pink)' : 'var(--neon-green)'}}>
                {thankYouMessage.includes('expired') || thankYouMessage.includes('Invalid') ? '⏰' : '✨'}
              </div>
              <h1 className="text-3xl font-bold mb-4" style={{background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>
                {thankYouMessage.includes('expired') || thankYouMessage.includes('Invalid') ? 'Session Status' : 'Mission Complete!'}
              </h1>
              <p className="text-xl mb-6" style={{color: 'var(--foreground)'}}>{thankYouMessage}</p>
              
              {sessionId && (
                <div className="glass-panel p-4 mb-6 border" style={{borderColor: 'var(--neon-cyan)'}}>
                  <p className="text-sm mb-2" style={{color: 'var(--neon-cyan)'}}>Session ID:</p>
                  <p className="text-xs font-mono" style={{color: 'var(--foreground-muted)'}}>{sessionId}</p>
                </div>
              )}
              
              <p className="text-sm" style={{color: 'var(--foreground-muted)'}}>
                Scan QR code to initiate new session
              </p>
            </div>
          </div>
        </div>
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
        `}} />
      </Head>
      <div className="editor-page fixed inset-0 bg-gray-50 no-select">
        {/* Mobile container wrapper - matches upload panel structure */}
        <div className="h-full w-full flex flex-col items-center justify-center">
          <div className="w-full max-w-sm h-full bg-white flex flex-col relative">
            {/* Top Header - Fixed height section */}
            {uploadedImage && (
              <div className="flex-shrink-0 px-4 py-2">
                <div className="flex items-center gap-3">
                  <img src="/gif.gif" alt="SweetRobo" className="w-14 h-14 object-contain" />
                  <h1 className="text-base font-bold text-gray-900">Case Bot App</h1>
                </div>
              </div>
            )}

            {/* Beautiful card overlay when no image */}
            {!uploadedImage && (
              <div className="absolute inset-0 z-30 bg-white">
                <div className="h-full w-full flex flex-col px-4 py-3">
                  {/* Header - Fixed at top */}
                  <div className="flex items-center gap-3 mb-4">
                    <img src="/gif.gif" alt="SweetRobo" className="w-14 h-14 object-contain" />
                    <div className="flex-1">
                      <h1 className="text-base font-bold text-gray-900">Case Bot App</h1>
                      <p className="text-xs text-gray-500">Create amazing images with artificial intelligence</p>
                    </div>
                  </div>

                  {/* Upload Section - Expands to fill available space */}
                  <div className="flex-1 flex items-center justify-center mb-4">
                    <div {...getRootProps()} className="w-full h-full max-h-[40vh] min-h-[200px] border-2 border-dashed border-purple-300 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer active:border-purple-400 active:bg-purple-50 transition-all bg-white">
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

                  {/* AI Generate Section - Fixed at bottom with white card */}
                  <div className="bg-white rounded-2xl p-4 shadow-lg space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✨</span>
                      </div>
                      <span className="font-semibold text-gray-900 text-sm">Generate AI Image</span>
                      <span className="ml-auto bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-2.5 py-0.5 rounded-full font-semibold">AI</span>
                    </div>

                    <input
                      type="text"
                      placeholder="Describe your image..."
                      value={createPrompt}
                      onChange={(e) => setCreatePrompt(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"
                    />

                    <button
                      onClick={handleCreateAIImage}
                      disabled={!createPrompt.trim() || isProcessing}
                      className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] text-sm"
                    >
                      {isProcessing ? 'Generating...' : 'Generate Image'}
                    </button>

                    {/* Quick Prompts */}
                    <div className="pt-2">
                      <p className="text-xs text-gray-500 mb-1.5">Quick prompts:</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button onClick={() => setCreatePrompt('Sunset landscape')} className="flex flex-col items-center p-1.5 border border-gray-200 rounded-lg bg-gray-50 active:bg-gray-100">
                          <span className="text-lg mb-0.5">🌅</span>
                          <span className="text-[10px] text-gray-600">Sunset</span>
                        </button>
                        <button onClick={() => setCreatePrompt('Cartoon Cat')} className="flex flex-col items-center p-1.5 border border-gray-200 rounded-lg bg-gray-50 active:bg-gray-100">
                          <span className="text-lg mb-0.5">🐱</span>
                          <span className="text-[10px] text-gray-600">Cartoon Cat</span>
                        </button>
                        <button onClick={() => setCreatePrompt('Abstract Art')} className="flex flex-col items-center p-1.5 border border-gray-200 rounded-lg bg-gray-50 active:bg-gray-100">
                          <span className="text-lg mb-0.5">🎨</span>
                          <span className="text-[10px] text-gray-600">Abstract Art</span>
                        </button>
                        <button onClick={() => setCreatePrompt('Space Galaxy')} className="flex flex-col items-center p-1.5 border border-gray-200 rounded-lg bg-gray-50 active:bg-gray-100">
                          <span className="text-lg mb-0.5">🌌</span>
                          <span className="text-[10px] text-gray-600">Space/Galaxy</span>
                        </button>
                        <button onClick={() => setCreatePrompt('Cherry Blossom')} className="flex flex-col items-center p-1.5 border border-gray-200 rounded-lg bg-gray-50 active:bg-gray-100">
                          <span className="text-lg mb-0.5">🌸</span>
                          <span className="text-[10px] text-gray-600">Cherry Blossom</span>
                        </button>
                        <button onClick={() => setCreatePrompt('Retro Synthwave')} className="flex flex-col items-center p-1.5 border border-gray-200 rounded-lg bg-gray-50 active:bg-gray-100">
                          <span className="text-lg mb-0.5">🌆</span>
                          <span className="text-[10px] text-gray-600">Retro Synthwave</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Canvas Section - No centering, attached to header */}
            <div className="flex-shrink-0">
              <canvas ref={canvasRef} className="no-select" />
            </div>

            {/* Bottom Toolbar - Attached below canvas */}
            {uploadedImage && (
              <div className="flex-shrink-0 px-3 py-1">
                <div className="flex justify-between items-center gap-2 w-full">
              {/* Edit with AI Button */}
              <button
                onClick={() => setShowAIModal(true)}
                className="h-11 px-3 bg-white font-medium rounded-lg flex items-center justify-center gap-1 text-sm shadow-lg"
                style={{
                  background: 'white',
                  color: 'transparent',
                  backgroundImage: 'linear-gradient(135deg, #a855f7, #ec4899)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text'
                }}
              >
                <span style={{
                  backgroundImage: 'linear-gradient(135deg, #a855f7, #ec4899)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent'
                }}>✨</span>
                <span>Edit with AI</span>
              </button>

              {/* Middle buttons group */}
              <div className="flex items-center gap-2">
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
                className="w-11 h-11 bg-white rounded-lg flex flex-col items-center justify-center shadow-lg"
              >
                <span className="text-lg text-black">↺</span>
                <span className="text-[8px] text-gray-600 -mt-1">90°</span>
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
                className="w-11 h-11 bg-white rounded-lg flex flex-col items-center justify-center shadow-lg"
              >
                <span className="text-lg text-black">↻</span>
                <span className="text-[8px] text-gray-600 -mt-1">90°</span>
              </button>

              {/* Crop Button */}
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
                      setShowCropper(true);
                    };
                    img.src = imageDataUrl;
                  }
                }}
                className="w-11 h-11 bg-white rounded-lg flex items-center justify-center shadow-lg"
              >
                <img src="/crop.png" alt="Crop" className="w-5 h-5" />
              </button>
              </div>

              {/* Delete Button */}
              <button
                onClick={() => {
                  if (uploadedImage && canvas) {
                    canvas.remove(uploadedImage);
                    canvas.renderAll();
                    setUploadedImage(null);
                    setCropHistory([]);
                    console.log('Image deleted from canvas');
                  }
                }}
                className="w-11 h-11 bg-white rounded-lg flex items-center justify-center shadow-lg"
              >
                <img src="/delete.png" alt="Delete" className="w-5 h-5" />
              </button>
                </div>
              </div>
            )}

            {/* Spacer to push submit button to bottom */}
            <div className="flex-1"></div>

            {/* Submit Button - Fixed at bottom */}
            <div className="flex-shrink-0 p-3">
          <button
            onClick={handleSubmit}
            className="w-full font-semibold py-3 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
            style={{
              background: !uploadedImage || isUploading ? '#e5e7eb' : 'linear-gradient(135deg, #a855f7, #ec4899)',
              color: !uploadedImage || isUploading ? '#9ca3af' : 'white',
            }}
            disabled={!uploadedImage || isUploading}
          >
            {isUploading ? 'Processing...' : 'Submit Image'}
          </button>
          {/* Debug info for mobile */}
          {debugInfo && (
            <div className="mt-2 p-2 bg-black text-yellow-400 text-xs rounded">
              Debug: {debugInfo}
            </div>
          )}
            </div>
          </div>
        </div>
      </div>
      
      {/* AI Edit Modal */}
      <Modal
        isOpen={showAIModal}
        onRequestClose={() => !isProcessing && setShowAIModal(false)}
        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 glass-panel p-4 w-[90%] max-w-sm max-h-[85vh] overflow-y-auto"
        overlayClassName="fixed inset-0 bg-black bg-opacity-75 z-50"
        shouldCloseOnOverlayClick={true}
      >
        <div className="text-white relative">
          {/* Close button */}
          <button
            onClick={() => setShowAIModal(false)}
            className="absolute -top-2 -right-2 w-8 h-8 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white font-bold"
            disabled={isProcessing}
          >
            ×
          </button>
          <h2 className="text-2xl font-bold mb-4">🤖 AI Image Editor</h2>
          
          {/* Quick Action Templates */}
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">Quick Actions:</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAiPrompt('Remove background')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Remove Background
              </button>
              <button
                onClick={() => setAiPrompt('Enhance quality and make clearer')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Enhance Quality
              </button>
              <button
                onClick={() => setAiPrompt('Make it look like oil painting')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Oil Painting
              </button>
              <button
                onClick={() => setAiPrompt('Convert to cartoon style')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Cartoon Style
              </button>
              <button
                onClick={() => setAiPrompt('Make it vintage')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Vintage
              </button>
              <button
                onClick={() => setAiPrompt('Add sunset lighting')}
                className="px-3 py-1 glass-panel hover:bg-gray-600 rounded text-sm transition-all"
                style={{border: '1px solid var(--neon-purple)', color: 'var(--neon-purple)'}}
                disabled={isProcessing}
              >
                Sunset
              </button>
            </div>
          </div>
          
          {/* Main Prompt Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Describe what you want to change:
            </label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g., Remove the person in the background, Make the sky purple, Add snow..."
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-white"
              rows={3}
              disabled={isProcessing}
            />
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
                setShowAIModal(false);
                setAiPrompt('');
                setAiError(null);
              }}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded font-medium transition"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              onClick={handleAIEdit}
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={isProcessing || !aiPrompt.trim()}
            >
              {isProcessing ? (
                <>
                  <span className="animate-spin">⚙️</span>
                  Processing...
                </>
              ) : (
                <>
                  ✨ Apply AI Edit
                </>
              )}
            </button>
          </div>
          
          {/* Processing Status */}
          {isProcessing && (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-400">AI is working on your image...</p>
              <p className="text-xs text-gray-500 mt-1">This may take 10-30 seconds</p>
            </div>
          )}
        </div>
      </Modal>
      
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
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowCropper(false);
            if (cropperRef.current) {
              cropperRef.current.destroy();
              cropperRef.current = null;
            }
            cropperImageRef.current = null;
          }
        }}>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-gray-800 flex flex-col rounded-lg max-h-[85vh]">
            <div className="p-3 border-b border-gray-600 relative">
              <h2 className="text-white text-lg font-semibold">Crop Image</h2>
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
                className="absolute top-2 right-2 w-8 h-8 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white font-bold"
              >
                ×
              </button>
            </div>
            <div className="flex-1 p-3 flex items-center justify-center overflow-hidden">
              <div className="w-full max-w-[280px] max-h-[400px] flex items-center justify-center">
                <img 
                  ref={cropperElementRef}
                  src={cropperImageRef.current?.src}
                  style={{ maxWidth: '280px', maxHeight: '400px', objectFit: 'contain', display: 'block' }}
                />
              </div>
            </div>
            <div className="p-3 border-t border-gray-600">
              <div className="flex gap-2 w-full">
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
                  className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium text-sm"
                >
                  Apply Crop
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
                  className="flex-1 px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 font-medium text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
