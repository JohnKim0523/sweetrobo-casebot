import React, { useState, useEffect } from 'react';

interface Design {
  id: string;
  imageUrl: string;
  timestamp: number;
  machineId: string;
  status: string;
  submittedAt: string;
  debugData?: any;
}

// Test machine IDs for development
const TEST_MACHINES = [
  { id: 'all', name: 'All Machines' },
  { id: 'printer_test_001', name: 'Test Printer NYC' },
  { id: 'printer_test_002', name: 'Test Printer LA' },
  { id: 'printer_test_003', name: 'Test Printer Chicago' },
  { id: 'no-machine', name: 'No Machine Assigned' },
];

export default function AdminDashboard() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [selectedMachine, setSelectedMachine] = useState('all');
  const [loading, setLoading] = useState(true);
  const [expandedDesigns, setExpandedDesigns] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchDesigns();
  }, [selectedMachine]);

  const fetchDesigns = async () => {
    setLoading(true);
    try {
      const machineQuery = selectedMachine !== 'all' ? `?machineId=${selectedMachine}` : '';
      const response = await fetch(`/api/admin/designs${machineQuery}`);
      const data = await response.json();
      
      if (data.success && data.designs) {
        setDesigns(data.designs);
      } else {
        console.error('Failed to fetch designs:', data.error);
        setDesigns([]);
      }
    } catch (error) {
      console.error('Error fetching designs:', error);
      setDesigns([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (design: Design) => {
    if (confirm('Are you sure you want to delete this design from AWS?')) {
      try {
        const response = await fetch('/api/admin/delete-design', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            designId: design.id,
            imageUrl: design.imageUrl,
            timestamp: design.timestamp,
          }),
        });
        
        const data = await response.json();
        
        if (data.success) {
          // Remove from local state
          setDesigns(prevDesigns => prevDesigns.filter(d => d.id !== design.id));
          alert('Design deleted successfully from AWS!');
        } else {
          alert(`Failed to delete: ${data.error}`);
        }
      } catch (error) {
        console.error('Error deleting design:', error);
        alert('Failed to delete design');
      }
    }
  };

  const toggleDebugData = (designId: string) => {
    setExpandedDesigns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(designId)) {
        newSet.delete(designId);
      } else {
        newSet.add(designId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'printing': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCleanup = async () => {
    if (confirm('This will delete all designs older than 1 minute (TEST MODE). Continue?')) {
      try {
        const response = await fetch('/api/admin/cleanup-old-designs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer cleanup-sweetrobo-2025-xY9kL3mN8pQ2wR5t',
          },
          body: JSON.stringify({ hoursOld: 0.017 }), // 0.017 hours = ~1 minute for testing
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert(`Cleanup complete! Deleted ${data.deletedCount} old designs.`);
          fetchDesigns(); // Refresh the list
        } else {
          alert(`Cleanup failed: ${data.error}`);
        }
      } catch (error) {
        console.error('Cleanup error:', error);
        alert('Failed to run cleanup');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Admin Dashboard - Phone Case Designs</h1>
      
      {/* Machine Filter and Cleanup */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label htmlFor="machine-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Machine:
            </label>
            <select
              id="machine-filter"
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              className="block w-full md:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {TEST_MACHINES.map(machine => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleCleanup}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md transition"
              title="Delete all designs older than 1 hour"
            >
              🧹 Cleanup Old Designs (1hr+)
            </button>
            <button
              onClick={fetchDesigns}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-gray-600">Loading designs...</p>
        </div>
      )}

      {/* Designs Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {designs.map((design) => (
            <div key={design.id} className="bg-white rounded-lg shadow-md p-4">
              <div className="flex justify-center mb-4">
                <img 
                  src={design.imageUrl} 
                  alt={`Design ${design.id}`}
                  style={{ 
                    width: '160px',
                    height: 'auto',
                    maxHeight: '360px',
                    borderRadius: '0.25rem',
                    display: 'block',
                    imageRendering: 'crisp-edges'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjI5NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjI5NiIgZmlsbD0iI2RkZCIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjgwIiB5PSIxNDgiIGZpbGw9IiM5OTkiPkltYWdlIE5vdCBGb3VuZDwvdGV4dD48L3N2Zz4=';
                  }}
                />
              </div>
              
              {/* Status Badge */}
              <div className="mb-2">
                <span className={`inline-block px-2 py-1 text-xs rounded-full ${getStatusColor(design.status)}`}>
                  {design.status}
                </span>
              </div>
              
              {/* Design Info */}
              <p className="text-sm text-gray-600">
                Submitted: {new Date(design.timestamp).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Machine: {TEST_MACHINES.find(m => m.id === design.machineId)?.name || design.machineId}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                ID: {design.id.substring(0, 8)}...
              </p>
              
              {/* Action Buttons */}
              <div className="flex gap-2 mt-3">
                <a
                  href={design.imageUrl}
                  download={`design_${design.id}.png`}
                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm transition inline-block"
                >
                  Download
                </a>
                {design.debugData && (
                  <button
                    onClick={() => toggleDebugData(design.id)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition"
                  >
                    {expandedDesigns.has(design.id) ? 'Hide' : 'Show'} Debug
                  </button>
                )}
                <button
                  onClick={() => handleDelete(design)}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition"
                >
                  Delete
                </button>
              </div>
              
              {/* Debug Data */}
              {expandedDesigns.has(design.id) && design.debugData && (
                <div className="mt-4 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                  <pre className="text-gray-700">{JSON.stringify(design.debugData, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* No Designs Message */}
      {!loading && designs.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No designs found for {selectedMachine === 'all' ? 'any machine' : 'this machine'}.</p>
        </div>
      )}
    </div>
  );
}