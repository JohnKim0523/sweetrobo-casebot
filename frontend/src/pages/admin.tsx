import React, { useState, useEffect } from 'react';
import Head from 'next/head';

interface S3Image {
  key: string;
  url: string;
  size: number;
  lastModified: string;
}

interface QueueJob {
  id: string;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  phoneModel: string;
  phoneModelId: string;
  productId?: string;
  machineId: string;
  sessionId: string;
  dimensions: {
    widthPX: number;
    heightPX: number;
    widthMM: number;
    heightMM: number;
  };
  image: string; // Base64 masked image
  imageUrl?: string; // S3 URL if uploaded
  priority: number;
  queuePosition: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  attempts: number;
}

export default function AdminDashboard() {
  const [images, setImages] = useState<S3Image[]>([]);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingJob, setDeletingJob] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load S3 images from backend
  const loadImages = async () => {
    if (!adminToken) {
      setError('Please enter admin token');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/admin/s3-images`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      if (response.status === 401) {
        setIsAuthenticated(false);
        setError('Invalid admin token');
        setImages([]);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setImages(data.images);
        setIsAuthenticated(true);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load queue jobs from backend
  const loadQueueJobs = async () => {
    try {
      setLoadingJobs(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/chitu/queue/jobs?limit=50`);
      const data = await response.json();

      if (data.success) {
        setQueueJobs(data.jobs);
      }
    } catch (err: any) {
      console.error('Failed to load queue jobs:', err);
    } finally {
      setLoadingJobs(false);
    }
  };

  // Download image from S3
  const downloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert(`Failed to download: ${err.message}`);
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
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

  // Delete/Cancel queue job
  const deleteQueueJob = async (jobId: string, sessionId: string) => {
    if (!confirm(`Delete/Cancel job ${jobId}?`)) return;

    try {
      setDeletingJob(jobId);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/chitu/queue/cancel/${jobId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      const data = await response.json();

      if (data.success) {
        // Remove job from list
        setQueueJobs(queueJobs.filter(job => job.id !== jobId));
        alert('Job deleted successfully');
      } else {
        alert(`Failed to delete job: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setDeletingJob(null);
    }
  };

  // Delete all queue jobs
  const deleteAllQueueJobs = async () => {
    if (queueJobs.length === 0) {
      alert('No jobs to delete');
      return;
    }

    if (!confirm(`Delete ALL ${queueJobs.length} jobs? This cannot be undone!`)) return;

    try {
      setDeletingJob('all');
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      let successCount = 0;
      let failCount = 0;

      // Delete each job sequentially
      for (const job of queueJobs) {
        try {
          const response = await fetch(`${backendUrl}/api/chitu/queue/cancel/${job.id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId: job.sessionId }),
          });

          const data = await response.json();
          if (data.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          failCount++;
        }
      }

      // Clear the list
      setQueueJobs([]);

      alert(`Deleted ${successCount} jobs successfully${failCount > 0 ? `, ${failCount} failed` : ''}`);

      // Refresh to get updated list
      loadQueueJobs();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setDeletingJob(null);
    }
  };

  // Queue updates removed - manual refresh only

  useEffect(() => {
    // Check for saved token in localStorage
    const savedToken = localStorage.getItem('adminToken');
    if (savedToken) {
      setAdminToken(savedToken);
    }
  }, []);
  
  useEffect(() => {
    // Load images and queue jobs when token changes
    if (adminToken) {
      loadImages();
      loadQueueJobs();
    }
  }, [adminToken]);

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
      
      <div className="admin-page min-h-screen bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <div className="flex items-center gap-4">
              {isAuthenticated && (
                <>
                  <button
                    onClick={() => {
                      loadImages();
                      loadQueueJobs();
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                  >
                    🔄 Refresh
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem('adminToken');
                      setAdminToken('');
                      setIsAuthenticated(false);
                      setImages([]);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
                  >
                    🚪 Logout
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Login Form */}
          {!isAuthenticated && (
            <div className="max-w-md mx-auto bg-gray-800 p-6 rounded-lg mb-6">
              <h2 className="text-xl font-bold mb-4">🔐 Admin Authentication</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Admin Token</label>
                  <input
                    type="password"
                    value={adminToken}
                    onChange={(e) => setAdminToken(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        localStorage.setItem('adminToken', adminToken);
                        loadImages();
                      }
                    }}
                    placeholder="Enter admin token"
                    className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                  />
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('adminToken', adminToken);
                    loadImages();
                  }}
                  disabled={!adminToken}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded"
                >
                  🔓 Login
                </button>
                {error && (
                  <div className="p-3 bg-red-600/20 border border-red-600 rounded text-red-400">
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Show content only when authenticated */}
          {isAuthenticated && (
            <>
          {/* Queue Jobs with Masked Images */}
          <div className="mb-6 bg-gray-800 rounded p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                🖨️ Print Queue Jobs ({queueJobs.length})
              </h2>
              {queueJobs.length > 0 && (
                <button
                  onClick={deleteAllQueueJobs}
                  disabled={deletingJob === 'all'}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-sm font-medium"
                >
                  {deletingJob === 'all' ? 'Deleting All...' : '🗑️ Delete All'}
                </button>
              )}
            </div>
            <p className="text-sm text-gray-400 mb-4">
              These are the exact masked images that will be/were sent to the printer
            </p>

            {loadingJobs && (
              <div className="text-center py-8">Loading queue jobs...</div>
            )}

            {!loadingJobs && queueJobs.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No jobs in queue. Submit a design to see it here!
              </div>
            )}

            {queueJobs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {queueJobs.map((job) => (
                  <div key={job.id} className="bg-gray-700 rounded overflow-hidden">
                    {/* Masked Image Preview */}
                    <div className="bg-gray-900 flex items-center justify-center p-4" style={{ minHeight: '250px' }}>
                      <img
                        src={job.image}
                        alt={`${job.phoneModel} - ${job.id}`}
                        className="max-w-full max-h-64 object-contain"
                        style={{
                          imageRendering: 'pixelated',
                          background: 'repeating-conic-gradient(#444 0% 25%, #555 0% 50%) 50% / 20px 20px'
                        }}
                      />
                    </div>

                    {/* Job Details */}
                    <div className="p-3">
                      {/* Status Badge */}
                      <div className="mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          job.status === 'waiting' ? 'bg-blue-600' :
                          job.status === 'processing' ? 'bg-yellow-600' :
                          job.status === 'completed' ? 'bg-green-600' :
                          'bg-red-600'
                        }`}>
                          {job.status.toUpperCase()}
                          {job.status === 'waiting' && job.queuePosition > 0 && ` - Position ${job.queuePosition}`}
                        </span>
                      </div>

                      {/* Phone Model */}
                      <p className="text-sm font-bold mb-1">
                        📱 {job.phoneModel}
                      </p>

                      {/* Product ID */}
                      {job.productId && (
                        <p className="text-xs text-gray-400 mb-1 truncate" title={job.productId}>
                          🆔 {job.productId.substring(0, 12)}...
                        </p>
                      )}

                      {/* Dimensions */}
                      <p className="text-xs text-gray-400 mb-1">
                        📏 {job.dimensions.widthPX} × {job.dimensions.heightPX} px
                      </p>
                      <p className="text-xs text-gray-400 mb-1">
                        📐 {job.dimensions.widthMM} × {job.dimensions.heightMM} mm
                      </p>

                      {/* Machine ID */}
                      <p className="text-xs text-gray-400 mb-1">
                        🖨️ {job.machineId}
                      </p>

                      {/* Timestamp */}
                      <p className="text-xs text-gray-500 mb-2">
                        🕐 {formatDate(job.createdAt)}
                      </p>

                      {/* Error Message */}
                      {job.error && (
                        <p className="text-xs text-red-400 bg-red-900/30 p-2 rounded mb-2">
                          ❌ {job.error}
                        </p>
                      )}

                      {/* Job ID */}
                      <p className="text-xs text-gray-500 truncate mb-2" title={job.id}>
                        Job: {job.id}
                      </p>

                      {/* Delete Button */}
                      <button
                        onClick={() => deleteQueueJob(job.id, job.sessionId)}
                        disabled={deletingJob === job.id}
                        className="w-full px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-sm"
                      >
                        {deletingJob === job.id ? 'Deleting...' : '🗑️ Delete Job'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                    <div className="bg-gray-900 flex items-center justify-center p-4" style={{ minHeight: '250px' }}>
                      {image.key.toLowerCase().endsWith('.tif') || image.key.toLowerCase().endsWith('.tiff') ? (
                        <div className="text-center text-gray-400">
                          <div className="text-4xl mb-2">🖼️</div>
                          <div className="text-sm">TIF/TIFF Preview</div>
                          <div className="text-xs mt-1">(Not displayable in browser)</div>
                        </div>
                      ) : (
                        <img
                          src={image.url}
                          alt={image.key}
                          className="max-w-full max-h-64 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.parentElement!.innerHTML = '<div class="text-center text-gray-400"><div class="text-4xl mb-2">❌</div><div class="text-sm">Failed to load</div></div>';
                          }}
                          style={{
                            imageRendering: 'auto',
                            background: 'repeating-conic-gradient(#444 0% 25%, #555 0% 50%) 50% / 20px 20px'
                          }}
                        />
                      )}
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
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => downloadImage(image.url, image.key.split('/').pop() || 'design.png')}
                          className="flex-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                        >
                          ⬇️ Download
                        </button>
                        <button
                          onClick={() => deleteImage(image.key)}
                          disabled={deleting === image.key}
                          className="flex-1 px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-sm"
                        >
                          {deleting === image.key ? 'Deleting...' : '🗑️ Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="bg-gray-800 p-4 rounded text-center">
              <div className="text-2xl font-bold">{queueJobs.length}</div>
              <div className="text-gray-400">Queue Jobs</div>
            </div>
            <div className="bg-gray-800 p-4 rounded text-center">
              <div className="text-2xl font-bold">
                {queueJobs.filter(j => j.status === 'waiting').length}
              </div>
              <div className="text-gray-400">Waiting</div>
            </div>
            <div className="bg-gray-800 p-4 rounded text-center">
              <div className="text-2xl font-bold">{images.length}</div>
              <div className="text-gray-400">S3 Images</div>
            </div>
            <div className="bg-gray-800 p-4 rounded text-center">
              <div className="text-2xl font-bold">
                {formatFileSize(images.reduce((acc, img) => acc + img.size, 0))}
              </div>
              <div className="text-gray-400">Total Size</div>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}