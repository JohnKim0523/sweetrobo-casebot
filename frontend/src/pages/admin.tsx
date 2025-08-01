import React, { useState } from 'react';
import fs from 'fs';
import path from 'path';
import { GetServerSideProps } from 'next';

interface Design {
  filename: string;
  url: string;
  timestamp: number;
  debugData?: any;
}

interface AdminPageProps {
  designs: Design[];
}

export default function AdminDashboard({ designs: initialDesigns }: AdminPageProps) {
  const [designs, setDesigns] = useState<Design[]>(initialDesigns);
  const [expandedDesigns, setExpandedDesigns] = useState<Set<string>>(new Set());

  const handleDelete = async (filename: string) => {
    if (confirm('Are you sure you want to delete this design?')) {
      try {
        const response = await fetch('/api/delete-design', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filename }),
        });

        if (response.ok) {
          setDesigns(designs.filter(d => d.filename !== filename));
          alert('Design deleted successfully');
        } else {
          alert('Failed to delete design');
        }
      } catch (error) {
        console.error('Error deleting design:', error);
        alert('Failed to delete design');
      }
    }
  };

  const toggleDebugData = (filename: string) => {
    setExpandedDesigns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filename)) {
        newSet.delete(filename);
      } else {
        newSet.add(filename);
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Admin Dashboard - Phone Case Designs</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {designs.map((design) => (
          <div key={design.filename} className="bg-white rounded-lg shadow-md p-4">
            <img 
              src={design.url} 
              alt={`Design ${design.filename}`}
              className="w-40 h-auto mx-auto rounded mb-4"
              style={{ maxHeight: '360px' }}
            />
            <p className="text-sm text-gray-600">
              Submitted: {new Date(design.timestamp).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {design.filename}
            </p>
            <div className="flex gap-2 mt-3">
              {design.debugData && (
                <button
                  onClick={() => toggleDebugData(design.filename)}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition"
                >
                  {expandedDesigns.has(design.filename) ? 'Hide' : 'Show'} Debug Data
                </button>
              )}
              <button
                onClick={() => handleDelete(design.filename)}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition"
              >
                Delete
              </button>
            </div>
            {expandedDesigns.has(design.filename) && design.debugData && (
              <div className="mt-4 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                <pre className="text-gray-700">{JSON.stringify(design.debugData, null, 2)}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {designs.length === 0 && (
        <p className="text-gray-500 text-center mt-8">No designs submitted yet.</p>
      )}
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const designsDir = path.join(process.cwd(), 'public', 'designs');
  let designs: Design[] = [];
  
  try {
    if (fs.existsSync(designsDir)) {
      const files = fs.readdirSync(designsDir);
      designs = files
        .filter(file => file.endsWith('.png'))
        .map(file => {
          const timestamp = parseInt(file.replace('design_', '').replace('.png', ''));
          const debugFilename = file.replace('.png', '_debug.json');
          let debugData = null;
          
          // Check if debug file exists
          const debugFilePath = path.join(designsDir, debugFilename);
          if (fs.existsSync(debugFilePath)) {
            try {
              debugData = JSON.parse(fs.readFileSync(debugFilePath, 'utf8'));
            } catch (error) {
              console.error('Error reading debug file:', error);
            }
          }
          
          return {
            filename: file,
            url: `/designs/${file}`,
            timestamp: timestamp,
            debugData: debugData
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch (error) {
    console.error('Error reading designs:', error);
  }
  
  return {
    props: {
      designs
    }
  };
};