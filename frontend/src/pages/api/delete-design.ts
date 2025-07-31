import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { filename } = req.body;
      
      if (!filename) {
        return res.status(400).json({ success: false, error: 'Filename is required' });
      }
      
      // Security check: ensure filename doesn't contain path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ success: false, error: 'Invalid filename' });
      }
      
      const filepath = path.join(process.cwd(), 'public', 'designs', filename);
      
      // Check if file exists
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ success: false, error: 'Design not found' });
      }
      
      // Delete the file
      fs.unlinkSync(filepath);
      
      // Also delete the debug JSON file if it exists
      const debugFilename = filename.replace('.png', '_debug.json');
      const debugFilepath = path.join(process.cwd(), 'public', 'designs', debugFilename);
      if (fs.existsSync(debugFilepath)) {
        fs.unlinkSync(debugFilepath);
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting design:', error);
      res.status(500).json({ success: false, error: 'Failed to delete design' });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}