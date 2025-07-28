import { useState } from "react";
import dynamic from "next/dynamic";
import { Geist, Geist_Mono } from "next/font/google";
import { sendToPrint } from "@/lib/sendToPrint";

const PhoneCaseCanvas = dynamic(() => import('@/components/PhoneCaseCanvas'), {
  ssr: false,
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  const [uploadedImage, setUploadedImage] = useState<string>('');
  const [printing, setPrinting] = useState(false);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendToPrint = async (canvasDataUrl: string) => {
    setPrinting(true);
    try {
      const res = await sendToPrint(canvasDataUrl, 'iPhone14Plus');
      alert(`✅ Sent to printer! Saved at: ${res.path}`);
    } catch (err) {
      alert('❌ Failed to send to printer.');
      console.error(err);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div
      className={`${geistSans.className} ${geistMono.className} font-sans flex flex-col items-center justify-center min-h-screen p-8`}
    >
      <h1 className="text-3xl font-bold mb-4">📱 Phone Case Designer</h1>

      <div className="w-full max-w-xl bg-white rounded-lg p-4 shadow">
        <input
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="mb-4 w-full"
        />

        {uploadedImage && (
          <PhoneCaseCanvas
            imageUrl={uploadedImage}
            onExport={handleSendToPrint}
          />
        )}

        {printing && (
          <p className="text-sm mt-2 text-gray-600">Printing...</p>
        )}
      </div>
    </div>
  );
}
