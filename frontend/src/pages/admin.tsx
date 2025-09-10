import React, { useState, useEffect } from 'react';
import Head from 'next/head';

interface S3Image {
  key: string;
  url: string;
  size: number;
  lastModified: string;
}

export default function AdminDashboard() {
  const [images, setImages] = useState<S3Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentQueue, setCurrentQueue] = useState<any[]>([]);

  // Load S3 images from backend
  const loadImages = async () => {
    try {
      setLoading(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/admin/s3-images`);
      const data = await response.json();
      
      if (data.success) {
        setImages(data.images);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete image from S3 via backend
  const deleteImage = async (key: string) => {
    if (!confirm(`Delete ${key}?`)) return;
    
    try {
      setDeleting(key);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/admin/s3-images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setImages(images.filter(img => img.key !== key));
      } else {
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  // Queue updates removed - manual refresh only

  useEffect(() => {
    loadImages();
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <>
      <Head>
        <title>Admin Dashboard - S3 Manager</title>
      </Head>
      
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <div className="flex items-center gap-4">
              <button
                onClick={loadImages}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Current Queue */}
          {currentQueue.length > 0 && (
            <div className="mb-6 p-4 bg-gray-800 rounded">
              <h2 className="text-xl font-bold mb-3">📋 Current Queue ({currentQueue.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {currentQueue.map((job) => (
                  <div key={job.id} className="p-2 bg-gray-700 rounded flex justify-between">
                    <span>#{job.queuePosition}</span>
                    <span className={`px-2 rounded text-xs ${
                      job.status === 'printing' ? 'bg-yellow-600' : 
                      job.status === 'completed' ? 'bg-green-600' : 'bg-gray-600'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* S3 Images */}
          <div className="bg-gray-800 rounded p-4">
            <h2 className="text-xl font-bold mb-4">
              📦 S3 Images ({images.length})
            </h2>

            {loading && (
              <div className="text-center py-8">Loading...</div>
            )}

            {error && (
              <div className="bg-red-600 p-3 rounded mb-4">
                Error: {error}
              </div>
            )}

            {!loading && images.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No images found in S3
              </div>
            )}

            {images.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {images.map((image) => (
                  <div key={image.key} className="bg-gray-700 rounded overflow-hidden">
                    <div className="aspect-w-1 aspect-h-1 bg-gray-600">
                      <img 
                        src={image.url} 
                        alt={image.key}
                        className="w-full h-48 object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-xs text-gray-400 truncate" title={image.key}>
                        {image.key.split('/').pop()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatFileSize(image.size)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(image.lastModified)}
                      </p>
                      <button
                        onClick={() => deleteImage(image.key)}
                        disabled={deleting === image.key}
                        className="mt-2 w-full px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-sm"
                      >
                        {deleting === image.key ? 'Deleting...' : '🗑️ Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-gray-800 p-4 rounded text-center">
              <div className="text-2xl font-bold">{images.length}</div>
              <div className="text-gray-400">Total Images</div>
            </div>
            <div className="bg-gray-800 p-4 rounded text-center">
              <div className="text-2xl font-bold">
                {formatFileSize(images.reduce((acc, img) => acc + img.size, 0))}
              </div>
              <div className="text-gray-400">Total Size</div>
            </div>
            <div className="bg-gray-800 p-4 rounded text-center">
              <div className="text-2xl font-bold">{currentQueue.length}</div>
              <div className="text-gray-400">Queue Size</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}