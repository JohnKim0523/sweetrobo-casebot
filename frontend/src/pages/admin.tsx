import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { InventoryGridResponse } from '../types/phone-models';

interface S3Image {
  id: string;
  key: string;
  image: string; // Base64 PNG
  imageUrl?: string; // S3 TIF URL
  sessionId: string;
  phoneModel: string;
  phoneModelId: string;
  productId?: string;
  machineId: string;
  dimensions: {
    widthPX: number;
    heightPX: number;
    widthMM: number;
    heightMM: number;
  };
  status: 'completed';
  createdAt: string;
  completedAt?: string;
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

  // Inventory grid state
  const [inventoryMachineId, setInventoryMachineId] = useState<string>('');
  const [inventoryGrid, setInventoryGrid] = useState<InventoryGridResponse | null>(null);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  // AI Usage state
  const [aiUsageStats, setAiUsageStats] = useState<any>(null);
  const [loadingAiUsage, setLoadingAiUsage] = useState(false);
  const [aiUsageError, setAiUsageError] = useState<string | null>(null);

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

  // Load AI usage statistics
  const loadAiUsage = async () => {
    if (!adminToken) return;

    try {
      setLoadingAiUsage(true);
      setAiUsageError(null);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/admin/ai-usage`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setAiUsageStats(data);
      } else {
        setAiUsageError(data.error || 'Failed to load AI usage');
      }
    } catch (err: any) {
      setAiUsageError(err.message);
    } finally {
      setLoadingAiUsage(false);
    }
  };

  // Load inventory grid for a machine
  const loadInventoryGrid = async (machineId?: string) => {
    const targetMachine = machineId || inventoryMachineId;
    if (!targetMachine) {
      setInventoryError('Please enter a machine ID');
      return;
    }

    try {
      setLoadingInventory(true);
      setInventoryError(null);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/chitu/inventory/${targetMachine}`);
      const data: InventoryGridResponse = await response.json();

      if (data.success) {
        setInventoryGrid(data);
      } else {
        setInventoryError((data as any).message || 'Failed to load inventory');
      }
    } catch (err: any) {
      setInventoryError(err.message || 'Failed to load inventory');
    } finally {
      setLoadingInventory(false);
    }
  };

  // Get product name from proList by product_id
  const getProductName = (productId: number): string => {
    if (productId === 0) return '';
    const product = inventoryGrid?.products.find(p => p.value === productId);
    return product?.text || `ID: ${productId}`;
  };

  // Get color class for inventory slot
  const getSlotColor = (productId: number, stock: number): string => {
    if (productId === 0) return 'bg-gray-700'; // Empty
    if (stock === 0) return 'bg-red-600'; // Out of stock
    if (stock <= 2) return 'bg-yellow-600'; // Low stock
    return 'bg-green-600'; // In stock
  };

  // Delete image from S3 via backend
  const deleteImage = async (key: string) => {
    console.log('🗑️ Attempting to delete with key:', key);
    if (!confirm(`Delete ${key}?`)) return;

    try {
      setDeleting(key);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      console.log('Sending DELETE request with key:', key);

      const response = await fetch(`${backendUrl}/api/admin/s3-images`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ key }),
      });

      console.log('Delete response status:', response.status);
      const data = await response.json();
      console.log('Delete response data:', data);

      if (data.success) {
        setImages(images.filter(img => img.imageUrl !== key && img.key !== key));
        alert('Deleted successfully!');
      } else {
        alert(`Failed to delete: ${data.error || data.message}`);
      }
    } catch (err: any) {
      console.error('Delete error:', err);
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
    // Load images, queue jobs, and AI usage when token changes
    if (adminToken) {
      loadImages();
      loadQueueJobs();
      loadAiUsage();
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
                      loadAiUsage();
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

          {/* S3 Backup Storage (Completed Jobs) */}
          <div className="bg-gray-800 rounded p-4">
            <h2 className="text-xl font-bold mb-4">
              📦 S3 Backup Storage - Completed Jobs ({images.length})
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              These are completed print jobs backed up to S3. PNG previews shown, TIF files stored.
            </p>

            {loading && (
              <div className="text-center py-8">Loading...</div>
            )}

            {!loading && images.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No completed jobs found
              </div>
            )}

            {images.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {images.map((image) => (
                  <div key={image.id} className="bg-gray-700 rounded overflow-hidden">
                    {/* Image Preview - Same as Queue */}
                    <div className="bg-gray-900 flex items-center justify-center p-4" style={{ minHeight: '250px' }}>
                      <img
                        src={image.image}
                        alt={`${image.phoneModel} - ${image.id}`}
                        className="max-w-full max-h-64 object-contain"
                        style={{
                          imageRendering: 'pixelated',
                          background: 'repeating-conic-gradient(#444 0% 25%, #555 0% 50%) 50% / 20px 20px'
                        }}
                      />
                    </div>

                    {/* Job Details - Same format as Queue */}
                    <div className="p-3">
                      {/* Status Badge */}
                      <div className="mb-2">
                        <span className="px-2 py-1 rounded text-xs font-bold bg-green-600">
                          COMPLETED
                        </span>
                      </div>

                      {/* Phone Model */}
                      <p className="text-sm font-bold mb-1">
                        📱 {image.phoneModel}
                      </p>

                      {/* Product ID */}
                      {image.productId && (
                        <p className="text-xs text-gray-400 mb-1 truncate" title={image.productId}>
                          🆔 {image.productId.substring(0, 12)}...
                        </p>
                      )}

                      {/* Dimensions */}
                      <p className="text-xs text-gray-400 mb-1">
                        📏 {image.dimensions.widthPX} × {image.dimensions.heightPX} px
                      </p>
                      <p className="text-xs text-gray-400 mb-1">
                        📐 {image.dimensions.widthMM} × {image.dimensions.heightMM} mm
                      </p>

                      {/* Machine ID */}
                      <p className="text-xs text-gray-400 mb-1">
                        🖨️ {image.machineId}
                      </p>

                      {/* Timestamp */}
                      <p className="text-xs text-gray-500 mb-2">
                        ✅ {formatDate(image.completedAt || image.createdAt)}
                      </p>

                      {/* Job ID */}
                      <p className="text-xs text-gray-500 truncate mb-2" title={image.id}>
                        Job: {image.id}
                      </p>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            // Download the TIF file from S3 via backend proxy
                            try {
                              const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
                              const response = await fetch(`${backendUrl}/api/admin/s3-download?url=${encodeURIComponent(image.imageUrl || '')}`, {
                                headers: {
                                  'Authorization': `Bearer ${adminToken}`
                                }
                              });

                              if (!response.ok) {
                                alert('Failed to download: ' + response.statusText);
                                return;
                              }

                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `design-${image.sessionId}.tif`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                            } catch (err: any) {
                              alert('Download failed: ' + err.message);
                            }
                          }}
                          disabled={!image.imageUrl}
                          className="flex-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm"
                        >
                          ⬇️ Download TIF
                        </button>
                        <button
                          onClick={() => deleteImage(image.imageUrl || '')}
                          disabled={deleting === image.imageUrl}
                          className="flex-1 px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-sm"
                        >
                          {deleting === image.imageUrl ? 'Deleting...' : '🗑️ Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Usage Statistics */}
          <div className="mt-6 bg-gray-800 rounded p-4">
            <h2 className="text-xl font-bold mb-4">🤖 AI Usage Statistics</h2>
            <p className="text-sm text-gray-400 mb-4">
              Track AI edits and generations per machine for billing
            </p>

            {loadingAiUsage && (
              <div className="text-center py-4">Loading AI usage data...</div>
            )}

            {aiUsageError && (
              <div className="p-3 bg-yellow-600/20 border border-yellow-600 rounded text-yellow-400 mb-4">
                {aiUsageError}
                <p className="text-xs mt-2">
                  If the table does not exist, run: <code className="bg-gray-700 px-1 rounded">node scripts/setup-dynamodb.js</code>
                </p>
              </div>
            )}

            {aiUsageStats && !loadingAiUsage && (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-700 p-4 rounded text-center">
                    <div className="text-2xl font-bold text-purple-400">{aiUsageStats.summary?.totalEdits || 0}</div>
                    <div className="text-gray-400 text-sm">Total AI Edits</div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded text-center">
                    <div className="text-2xl font-bold text-blue-400">{aiUsageStats.summary?.totalGenerations || 0}</div>
                    <div className="text-gray-400 text-sm">Total Generations</div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded text-center">
                    <div className="text-2xl font-bold text-green-400">{aiUsageStats.summary?.formattedCost || '$0.00'}</div>
                    <div className="text-gray-400 text-sm">Total Cost</div>
                  </div>
                </div>

                {/* Per-Machine Breakdown */}
                {aiUsageStats.machines && aiUsageStats.machines.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-600">
                          <th className="text-left p-2">Machine ID</th>
                          <th className="text-center p-2">Total Edits</th>
                          <th className="text-center p-2">Generations</th>
                          <th className="text-center p-2">Today</th>
                          <th className="text-center p-2">This Week</th>
                          <th className="text-center p-2">This Month</th>
                          <th className="text-right p-2">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiUsageStats.machines.map((machine: any) => (
                          <tr key={machine.machineId} className="border-b border-gray-700 hover:bg-gray-700/50">
                            <td className="p-2 font-mono text-purple-400">{machine.machineId}</td>
                            <td className="text-center p-2">{machine.total?.edits || 0}</td>
                            <td className="text-center p-2">{machine.total?.generations || 0}</td>
                            <td className="text-center p-2 text-yellow-400">{(machine.today?.edits || 0) + (machine.today?.generations || 0)}</td>
                            <td className="text-center p-2 text-blue-400">{(machine.thisWeek?.edits || 0) + (machine.thisWeek?.generations || 0)}</td>
                            <td className="text-center p-2 text-green-400">{(machine.thisMonth?.edits || 0) + (machine.thisMonth?.generations || 0)}</td>
                            <td className="text-right p-2 font-bold">{machine.formattedCost || '$0.00'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-400">
                    No AI usage data yet. AI edits will appear here once users start using the AI features.
                  </div>
                )}
              </>
            )}

            {!aiUsageStats && !loadingAiUsage && !aiUsageError && (
              <div className="text-center py-4 text-gray-400">
                AI usage statistics will load after authentication
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
              <div className="text-gray-400">Completed Jobs</div>
            </div>
            <div className="bg-gray-800 p-4 rounded text-center">
              <div className="text-2xl font-bold">
                {queueJobs.filter(j => j.status === 'completed').length}
              </div>
              <div className="text-gray-400">In Queue (Completed)</div>
            </div>
          </div>

          {/* Inventory Grid Visualization */}
          <div className="mt-6 bg-gray-800 rounded p-4">
            <h2 className="text-xl font-bold mb-4">📦 Case Bot Inventory Grid</h2>
            <p className="text-sm text-gray-400 mb-4">
              View the 8x8 rack layout for Case Bot machines (CT-sjk360)
            </p>

            {/* Machine ID Input */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={inventoryMachineId}
                onChange={(e) => setInventoryMachineId(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && loadInventoryGrid()}
                placeholder="Enter machine ID (e.g., CT0700046)"
                className="flex-1 px-3 py-2 bg-gray-700 rounded text-white"
              />
              <button
                onClick={() => loadInventoryGrid()}
                disabled={loadingInventory || !inventoryMachineId}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded"
              >
                {loadingInventory ? 'Loading...' : '🔍 Load Grid'}
              </button>
            </div>

            {/* Error Message */}
            {inventoryError && (
              <div className="p-3 bg-red-600/20 border border-red-600 rounded text-red-400 mb-4">
                {inventoryError}
              </div>
            )}

            {/* Grid Visualization */}
            {inventoryGrid && (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-5 gap-2 text-center text-sm">
                  <div className="bg-gray-700 p-2 rounded">
                    <div className="font-bold">{inventoryGrid.machineModel}</div>
                    <div className="text-gray-400">Model</div>
                  </div>
                  <div className="bg-gray-700 p-2 rounded">
                    <div className="font-bold text-green-400">{inventoryGrid.summary.occupiedSlots}</div>
                    <div className="text-gray-400">Occupied</div>
                  </div>
                  <div className="bg-gray-700 p-2 rounded">
                    <div className="font-bold text-gray-400">{inventoryGrid.summary.emptySlots}</div>
                    <div className="text-gray-400">Empty</div>
                  </div>
                  <div className="bg-gray-700 p-2 rounded">
                    <div className="font-bold text-blue-400">{inventoryGrid.summary.totalStock}</div>
                    <div className="text-gray-400">Total Stock</div>
                  </div>
                  <div className="bg-gray-700 p-2 rounded">
                    <div className="font-bold">{inventoryGrid.products.filter(p => p.value !== 0).length}</div>
                    <div className="text-gray-400">Products</div>
                  </div>
                </div>

                {/* 8x8 Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="p-1 text-xs text-gray-500">Row</th>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(col => (
                          <th key={col} className="p-1 text-xs text-gray-500">Col {col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryGrid.grid.map((row) => (
                        <tr key={row.index}>
                          <td className="p-1 text-xs text-gray-500 text-center font-bold">
                            {row.index}
                          </td>
                          {row.column.map((slot) => (
                            <td key={`${row.index}-${slot.index}`} className="p-1">
                              <div
                                className={`${getSlotColor(slot.product_id, slot.stock)} rounded p-2 text-center min-w-[80px] cursor-pointer hover:opacity-80 transition-opacity`}
                                title={slot.product_id !== 0
                                  ? `${getProductName(slot.product_id)}\nStock: ${slot.stock}\nPosition: Row ${row.index}, Col ${slot.index}`
                                  : `Empty slot\nPosition: Row ${row.index}, Col ${slot.index}`}
                              >
                                {slot.product_id !== 0 ? (
                                  <>
                                    <div className="text-xs font-bold truncate">
                                      {getProductName(slot.product_id).substring(0, 10)}
                                    </div>
                                    <div className="text-xs opacity-75">
                                      x{slot.stock}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-xs text-gray-500">—</div>
                                )}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex gap-4 text-xs justify-center mt-2">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-600 rounded"></div>
                    <span>In Stock (3+)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-600 rounded"></div>
                    <span>Low Stock (1-2)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-600 rounded"></div>
                    <span>Out of Stock</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-700 rounded"></div>
                    <span>Empty</span>
                  </div>
                </div>

                {/* Product Breakdown */}
                {inventoryGrid.summary.productBreakdown.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-bold mb-2">Product Breakdown</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {inventoryGrid.summary.productBreakdown.map((product) => (
                        <div key={product.product_id} className="bg-gray-700 p-2 rounded text-sm">
                          <div className="font-bold truncate" title={product.name}>{product.name}</div>
                          <div className="text-gray-400">
                            {product.slots} slot{product.slots !== 1 ? 's' : ''} · {product.totalStock} total
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!inventoryGrid && !loadingInventory && !inventoryError && (
              <div className="text-center py-8 text-gray-400">
                Enter a machine ID to view the inventory grid
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}