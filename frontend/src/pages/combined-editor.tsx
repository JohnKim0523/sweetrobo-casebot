import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useDropzone } from 'react-dropzone';

export default function UnifiedEditor() {
  const router = useRouter();
  const { machine } = router.query;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasInstanceRef = useRef<any>(null); // Use ref for canvas instance
  const [fabric, setFabric] = useState<any>(null);
  const [canvas, setCanvas] = useState<any>(null);
  const [uploadedImage, setUploadedImage] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [createPrompt, setCreatePrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const pendingImageRef = useRef<string | null>(null); // Store pending image

  // Canvas dimensions - from old editor
  const DISPLAY_WIDTH = 350;
  const DISPLAY_HEIGHT = 650;
  const CONTROL_PADDING = 20;
  const VERTICAL_PADDING = 20;
  const CANVAS_TOTAL_WIDTH = DISPLAY_WIDTH + (CONTROL_PADDING * 2);
  const CANVAS_TOTAL_HEIGHT = DISPLAY_HEIGHT + (VERTICAL_PADDING * 2);

  // Initialize Fabric.js
  useEffect(() => {
    import('fabric').then((fabricModule) => {
      setFabric(fabricModule);
    });
  }, []);

  // Initialize canvas when fabric loads AND we're ready to show it
  useEffect(() => {
    if (!fabric || !canvasRef.current || !showCanvas || canvas) return;

    console.log('Initializing canvas after upload...');

    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: CANVAS_TOTAL_WIDTH,
      height: CANVAS_TOTAL_HEIGHT,
      backgroundColor: '#1a1a2e',
      containerClass: 'canvas-container',
      selection: true,  // Changed to true
      preserveObjectStacking: true,
      renderOnAddRemove: true,  // Force render when objects are added
      enableRetinaScaling: false  // Disable retina scaling which can cause issues
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
    // Don't use sendToBack as it might not exist in this version

    // Remove clipping for now - it might be causing rendering issues
    // fabricCanvas.clipPath = new fabric.Rect({
    //   left: CONTROL_PADDING,
    //   top: VERTICAL_PADDING,
    //   width: DISPLAY_WIDTH,
    //   height: DISPLAY_HEIGHT,
    //   absolutePositioned: true
    // });

    setCanvas(fabricCanvas);
    canvasInstanceRef.current = fabricCanvas; // Store in ref

    // If we have a pending image, add it now
    if (pendingImageRef.current) {
      console.log('Found pending image, adding to canvas...');
      const imageData = pendingImageRef.current;

      const imgElement = new Image();

      // CRITICAL: Set crossOrigin to avoid tainted canvas issues
      imgElement.crossOrigin = 'anonymous';

      imgElement.onload = function() {
        console.log('Pending image loaded, dimensions:', imgElement.width, 'x', imgElement.height);

        // Create fabric image immediately - no delay
        const fabricImage = new fabric.Image(imgElement);

        // Scale to fit
        const maxDisplayWidth = DISPLAY_WIDTH * 0.8;
        const maxDisplayHeight = DISPLAY_HEIGHT * 0.8;
        const scale = Math.min(maxDisplayWidth / fabricImage.width!, maxDisplayHeight / fabricImage.height!);
        fabricImage.scale(scale);

        // Position
        fabricImage.set({
          left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
          top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
          originX: 'center',
          originY: 'center'
        });

        // Add to canvas
        fabricCanvas.add(fabricImage);
        fabricCanvas.setActiveObject(fabricImage);
        fabricCanvas.renderAll();

        setUploadedImage(fabricImage);
        console.log('Image added to canvas, objects:', fabricCanvas.getObjects());

        // Clear the pending image
        pendingImageRef.current = null;
      };

      imgElement.src = imageData;
    }

    return () => {
      fabricCanvas.dispose();
    };
  }, [fabric, showCanvas]);

  // Handle image upload - triggers canvas creation and image loading
  const handleImageUpload = (imageDataUrl: string) => {
    console.log('Image uploaded, preparing canvas...');
    console.log('Image data starts with:', imageDataUrl.substring(0, 50));

    // Store the image data in ref for the canvas to use when it's ready
    pendingImageRef.current = imageDataUrl;

    // Show canvas section (this will trigger canvas creation and the useEffect will add the image)
    setShowCanvas(true);
  };

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      console.log('File selected:', file.name);

      const reader = new FileReader();

      reader.onload = (e) => {
        if (e.target?.result) {
          handleImageUpload(e.target.result as string);
        }
      };

      reader.onerror = () => {
        setError('Failed to read file. Please try again.');
      };

      reader.readAsDataURL(file);
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

  const handleCreateAIImage = async () => {
    if (!createPrompt.trim()) return;

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: createPrompt })
      });

      if (!response.ok) throw new Error('Failed to generate image');

      const data = await response.json();
      if (data.imageUrl) {
        handleImageUpload(data.imageUrl);
      }
    } catch (err) {
      setError('Failed to generate AI image. Please try again.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const quickPrompts = [
    { emoji: '🌅', label: 'Sunset Beach', prompt: 'beautiful sunset over ocean waves' },
    { emoji: '🐱', label: 'Cute Cat', prompt: 'adorable cartoon cat with big eyes' },
    { emoji: '🎨', label: 'Abstract Art', prompt: 'colorful abstract geometric patterns' },
    { emoji: '🚀', label: 'Space', prompt: 'galaxy with planets and stars' },
    { emoji: '🌸', label: 'Cherry Blossom', prompt: 'pink cherry blossoms in spring' },
    { emoji: '🌆', label: 'Cyberpunk', prompt: 'neon cyberpunk city at night' }
  ];

  const handlePrint = async () => {
    if (!canvas || !uploadedImage) return;

    setIsProcessing(true);
    try {
      // Export just the display area
      const imageData = canvas.toDataURL({
        format: 'png',
        quality: 1,
        left: CONTROL_PADDING,
        top: VERTICAL_PADDING,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
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

  const handleBack = () => {
    setShowCanvas(false);
    setUploadedImage(null);
    setCreatePrompt('');
    if (canvas) {
      // Remove the image from canvas
      const objects = canvas.getObjects();
      objects.forEach((obj: any) => {
        if (obj.type === 'image') {
          canvas.remove(obj);
        }
      });
      canvas.renderAll();
    }
  };

  return (
    <>
      <Head>
        <title>Design Your Case - SweetRobo CaseBot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
      </Head>

      {!showCanvas ? (
        // Upload UI - EXACT COPY from current upload.tsx
        <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <img src="/sweetrobo-logo.gif" alt="SweetRobo" className="w-14 h-14" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Case Bot</h1>
                <p className="text-sm text-gray-600">Choose or create your design</p>
              </div>
            </div>

            {/* Upload Section */}
            <div
              {...getRootProps()}
              className={`
                relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer
                ${isDragActive
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-300 bg-gray-50 hover:bg-purple-50 hover:border-purple-400'}
              `}
            >
              <input {...getInputProps()} />

              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>

              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {isDragActive ? 'Drop your image here' : 'Upload your image'}
              </h2>
              <p className="text-sm text-gray-500">
                Drag & drop or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-2">
                JPG, PNG, GIF up to 10MB
              </p>
            </div>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Or generate with AI</span>
              </div>
            </div>

            {/* AI Generation */}
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Describe your dream design..."
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateAIImage()}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="text-2xl">✨</span>
                </div>
              </div>

              <button
                onClick={handleCreateAIImage}
                disabled={!createPrompt.trim() || isProcessing}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Generating...
                  </span>
                ) : (
                  'Generate AI Image'
                )}
              </button>

              {/* Quick Prompts */}
              <div>
                <p className="text-xs text-gray-500 mb-3">Quick ideas:</p>
                <div className="grid grid-cols-3 gap-2">
                  {quickPrompts.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => setCreatePrompt(item.prompt)}
                      className="p-3 bg-gray-50 hover:bg-purple-50 rounded-xl border border-gray-200 hover:border-purple-300 transition-all group"
                    >
                      <div className="text-2xl mb-1">{item.emoji}</div>
                      <div className="text-xs text-gray-600 group-hover:text-purple-600">{item.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Canvas Editor - from old working editor
        <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex flex-col">
          {/* Header */}
          <div className="bg-white shadow-sm px-4 py-3">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <h1 className="font-semibold text-gray-900">Edit Your Design</h1>

              <button
                onClick={handlePrint}
                disabled={isProcessing || !uploadedImage}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-md"
              >
                {isProcessing ? 'Processing...' : 'Print'}
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <canvas ref={canvasRef} />

              {/* Debug controls */}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    if (canvasInstanceRef.current) {
                      console.log('Force rendering...');
                      const c = canvasInstanceRef.current;

                      // Get the raw canvas context
                      const ctx = c.getContext();
                      const canvasEl = c.getElement();

                      console.log('Canvas element:', canvasEl);
                      console.log('Canvas dimensions:', canvasEl.width, 'x', canvasEl.height);

                      // Try to manually draw the image
                      const objects = c.getObjects();
                      objects.forEach((obj: any) => {
                        if (obj.type === 'image') {
                          console.log('Image found:', {
                            visible: obj.visible,
                            opacity: obj.opacity,
                            width: obj.width,
                            height: obj.height,
                            element: obj._element,
                            left: obj.left,
                            top: obj.top
                          });

                          // Try to manually draw the image element
                          if (obj._element) {
                            console.log('Manually drawing image to canvas...');
                            ctx.save();
                            ctx.globalAlpha = obj.opacity || 1;

                            // Draw the image directly
                            try {
                              ctx.drawImage(
                                obj._element,
                                obj.left - (obj.width * obj.scaleX) / 2,
                                obj.top - (obj.height * obj.scaleY) / 2,
                                obj.width * obj.scaleX,
                                obj.height * obj.scaleY
                              );
                              console.log('Manual draw complete');
                            } catch (e) {
                              console.error('Manual draw failed:', e);
                            }

                            ctx.restore();
                          }
                        }
                      });

                      // Also try Fabric's render
                      c.renderAll();
                    }
                  }}
                  className="px-3 py-1 bg-yellow-500 text-white rounded text-sm"
                >
                  Force Render (Debug)
                </button>

                <button
                  onClick={() => {
                    if (canvasInstanceRef.current) {
                      const dataUrl = canvasInstanceRef.current.toDataURL();
                      const win = window.open();
                      if (win) {
                        win.document.write(`<img src="${dataUrl}" />`);
                      }
                    }
                  }}
                  className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
                >
                  View Canvas Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}