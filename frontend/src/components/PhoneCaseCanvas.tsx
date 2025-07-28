import { useEffect, useRef } from 'react';
import fabric from 'fabric';

interface Props {
  imageUrl: string;
  onExport: (dataUrl: string) => void;
}

export default function PhoneCaseCanvas({ imageUrl, onExport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  useEffect(() => {
    const canvas = new fabric.Canvas('phone-canvas', {
      width: 400,
      height: 800,
      backgroundColor: '#f3f4f6',
    });
    fabricRef.current = canvas;

    return () => {
      canvas.dispose();
    };
  }, []);

  useEffect(() => {
    if (!imageUrl || !fabricRef.current) return;

    const loadImage = async () => {
      try {
        const img = await fabric.Image.fromURL(imageUrl, {
          crossOrigin: 'anonymous',
        });

        img.scaleToWidth(300);
        img.set({ left: 50, top: 250, hasRotatingPoint: true });

        fabricRef.current!.clear();
        fabricRef.current!.backgroundColor = '#f3f4f6';
        fabricRef.current!.add(img);
        fabricRef.current!.renderAll();
      } catch (err) {
        console.error('Failed to load image:', err);
      }
    };

    loadImage();
  }, [imageUrl]);

  const exportCanvas = () => {
    const dataUrl = fabricRef.current?.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    });
    if (dataUrl) onExport(dataUrl);
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <canvas id="phone-canvas" ref={canvasRef} />
      <button
        onClick={exportCanvas}
        className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
      >
        Send to Printer
      </button>
    </div>
  );
}
