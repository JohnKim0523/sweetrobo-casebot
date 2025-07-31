import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb' // Increase limit to 10MB
    }
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { design, debugData, timestamp: clientTimestamp } = req.body;
      
      // Create designs directory if it doesn't exist
      const designsDir = path.join(process.cwd(), 'public', 'designs');
      if (!fs.existsSync(designsDir)) {
        fs.mkdirSync(designsDir, { recursive: true });
      }
      
      // Generate unique filename
      const timestamp = clientTimestamp || Date.now();
      const filename = `design_${timestamp}.png`;
      const filepath = path.join(designsDir, filename);
      
      // Convert base64 to buffer and save
      const base64Data = design.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
      
      // Save debug data as JSON file
      if (debugData) {
        const debugFilename = `design_${timestamp}_debug.json`;
        const debugFilepath = path.join(designsDir, debugFilename);
        fs.writeFileSync(debugFilepath, JSON.stringify({
          ...debugData,
          timestamp,
          submittedAt: new Date().toISOString(),
          imageSize: base64Data.length
        }, null, 2));
      }
      
      res.status(200).json({ 
        success: true, 
        filename: filename,
        url: `/designs/${filename}`
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to save design' });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}