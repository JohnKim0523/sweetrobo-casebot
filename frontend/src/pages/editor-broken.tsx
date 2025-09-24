import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import * as fabric from 'fabric';
import { useDropzone } from 'react-dropzone';
import Modal from 'react-modal';
import Head from 'next/head';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { useWebSocket } from '../hooks/useWebSocket';

Modal.setAppElement('#__next');

const EditorPage: React.FC = () => {
  const router = useRouter();
  const { model } = router.query;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [uploadedImage, setUploadedImage] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState('');
  const [createPrompt, setCreatePrompt] = useState('');
  const [editHistory, setEditHistory] = useState<string[]>([]);
  const [cropHistory, setCropHistory] = useState<string[]>([]);
  const [showCropper, setShowCropper] = useState(false);
  const cropperImageRef = useRef<HTMLImageElement | null>(null);
  const cropperInstanceRef = useRef<Cropper | null>(null);
  const normalControls = useRef<any>(null);
  const cropControls = useRef<any>(null);

  const { socket, connected, machineStatus, orderUpdate, printProgress } = useWebSocket();

  // Initialize canvas
  useEffect(() => {
    if (canvasRef.current && !canvas) {
      const newCanvas = new fabric.Canvas(canvasRef.current, {
        backgroundColor: '#f5f5f5',
        preserveObjectStacking: true,
        selection: true,
      });

      // Set canvas size to fit mobile screen
      const updateCanvasSize = () => {
        const container = canvasRef.current?.parentElement;
        if (container) {
          const width = container.offsetWidth - 16; // Account for padding
          const height = width; // Keep it square
          newCanvas.setDimensions({ width, height });
          newCanvas.renderAll();
        }
      };

      updateCanvasSize();
      window.addEventListener('resize', updateCanvasSize);

      // Store normal controls
      if (fabric.Image.prototype.controls) {
        normalControls.current = { ...fabric.Image.prototype.controls };
      }

      setCanvas(newCanvas);

      return () => {
        window.removeEventListener('resize', updateCanvasSize);
        newCanvas.dispose();
      };
    }
  }, [canvas]);

  // Handle file upload
  const handleImageUpload = useCallback((file: File) => {
    if (!canvas) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = await fabric.FabricImage.fromURL(e.target?.result as string);

      // Clear canvas
      canvas.clear();
      canvas.backgroundColor = '#f5f5f5';

      // Scale image to fit canvas
      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      const scale = Math.min(
        canvasWidth / (img.width || 1),
        canvasHeight / (img.height || 1)
      ) * 0.9;

      img.scale(scale);
      img.set({
        left: canvasWidth / 2,
        top: canvasHeight / 2,
        originX: 'center',
        originY: 'center'
      });

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();

      setUploadedImage(img);
    };
    reader.readAsDataURL(file);
  }, [canvas]);

  // Dropzone configuration
  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        handleImageUpload(acceptedFiles[0]);
      }
    },
    accept: { 'image/*': [] },
    multiple: false,
  });

  // Handle AI image generation
  const handleCreateAIImage = async () => {
    if (!createPrompt.trim() || !canvas) return;

    setIsProcessing(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');
      const response = await fetch(`${backendUrl}/api/ai-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: createPrompt }),
      });

      const result = await response.json();

      if (result.success && result.imageUrl) {
        const img = await fabric.FabricImage.fromURL(result.imageUrl, { crossOrigin: 'anonymous' });

        canvas.clear();
        canvas.backgroundColor = '#f5f5f5';

        const scale = Math.min(
          canvas.getWidth() / (img.width || 1),
          canvas.getHeight() / (img.height || 1)
        ) * 0.9;

        img.scale(scale);
        img.set({
          left: canvas.getWidth() / 2,
          top: canvas.getHeight() / 2,
          originX: 'center',
          originY: 'center'
        });

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();

        setUploadedImage(img);
        setCreatePrompt('');
      }
    } catch (error) {
      console.error('AI generation error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle AI edit
  const handleAIEdit = async () => {
    if (!aiPrompt.trim() || !uploadedImage || !canvas) return;

    setIsProcessing(true);
    setAiError(null);

    try {
      // Save current state to history
      const currentState = JSON.stringify({
        src: uploadedImage.toDataURL(),
        left: uploadedImage.left,
        top: uploadedImage.top,
        scaleX: uploadedImage.scaleX,
        scaleY: uploadedImage.scaleY,
        angle: uploadedImage.angle,
      });
      setEditHistory(prev => [...prev, currentState]);

      const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');
      const imageDataUrl = uploadedImage.toDataURL({ format: 'png', quality: 1 });

      const response = await fetch(`${backendUrl}/api/ai-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageDataUrl,
          prompt: aiPrompt,
        }),
      });

      const result = await response.json();

      if (result.success && result.imageUrl) {
        const img = await fabric.FabricImage.fromURL(result.imageUrl, { crossOrigin: 'anonymous' });

        const currentProps = {
          left: uploadedImage.left,
          top: uploadedImage.top,
          scaleX: uploadedImage.scaleX,
          scaleY: uploadedImage.scaleY,
          angle: uploadedImage.angle,
        };

        canvas.remove(uploadedImage);

        img.set(currentProps);
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();

        setUploadedImage(img);
        setShowAIModal(false);
        setAiPrompt('');
      }
    } catch (error) {
      setAiError('Failed to process image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!uploadedImage || !canvas || isUploading) return;

    setIsUploading(true);
    try {
      const imageDataUrl = canvas.toDataURL();
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':3001');

      const response = await fetch(`${backendUrl}/api/chitu/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: imageDataUrl,
          phoneModel: model || 'iPhone_15_Pro',
          caseType: 'hard',
          quantity: 1,
          deviceCode: 'CT0700026',
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Print job submitted successfully!');
        router.push('/');
      } else {
        throw new Error(result.error || 'Print submission failed');
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('Failed to submit print job. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Undo last edit
  const undoLastEdit = async () => {
    if (editHistory.length === 0 || !canvas) return;

    const lastState = editHistory[editHistory.length - 1];
    setEditHistory(prev => prev.slice(0, -1));

    const state = JSON.parse(lastState);
    const img = await fabric.FabricImage.fromURL(state.src);

    canvas.remove(uploadedImage!);

    img.set({
      left: state.left,
      top: state.top,
      scaleX: state.scaleX,
      scaleY: state.scaleY,
      angle: state.angle,
    });

    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.renderAll();

    setUploadedImage(img);
  };

  return (
    <>
      <Head>
        <title>Case Bot Editor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <div className="h-screen flex flex-col bg-gray-50">
        {/* Upload Screen */}
        {!uploadedImage ? (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center gap-3 shadow-sm">
              <img src="/gif.gif" alt="SweetRobo" className="w-10 h-10 object-contain" />
              <div>
                <h1 className="text-lg font-bold">Case Bot App</h1>
                <p className="text-xs text-gray-500">Create amazing images with AI</p>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 px-4 py-6 flex flex-col">
              {/* Upload Area */}
              <div className="flex-1 flex items-center justify-center mb-6">
                <div
                  {...getRootProps()}
                  className="w-full max-w-sm aspect-square border-2 border-dashed border-purple-300 rounded-2xl flex flex-col items-center justify-center bg-white cursor-pointer hover:bg-purple-50 transition-colors"
                >
                  <input {...getInputProps()} />
                  <div className="w-12 h-12 mb-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 p-0.5">
                    <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                      <span className="text-2xl text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500">+</span>
                    </div>
                  </div>
                  <p className="font-medium text-gray-700">Add your image here</p>
                  <p className="text-xs text-gray-500 mt-1">Upload from camera roll</p>
                </div>
              </div>

              {/* AI Generate Section */}
              <div className="bg-white rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm">✨</span>
                  <span className="font-semibold">Generate AI Image</span>
                  <span className="ml-auto text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-0.5 rounded-full">AI</span>
                </div>

                <input
                  type="text"
                  placeholder="Describe your image..."
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  className="w-full px-3 py-2 mb-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500"
                />

                <button
                  onClick={handleCreateAIImage}
                  disabled={!createPrompt.trim() || isProcessing}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl disabled:opacity-50"
                >
                  {isProcessing ? 'Generating...' : 'Generate Image'}
                </button>

                {/* Quick Prompts */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {[
                    { emoji: '🌅', text: 'Sunset', prompt: 'Sunset landscape' },
                    { emoji: '🐱', text: 'Cat', prompt: 'Cute cartoon cat' },
                    { emoji: '🎨', text: 'Art', prompt: 'Abstract art' },
                  ].map((item) => (
                    <button
                      key={item.text}
                      onClick={() => setCreatePrompt(item.prompt)}
                      className="p-2 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100"
                    >
                      <div className="text-lg">{item.emoji}</div>
                      <div className="text-xs text-gray-600">{item.text}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Editor Screen */
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-3 flex items-center justify-between shadow-sm">
              <button
                onClick={undoLastEdit}
                disabled={editHistory.length === 0}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                ↶
              </button>

              <div className="flex items-center gap-2">
                <img src="/gif.gif" alt="SweetRobo" className="w-8 h-8 object-contain" />
                <span className="font-semibold">Case Bot App</span>
              </div>

              <button
                onClick={() => {/* Redo functionality */}}
                disabled={true}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                ↷
              </button>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
              <div className="relative bg-white rounded-3xl p-2 shadow-sm w-full max-w-sm">
                <canvas ref={canvasRef} className="rounded-2xl w-full" />
                {/* Green corner indicators */}
                <div className="absolute top-3 left-3 w-6 h-6 border-l-4 border-t-4 border-green-500 rounded-tl-lg" />
                <div className="absolute top-3 right-3 w-6 h-6 border-r-4 border-t-4 border-green-500 rounded-tr-lg" />
                <div className="absolute bottom-3 left-3 w-6 h-6 border-l-4 border-b-4 border-green-500 rounded-bl-lg" />
                <div className="absolute bottom-3 right-3 w-6 h-6 border-r-4 border-b-4 border-green-500 rounded-br-lg" />
              </div>
            </div>

            {/* Bottom Toolbar */}
            <div className="bg-white border-t px-4 py-3 flex justify-center gap-2">
              <button
                onClick={() => setShowAIModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl flex items-center gap-2"
              >
                ✨ Edit with AI
              </button>

              <button
                onClick={() => {
                  if (uploadedImage && canvas) {
                    uploadedImage.rotate(uploadedImage.angle - 90);
                    canvas.renderAll();
                  }
                }}
                className="w-10 h-10 bg-white border border-gray-300 rounded-xl flex items-center justify-center"
              >
                ↺
              </button>

              <button
                onClick={() => {
                  if (uploadedImage && canvas) {
                    uploadedImage.rotate(uploadedImage.angle + 90);
                    canvas.renderAll();
                  }
                }}
                className="w-10 h-10 bg-white border border-gray-300 rounded-xl flex items-center justify-center"
              >
                ↻
              </button>

              <button
                onClick={() => {/* Crop functionality */}}
                className="w-10 h-10 bg-white border border-gray-300 rounded-xl flex items-center justify-center"
              >
                ✂️
              </button>

              <button
                onClick={() => {
                  if (uploadedImage && canvas) {
                    canvas.remove(uploadedImage);
                    canvas.renderAll();
                    setUploadedImage(null);
                  }
                }}
                className="w-10 h-10 bg-white border border-gray-300 rounded-xl flex items-center justify-center"
              >
                <span className="text-red-500">🗑️</span>
              </button>
            </div>

            {/* Submit Button */}
            <div className="p-4 bg-white">
              <button
                onClick={handleSubmit}
                disabled={isUploading}
                className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-2xl disabled:opacity-50"
              >
                {isUploading ? 'Processing...' : 'Submit Image'}
              </button>
            </div>
          </div>
        )}

        {/* AI Edit Modal */}
        <Modal
          isOpen={showAIModal}
          onRequestClose={() => !isProcessing && setShowAIModal(false)}
          className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 max-w-sm mx-auto"
          overlayClassName="fixed inset-0 bg-black bg-opacity-50 z-50"
        >
          <h2 className="text-xl font-bold mb-4">AI Edit</h2>

          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe your edit..."
            className="w-full px-3 py-2 mb-4 border border-gray-300 rounded-lg focus:outline-none focus:border-purple-500"
          />

          {aiError && (
            <div className="text-red-500 text-sm mb-4">{aiError}</div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setShowAIModal(false)}
              className="flex-1 py-2 border border-gray-300 rounded-lg"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              onClick={handleAIEdit}
              className="flex-1 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg disabled:opacity-50"
              disabled={isProcessing || !aiPrompt.trim()}
            >
              {isProcessing ? 'Processing...' : 'Apply'}
            </button>
          </div>
        </Modal>
      </div>
    </>
  );
};

export default EditorPage;