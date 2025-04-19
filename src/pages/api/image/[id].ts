import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { promises as fs } from 'fs';
import { logger } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid image ID' });
  }

  try {
    // Create Supabase client
    const supabase = createClient(req, res);

    // Look up the short URL mapping
    const { data: mapping, error: mappingError } = await supabase
      .from('url_mappings')
      .select('*')
      .eq('short_id', id)
      .single();

    if (mappingError || !mapping) {
      logger.error(`Image not found for ID: ${id}`, mappingError);
      return res.status(404).json({ error: 'Image not found' });
    }

    try {
      // Read the file from the temporary path
      const fileBuffer = await fs.readFile(mapping.original_path);

      // Set the appropriate content type
      res.setHeader('Content-Type', mapping.mime_type || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      // Send the file
      return res.status(200).send(fileBuffer);
    } catch (fileError) {
      logger.error(`Error reading temporary file: ${mapping.original_path}`, fileError);
      
      // If we can't read the file, try to get it from Supabase storage as a fallback
      try {
        const { data: user } = await supabase.auth.getUser();
        
        if (!user || !user.user) {
          throw new Error('User not authenticated');
        }
        
        // Try to download the file from Supabase storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('uploads')
          .download(`${mapping.user_id}/${mapping.file_name}`);
          
        if (downloadError || !fileData) {
          throw downloadError || new Error('File not found in storage');
        }
        
        // Convert the blob to a buffer
        const buffer = await fileData.arrayBuffer();
        
        // Set the appropriate content type
        res.setHeader('Content-Type', mapping.mime_type || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        // Send the file
        return res.status(200).send(Buffer.from(buffer));
      } catch (storageError) {
        logger.error('Failed to retrieve file from storage:', storageError);
        return res.status(404).json({ error: 'Image not found or no longer available' });
      }
    }
  } catch (error) {
    logger.error('Error serving image:', error);
    return res.status(500).json({ error: 'Failed to serve image' });
  }
}