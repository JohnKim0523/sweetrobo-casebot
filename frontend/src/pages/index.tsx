import React, { useRef, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<any>(null);
  const [uploadedImage, setUploadedImage] = useState<any>(null);
  const [fabric, setFabric] = useState<any>(null);
  const [crosshairLines, setCrosshairLines] = useState<{vertical: any, horizontal: any}>({vertical: null, horizontal: null});
  const [isSnapping, setIsSnapping] = useState(false);

  useEffect(() => {
    // Dynamically import fabric to avoid SSR issues
    import('fabric').then((fabricModule) => {
      setFabric(fabricModule);
    });
  }, []);

  useEffect(() => {
    if (canvasRef.current && fabric) {
      const fabricCanvas = new fabric.Canvas(canvasRef.current, {
        width: 150,  // Exact phone case width
        height: 350, // Exact phone case height
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

      // Phone case is the entire canvas - no padding needed
      const phoneCase = new fabric.Rect({
        left: 0,
        top: 0,
        width: 150,
        height: 350,
        fill: 'white',
        stroke: '#333',
        strokeWidth: 2,
        selectable: false,
        evented: false
      });

      // Create crosshair guidelines
      const centerX = 75; // Center of canvas
      const centerY = 175; // Center of canvas
      
      const verticalLine = new fabric.Line([centerX, 0, centerX, 350], {
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
      
      const horizontalLine = new fabric.Line([0, centerY, 150, centerY], {
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

      fabricCanvas.add(phoneCase);
      
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
      
      // Set up object movement handling with snap-to-center
      fabricCanvas.on('object:moving', function(e: any) {
        const obj = e.target;
        const objBoundingRect = obj.getBoundingRect(true);
        
        // Snap to center functionality
        const snapThreshold = 10;
        const objCenterX = objBoundingRect.left + objBoundingRect.width / 2;
        const objCenterY = objBoundingRect.top + objBoundingRect.height / 2;
        let snapped = false;
        
        if (Math.abs(objCenterX - centerX) < snapThreshold) {
          obj.left = centerX - (objBoundingRect.width / 2 - (obj.left - objBoundingRect.left));
          verticalLine.set({ stroke: '#ff0000', strokeWidth: 2 });
          snapped = true;
        }
        
        if (Math.abs(objCenterY - centerY) < snapThreshold) {
          obj.top = centerY - (objBoundingRect.height / 2 - (obj.top - objBoundingRect.top));
          horizontalLine.set({ stroke: '#ff0000', strokeWidth: 2 });
          snapped = true;
        }
        
        if (!snapped && isSnapping) {
          verticalLine.set({ stroke: '#00ff00', strokeWidth: 1 });
          horizontalLine.set({ stroke: '#00ff00', strokeWidth: 1 });
        }
        
        setIsSnapping(snapped);
        fabricCanvas.renderAll();
      });
      
      // Handle object modifications (scaling, rotating)
      fabricCanvas.on('object:modified', function(e: any) {
        // Crosshairs are kept on top via object:added event
      });
      
      // Reset snap indicators on mouse up
      fabricCanvas.on('mouse:up', function() {
        if (isSnapping) {
          verticalLine.set({ stroke: '#00ff00', strokeWidth: 1 });
          horizontalLine.set({ stroke: '#00ff00', strokeWidth: 1 });
          fabricCanvas.renderAll();
          setIsSnapping(false);
        }
      });
      
      fabricCanvas.on('mouse:up', function() {
        if (isSnapping) {
          verticalLine.set({ stroke: '#00ff00', strokeWidth: 1 });
          horizontalLine.set({ stroke: '#00ff00', strokeWidth: 1 });
          fabricCanvas.renderAll();
          setIsSnapping(false);
        }
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

            // Scale image to fit within phone case
            const scale = Math.min(125 / fabricImage.width!, 325 / fabricImage.height!);
            fabricImage.scale(scale);
            
            // Center the image on the phone case
            const imgWidth = fabricImage.width! * scale;
            const imgHeight = fabricImage.height! * scale;
            fabricImage.set({
              left: (150 - imgWidth) / 2, // Center on canvas
              top: (350 - imgHeight) / 2  // Center on canvas
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
        // Create a temporary canvas for the phone case area
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 150;  // Phone case width
        tempCanvas.height = 350; // Phone case height
        const ctx = tempCanvas.getContext('2d');
        
        if (!ctx) {
          alert('Failed to create canvas context');
          return;
        }
        
        // Fill with white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 150, 350);
        
        // Method 1: Use Fabric's built-in toDataURL with cropping
        // Hide crosshairs before export
        const originalVerticalVisible = crosshairLines.vertical?.visible;
        const originalHorizontalVisible = crosshairLines.horizontal?.visible;
        
        if (crosshairLines.vertical) crosshairLines.vertical.visible = false;
        if (crosshairLines.horizontal) crosshairLines.horizontal.visible = false;
        
        canvas.renderAll();
        
        // Export the entire canvas (which is now just the phone case)
        const dataURL = canvas.toDataURL({
          format: 'png',
          multiplier: 1
        });
        
        // Restore crosshairs
        if (crosshairLines.vertical) crosshairLines.vertical.visible = originalVerticalVisible;
        if (crosshairLines.horizontal) crosshairLines.horizontal.visible = originalHorizontalVisible;
        canvas.renderAll();
        
        // Get canvas state for debugging
        const canvasData = {
          objects: canvas.getObjects().filter((obj: any) => {
            // Filter out UI elements
            return obj !== crosshairLines.vertical && 
                   obj !== crosshairLines.horizontal && 
                   !(obj.fill === '#f0f0f0') &&
                   !(obj.stroke === '#333' && obj.width === 150);
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
          canvasWidth: 150,  // Phone case width
          canvasHeight: 350, // Phone case height
          backgroundColor: 'white'
        };
        
        // Send to backend
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

        if (response.ok) {
          alert('Design submitted successfully!');
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
        <div className="relative" style={{ width: '150px', height: '350px', overflow: 'visible', padding: '20px' }}>
          <canvas ref={canvasRef} style={{ position: 'absolute' }} />
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
