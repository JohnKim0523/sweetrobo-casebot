import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useDropzone } from 'react-dropzone';

export default function FinalEditor() {
  const router = useRouter();
  const { machine } = router.query;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabric, setFabric] = useState<any>(null);
  const [canvas, setCanvas] = useState<any>(null);
  const [uploadedImage, setUploadedImage] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [createPrompt, setCreatePrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Canvas dimensions - EXACT from old editor
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

  // Initialize canvas - EXACT from old working editor
  useEffect(() => {
    if (!canvasRef.current || !fabric || canvas) {
      return;
    }

    console.log('Initializing canvas with old working code...');

    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: CANVAS_TOTAL_WIDTH,
      height: CANVAS_TOTAL_HEIGHT,
      backgroundColor: '#1a1a2e',
      containerClass: 'canvas-container',
      selection: false,
      allowTouchScrolling: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: false,
      fireMiddleClick: false,
      moveCursor: 'default',
      hoverCursor: 'default',
      selectionColor: 'transparent',
      selectionBorderColor: 'transparent',
      selectionLineWidth: 0,
      selectionDashArray: [],
      skipTargetFind: false,
      perPixelTargetFind: false,
      targetFindTolerance: 4,
      enableRetinaScaling: false,
      imageSmoothingEnabled: false,
      renderOnAddRemove: true,
      skipOffscreen: true,
      stateful: false
    });

    // Add white background rectangle
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

    // Set up clipping path
    fabricCanvas.clipPath = new fabric.Rect({
      left: CONTROL_PADDING,
      top: VERTICAL_PADDING,
      width: DISPLAY_WIDTH,
      height: DISPLAY_HEIGHT,
      absolutePositioned: true
    });

    // Add crosshair lines (from old editor)
    const centerX = CONTROL_PADDING + DISPLAY_WIDTH / 2;
    const centerY = VERTICAL_PADDING + DISPLAY_HEIGHT / 2;

    const verticalLine = new fabric.Line([centerX, VERTICAL_PADDING, centerX, VERTICAL_PADDING + DISPLAY_HEIGHT], {
      stroke: '#00ff00',
      strokeWidth: 1,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
      opacity: 0.5,
      excludeFromExport: true
    });

    const horizontalLine = new fabric.Line([CONTROL_PADDING, centerY, CONTROL_PADDING + DISPLAY_WIDTH, centerY], {
      stroke: '#00ff00',
      strokeWidth: 1,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
      opacity: 0.5,
      excludeFromExport: true
    });

    fabricCanvas.add(verticalLine);
    fabricCanvas.add(horizontalLine);

    setCanvas(fabricCanvas);
    console.log('Canvas initialized successfully');

    return () => {
      fabricCanvas.dispose();
    };
  }, [fabric]);

  // Handle file drop - EXACT pattern from old working editor
  const onDrop = (acceptedFiles: File[]) => {
    console.log('onDrop called, files:', acceptedFiles.length);
    console.log('Canvas exists?', !!canvas, 'Fabric exists?', !!fabric);

    if (acceptedFiles.length > 0) {
      if (!canvas || !fabric) {
        console.error('Canvas or fabric not ready!');
        alert('Please wait for the editor to load and try again.');
        return;
      }

      const file = acceptedFiles[0];
      console.log('Processing file:', file.name);
      const reader = new FileReader();

      reader.onload = (e) => {
        if (e.target?.result) {
          const dataUrl = e.target.result as string;
          console.log('File read as data URL, length:', dataUrl.length);

          // Use fabric.Image.fromURL directly
          fabric.Image.fromURL(dataUrl, (fabricImage: any) => {
            console.log('Fabric image created:', fabricImage);

            // Remove previous image if exists
            if (uploadedImage) {
              canvas.remove(uploadedImage);
            }

            // Scale image to fit within display canvas
            const maxDisplayWidth = DISPLAY_WIDTH * 0.8;
            const maxDisplayHeight = DISPLAY_HEIGHT * 0.8;
            const scale = Math.min(maxDisplayWidth / fabricImage.width!, maxDisplayHeight / fabricImage.height!);
            fabricImage.scale(scale);

            // Center the image on the canvas
            fabricImage.set({
              left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
              top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
              originX: 'center',
              originY: 'center',
              selectable: true,
              evented: true,
              hasControls: true,
              hasBorders: false,
              borderColor: 'transparent'
            });

            canvas.add(fabricImage);
            canvas.setActiveObject(fabricImage);

            // Force multiple renders
            canvas.renderAll();
            canvas.requestRenderAll();

            setUploadedImage(fabricImage);
            console.log('Image added to canvas');

            // Force another render after a moment
            setTimeout(() => {
              canvas.renderAll();
              console.log('Canvas objects:', canvas.getObjects());
            }, 100);
          }, {
            crossOrigin: 'anonymous'
          });
        }
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
    maxSize: 10485760
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
      if (data.imageUrl && canvas) {
        // Load AI generated image
        const imgElement = new Image();
        imgElement.onload = function() {
          const fabricImage = new fabric.Image(imgElement);

          if (uploadedImage) {
            canvas.remove(uploadedImage);
          }

          const scale = Math.min(
            (DISPLAY_WIDTH * 0.8) / fabricImage.width!,
            (DISPLAY_HEIGHT * 0.8) / fabricImage.height!
          );
          fabricImage.scale(scale);

          fabricImage.set({
            left: CONTROL_PADDING + DISPLAY_WIDTH / 2,
            top: VERTICAL_PADDING + DISPLAY_HEIGHT / 2,
            originX: 'center',
            originY: 'center'
          });

          canvas.add(fabricImage);
          canvas.setActiveObject(fabricImage);
          canvas.renderAll();
          setUploadedImage(fabricImage);
        };
        imgElement.src = data.imageUrl;
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

  return (
    <>
      <Head>
        <title>Design Your Case - SweetRobo CaseBot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
        {!uploadedImage ? (
          // Your beautiful upload UI
          <div className="flex items-center justify-center p-4 min-h-screen">
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

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>

            {/* Hidden canvas for upload phase */}
            <div style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
              <canvas ref={canvasRef} />
            </div>
          </div>
        ) : (
          // Canvas editor section
          <div className="flex flex-col h-screen">
            {/* Header */}
            <div className="bg-white shadow-sm px-4 py-3">
              <div className="max-w-6xl mx-auto flex items-center justify-between">
                <button
                  onClick={() => {
                    if (uploadedImage && canvas) {
                      canvas.remove(uploadedImage);
                      setUploadedImage(null);
                    }
                  }}
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
                  disabled={isProcessing}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-md"
                >
                  {isProcessing ? 'Processing...' : 'Print'}
                </button>
              </div>
            </div>

            {/* Canvas centered */}
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <canvas ref={canvasRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}