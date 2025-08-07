import React, { useRef, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';

// Canvas dimensions - matching actual printer dimensions: 100mm × 185mm (portrait)
// Scale up by 3x for better UI visibility while maintaining exact ratio
const SCALE_FACTOR = 3;  // 3x larger for UI
const DISPLAY_WIDTH = 100 * SCALE_FACTOR;   // 300 pixels (represents 100mm)
const DISPLAY_HEIGHT = 185 * SCALE_FACTOR;  // 555 pixels (represents 185mm)

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<any>(null);
  const [uploadedImage, setUploadedImage] = useState<any>(null);
  const [fabric, setFabric] = useState<any>(null);
  const [crosshairLines, setCrosshairLines] = useState<{vertical: any, horizontal: any}>({vertical: null, horizontal: null});
  const [isSnapping, setIsSnapping] = useState(false);
  const snapStateRef = useRef<{x: boolean, y: boolean}>({x: false, y: false});
  const hasSnappedRef = useRef<{x: boolean, y: boolean, rotation: boolean}>({x: false, y: false, rotation: false});
  const mouseCanvasPos = useRef<{x: number, y: number}>({x: 0, y: 0});
  const lockMousePos = useRef<{x: number, y: number}>({x: 0, y: 0});
  const lockedObjectPos = useRef<{x: number, y: number}>({x: 0, y: 0});
  const lockMouseAngle = useRef<number>(0);
  const lockedRotation = useRef<number>(0);
  const isRotating = useRef<boolean>(false);

  useEffect(() => {
    // Dynamically import fabric to avoid SSR issues
    import('fabric').then((fabricModule) => {
      setFabric(fabricModule);
    });
  }, []);

  useEffect(() => {
    if (canvasRef.current && fabric) {
      const fabricCanvas = new fabric.Canvas(canvasRef.current, {
        width: DISPLAY_WIDTH,   // 100px
        height: DISPLAY_HEIGHT,  // 200px
        backgroundColor: 'white',
        containerClass: 'canvas-container',
        selection: true,
        preserveObjectStacking: true
      });
      
      // Configure default control settings for mobile-friendly interaction
      fabric.Object.prototype.transparentCorners = false;
      fabric.Object.prototype.cornerColor = '#2196F3';
      fabric.Object.prototype.cornerSize = 10; // Scaled down
      fabric.Object.prototype.cornerStyle = 'circle';
      fabric.Object.prototype.borderColor = '#2196F3';
      fabric.Object.prototype.borderScaleFactor = 2;
      fabric.Object.prototype.padding = 10; // Reduced padding around objects

      // Add border as a fabric object
      const border = new fabric.Rect({
        left: 0,
        top: 0,
        width: DISPLAY_WIDTH,  // 100px
        height: DISPLAY_HEIGHT, // 200px
        fill: 'transparent',
        stroke: '#333',
        strokeWidth: 1,
        selectable: false,
        evented: false
      });

      // Create crosshair guidelines
      const centerX = DISPLAY_WIDTH / 2;   // 50px
      const centerY = DISPLAY_HEIGHT / 2;  // 100px
      
      const verticalLine = new fabric.Line([centerX, 0, centerX, DISPLAY_HEIGHT], {
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
      
      const horizontalLine = new fabric.Line([0, centerY, DISPLAY_WIDTH, centerY], {
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
      
      // Set up smooth magnetic snap-to-center
      fabricCanvas.on('object:moving', function(e: any) {
        const obj = e.target;
        
        // Skip position snapping if we're rotating
        if (isRotating.current) {
          return;
        }
        
        // Enforce canvas boundaries with more lenient approach for rotated objects
        const objBounds = obj.getBoundingRect(true, true);
        
        // Only enforce boundaries if object is completely outside canvas
        // This allows free movement while preventing objects from getting lost
        let needsAdjustment = false;
        let adjustX = 0;
        let adjustY = 0;
        
        // Check if completely outside canvas boundaries
        if (objBounds.left > DISPLAY_WIDTH) {
          // Completely off the right edge
          adjustX = DISPLAY_WIDTH - objBounds.left - objBounds.width;
          needsAdjustment = true;
        } else if (objBounds.left + objBounds.width < 0) {
          // Completely off the left edge
          adjustX = -objBounds.left;
          needsAdjustment = true;
        }
        
        if (objBounds.top > DISPLAY_HEIGHT) {
          // Completely off the bottom edge
          adjustY = DISPLAY_HEIGHT - objBounds.top - objBounds.height;
          needsAdjustment = true;
        } else if (objBounds.top + objBounds.height < 0) {
          // Completely off the top edge
          adjustY = -objBounds.top;
          needsAdjustment = true;
        }
        
        // Apply adjustment if needed
        if (needsAdjustment) {
          obj.left += adjustX;
          obj.top += adjustY;
          obj.setCoords();
        }
        
        // Get current mouse position
        const mousePos = mouseCanvasPos.current;
        
        // Check if we're currently locked
        const isLockedX = hasSnappedRef.current.x;
        const isLockedY = hasSnappedRef.current.y;
        
        // Thresholds
        const snapZone = 5; // Zone to trigger initial snap
        const releaseDistance = 15; // Mouse must move this far from lock position to release
        
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
        const centerX = DISPLAY_WIDTH / 2;   // 50px
        const centerY = DISPLAY_HEIGHT / 2;  // 100px
        
        if (!isLockedX || !isLockedY) {
          const objBoundingRect = obj.getBoundingRect(true);
          const objCenterX = objBoundingRect.left + objBoundingRect.width / 2;
          const objCenterY = objBoundingRect.top + objBoundingRect.height / 2;
          const objDistanceX = Math.abs(objCenterX - centerX);
          const objDistanceY = Math.abs(objCenterY - centerY);
          
          // Check X-axis for initial snap
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
        const rotationSnapZone = 5; // Degrees to trigger snap
        const rotationReleaseThreshold = 10; // Degrees to release
        
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
        // Reset rotation flag
        isRotating.current = false;
        // Don't reset snap state here - let the object:moving handler manage it based on position
      });
      
      setCanvas(fabricCanvas);

      return () => {
        fabricCanvas.dispose();
      };
    }
  }, [fabric]);

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

            // Scale image to fit within display canvas
            const maxDisplayWidth = DISPLAY_WIDTH * 0.8;  // 80% of canvas width
            const maxDisplayHeight = DISPLAY_HEIGHT * 0.8; // 80% of canvas height
            const scale = Math.min(maxDisplayWidth / fabricImage.width!, maxDisplayHeight / fabricImage.height!);
            fabricImage.scale(scale);
            
            // Center the image on the canvas
            fabricImage.set({
              left: DISPLAY_WIDTH / 2,  // Center position
              top: DISPLAY_HEIGHT / 2,  // Center position
              originX: 'center',
              originY: 'center'
            });

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

  const handleSubmit = async () => {
    if (canvas) {
      try {
        // First, temporarily hide crosshair lines
        const originalVerticalVisible = crosshairLines.vertical?.visible;
        const originalHorizontalVisible = crosshairLines.horizontal?.visible;
        if (crosshairLines.vertical) crosshairLines.vertical.visible = false;
        if (crosshairLines.horizontal) crosshairLines.horizontal.visible = false;
        
        // Also hide the border rect
        const borderRect = canvas.getObjects().find((obj: any) => 
          obj.type === 'rect' && obj.stroke === '#333' && obj.fill === 'transparent'
        );
        const originalBorderVisible = borderRect?.visible;
        if (borderRect) borderRect.visible = false;
        
        // Export the canvas directly
        canvas.renderAll();
        
        // Export at printer size (100x185) by scaling down from display size
        // Display is 3x larger, so divide by SCALE_FACTOR to get printer size
        const dataURL = canvas.toDataURL({
          format: 'png',
          left: 0,
          top: 0,
          width: DISPLAY_WIDTH,   // 300px display size
          height: DISPLAY_HEIGHT, // 555px display size
          multiplier: 1 / SCALE_FACTOR // Scale down by 3x to get 100x185 for printer
        });
        
        // Export at 1:1 scale - no multiplier
        // This was likely working before
        const printerMultiplier = 1; // No scaling - exact size
        
        const jpegDataURL = canvas.toDataURL({
          format: 'jpeg',
          quality: 0.95,
          left: 0,
          top: 0,
          width: DISPLAY_WIDTH,   // 300px display
          height: DISPLAY_HEIGHT, // 555px display
          multiplier: 1 / SCALE_FACTOR, // Scale down to 100x185 for printer
          enableRetinaScaling: false,
          withoutTransform: false,
          withoutShadow: true
        });
        
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
        
        // Check what's visible in the canvas bounds
        const visibleObjects = canvas.getObjects().filter((obj: any) => {
          if (!obj.visible) return false;
          const bounds = obj.getBoundingRect();
          return bounds.left < DISPLAY_WIDTH && 
                 bounds.top < DISPLAY_HEIGHT && 
                 bounds.left + bounds.width > 0 && 
                 bounds.top + bounds.height > 0;
        });
        console.log('Objects visible in canvas bounds:', visibleObjects.length);
        
        // Create a test export to verify content
        const testExport = canvas.toDataURL({
          format: 'png',
          left: 0,
          top: 0,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          multiplier: 1
        });
        console.log('Test export (100x200) data URL length:', testExport.length);
        console.log('Test export starts with:', testExport.substring(0, 50));
        
        // Debug: Check data URL
        console.log('JPEG multiplier:', printerMultiplier);
        console.log('JPEG export size:', `${DISPLAY_WIDTH * printerMultiplier}x${DISPLAY_HEIGHT * printerMultiplier}`);
        console.log('JPEG data URL starts with:', jpegDataURL.substring(0, 50));
        console.log('JPEG data size:', jpegDataURL.length);
        
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
        
        // Send to backend (save locally)
        const response = await fetch('/api/submit-design', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            design: dataURL,
            debugData: canvasData,
            timestamp: Date.now()
          }),
        });

        if (!response.ok) {
          alert('Failed to save design locally');
          return;
        }
        
        // Also send to printer
        console.log('Sending to printer...');
        console.log('JPEG data URL length:', jpegDataURL.length);
        console.log('JPEG data URL preview:', jpegDataURL.substring(0, 100));
        
        const printerResponse = await fetch('/api/printer-submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageData: jpegDataURL,  // Use JPEG for printer
            canvasData: canvasData
          }),
        });
        
        if (printerResponse.ok) {
          const printerData = await printerResponse.json();
          console.log('Printer response:', printerData);
          alert('Design submitted successfully to printer!');
        } else {
          const error = await printerResponse.json();
          console.error('Printer submission failed:', error);
          alert('Design saved locally but failed to send to printer: ' + error.error);
        }
      } catch (error) {
        console.error('Error submitting design:', error);
        alert('Failed to submit design');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-8">
      <h1 className="text-3xl font-bold mb-8">Phone Case Designer</h1>
      
      <div className="flex gap-8">
        <div className="relative border-2 border-gray-500 rounded" style={{ width: `${DISPLAY_WIDTH}px`, height: `${DISPLAY_HEIGHT}px`, overflow: 'hidden' }}>
          <canvas ref={canvasRef} />
        </div>
        
        <div className="flex flex-col gap-4">
          <div 
            {...getRootProps()} 
            className="border-2 border-dashed border-gray-500 p-8 rounded cursor-pointer hover:border-gray-400 transition"
          >
            <input {...getInputProps()} />
            <p>Drop an image here or click to upload</p>
          </div>
          
          <button
            onClick={handleSubmit}
            className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded font-semibold transition"
          >
            Submit Design
          </button>
        </div>
      </div>
    </div>
  );
}
