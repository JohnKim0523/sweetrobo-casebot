import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useDropzone } from 'react-dropzone';

export default function SimpleEditor() {
  const router = useRouter();
  const { machine } = router.query;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabric, setFabric] = useState<any>(null);
  const [canvas, setCanvas] = useState<any>(null);
  const [uploadedImage, setUploadedImage] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const CANVAS_WIDTH = 350;
  const CANVAS_HEIGHT = 650;

  // Initialize Fabric.js
  useEffect(() => {
    import('fabric').then((fabricModule) => {
      setFabric(fabricModule);
    });
  }, []);

  // Initialize canvas when fabric loads - EXACTLY like old system
  useEffect(() => {
    if (!fabric || !canvasRef.current || canvas) return;

    console.log('Initializing canvas BEFORE any image upload...');

    // Make sure the canvas element is visible
    canvasRef.current.style.display = 'block';
    canvasRef.current.style.backgroundColor = 'white';

    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: 'white',  // Changed from #f5f5f5 to white
      preserveObjectStacking: true,
      renderOnAddRemove: true  // Force render when objects are added
    });

    // Add phone case outline
    const rect = new fabric.Rect({
      left: 10,
      top: 10,
      width: CANVAS_WIDTH - 20,
      height: CANVAS_HEIGHT - 20,
      fill: 'transparent',
      stroke: '#ddd',
      strokeWidth: 2,
      selectable: false,
      evented: false,
      strokeDashArray: [5, 5]
    });

    fabricCanvas.add(rect);
    setCanvas(fabricCanvas);

    // Force canvas container to have proper dimensions
    const canvasContainer = canvasRef.current?.parentElement;
    if (canvasContainer) {
      const fabricContainer = canvasContainer.querySelector('.canvas-container');
      if (fabricContainer) {
        (fabricContainer as HTMLElement).style.margin = '0 auto';
        (fabricContainer as HTMLElement).style.display = 'block';
      }
    }

    // Force a render to ensure everything displays
    fabricCanvas.renderAll();
    console.log('Canvas ready for image upload');

    return () => {
      fabricCanvas.dispose();
    };
  }, [fabric]);

  // Handle file drop - EXACTLY like old system
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && canvas && fabric) {
      const file = acceptedFiles[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        if (e.target?.result) {
          const imgElement = new Image();

          imgElement.onload = function() {
            console.log('Image loaded, dimensions:', imgElement.width, 'x', imgElement.height);
            console.log('Adding to EXISTING canvas');

            // Wait a tick to ensure image is fully ready
            setTimeout(() => {
              // Create fabric image from HTML element
              const fabricImage = new fabric.Image(imgElement);

            console.log('Fabric image created, dimensions:', fabricImage.width, 'x', fabricImage.height);

            // CRITICAL FIX: Set the image element on the fabric object
            // This ensures the image renders properly
            fabricImage.setElement(imgElement);
            fabricImage._originalElement = imgElement;

            // Remove previous image if exists
            if (uploadedImage) {
              canvas.remove(uploadedImage);
            }

            // Check if dimensions are valid
            if (!fabricImage.width || !fabricImage.height) {
              console.error('ERROR: Fabric image has no dimensions!');
              // Set default dimensions if missing
              fabricImage.width = imgElement.width || 100;
              fabricImage.height = imgElement.height || 100;
            }

            // Scale image to fit canvas
            const scale = Math.min(
              (CANVAS_WIDTH * 0.8) / fabricImage.width,
              (CANVAS_HEIGHT * 0.8) / fabricImage.height
            );

            console.log('Scale calculated:', scale);

            // Ensure scale is valid
            if (isNaN(scale) || scale <= 0) {
              console.error('ERROR: Invalid scale:', scale);
              fabricImage.scaleX = 0.5;
              fabricImage.scaleY = 0.5;
            } else {
              fabricImage.scale(scale);
            }

            fabricImage.set({
              left: CANVAS_WIDTH / 2,
              top: CANVAS_HEIGHT / 2,
              originX: 'center',
              originY: 'center',
              opacity: 1,  // Ensure it's visible
              visible: true  // Ensure it's visible
            });

            console.log('Final image properties:', {
              left: fabricImage.left,
              top: fabricImage.top,
              width: fabricImage.width,
              height: fabricImage.height,
              scaleX: fabricImage.scaleX,
              scaleY: fabricImage.scaleY,
              opacity: fabricImage.opacity
            });

            // Add to canvas
            canvas.add(fabricImage);

            // CRITICAL: Force the image to refresh its cache
            fabricImage.dirty = true;
            fabricImage.setCacheProperties();

            // Set as active
            canvas.setActiveObject(fabricImage);

            // Ensure the Fabric wrapper div is visible
            const container = canvas.getElement().parentElement;
            if (container) {
              container.style.position = 'relative';
              container.style.display = 'block';
              container.style.margin = '0 auto';
            }

            // Force multiple renders to ensure display
            canvas.renderAll();
            canvas.requestRenderAll();

            // Force image to re-render
            fabricImage.dirty = true;
            fabricImage.render(canvas.getContext());

            // Also try calcOffset to recalculate canvas position
            canvas.calcOffset();

            setTimeout(() => {
              canvas.renderAll();
              console.log('Canvas objects count:', canvas.getObjects().length);
              console.log('All canvas objects:', canvas.getObjects());

              // Log the actual canvas element to see if it has content
              const ctx = canvas.getContext();
              if (ctx) {
                const imageData = ctx.getImageData(0, 0, 50, 50);
                console.log('First 50x50 pixels has data?', imageData.data.some(pixel => pixel !== 0));
              }
            }, 100);

            setUploadedImage(fabricImage);
            console.log('Image successfully added to canvas');
            }, 0); // End of setTimeout
          };

          imgElement.src = e.target.result as string;
        }
      };

      reader.readAsDataURL(file);
    } else {
      console.log('Canvas not ready or no file:', { canvas: !!canvas, fabric: !!fabric });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    multiple: false,
    maxSize: 10485760 // 10MB
  });

  const handlePrint = async () => {
    if (!canvas) return;

    setIsProcessing(true);
    try {
      const imageData = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 2
      });

      const response = await fetch('/api/chitu/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
          machineId: machine || 'CT0700026',
          sessionId: `session-${Date.now()}`,
        })
      });

      if (!response.ok) throw new Error('Print failed');

      const result = await response.json();
      router.push(`/success?orderId=${result.orderId}`);
    } catch (error) {
      console.error('Print error:', error);
      alert('Failed to send print job. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Head>
        <title>Simple Editor - SweetRobo CaseBot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-center mb-4">Simple Editor (Like Old System)</h1>

          {/* Main container */}
          <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col lg:flex-row gap-6">
            {/* Canvas - ALWAYS VISIBLE */}
            <div className="flex-1" style={{ minHeight: '700px' }}>
              <canvas
                ref={canvasRef}
                className="border border-gray-300 rounded-lg mx-auto"
                style={{ display: 'block' }}
              />
              {/* Debug: Show raw canvas data URL */}
              <button
                onClick={() => {
                  if (canvas) {
                    const dataUrl = canvas.toDataURL();
                    console.log('Canvas data URL:', dataUrl.substring(0, 100));
                    // Open in new window to see what's actually on canvas
                    const win = window.open();
                    if (win) {
                      win.document.write(`<img src="${dataUrl}" />`);
                    }
                  }
                }}
                className="mt-2 text-xs text-blue-500 underline"
              >
                View canvas contents in new window
              </button>
            </div>

            {/* Controls */}
            <div className="w-full lg:w-64 space-y-4">
              {/* Upload Zone - ON SAME PAGE AS CANVAS */}
              {!uploadedImage && (
                <div
                  {...getRootProps()}
                  className={`
                    border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
                    ${isDragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:bg-gray-50'}
                  `}
                >
                  <input {...getInputProps()} />
                  <div className="text-4xl mb-2">📷</div>
                  <p className="font-semibold">
                    {isDragActive ? 'Drop image here' : 'Drop image or click'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    JPG, PNG, GIF up to 10MB
                  </p>
                </div>
              )}

              {/* Image loaded indicator */}
              {uploadedImage && (
                <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                  <p className="text-green-700 font-semibold">✓ Image loaded</p>
                  <p className="text-sm text-gray-600 mt-1">You can manipulate it on the canvas</p>
                </div>
              )}

              {/* Replace image button */}
              {uploadedImage && (
                <div
                  {...getRootProps()}
                  className="border border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-50"
                >
                  <input {...getInputProps()} />
                  <p className="text-sm">Click to replace image</p>
                </div>
              )}

              {/* Debug: Force re-render button */}
              {uploadedImage && (
                <button
                  onClick={() => {
                    console.log('Force re-render...');
                    if (canvas && uploadedImage) {
                      // Check if image is actually visible
                      console.log('Image visible?', uploadedImage.visible);
                      console.log('Image opacity?', uploadedImage.opacity);
                      console.log('Image position:', uploadedImage.left, uploadedImage.top);
                      console.log('Image size:', uploadedImage.getScaledWidth(), 'x', uploadedImage.getScaledHeight());

                      // Force visibility
                      uploadedImage.set({
                        visible: true,
                        opacity: 1
                      });

                      // Move to front
                      canvas.bringObjectToFront(uploadedImage);

                      // Force multiple renders
                      canvas.renderAll();
                      canvas.requestRenderAll();

                      console.log('Canvas backgroundColor:', canvas.backgroundColor);
                      console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
                      console.log('Canvas objects:', canvas.getObjects());
                    }
                  }}
                  className="w-full py-2 bg-yellow-500 text-white rounded-lg"
                >
                  Force Re-render (Debug)
                </button>
              )}

              {/* Print button */}
              <button
                onClick={handlePrint}
                disabled={!uploadedImage || isProcessing}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Processing...' : 'Print Design'}
              </button>

              {/* Debug info */}
              <div className="text-xs text-gray-500 space-y-1">
                <p>Canvas: {canvas ? '✓ Ready' : '⏳ Loading'}</p>
                <p>Fabric: {fabric ? '✓ Loaded' : '⏳ Loading'}</p>
                <p>Image: {uploadedImage ? '✓ Displayed' : '- None'}</p>
                <p>Machine: {machine || 'CT0700026'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}