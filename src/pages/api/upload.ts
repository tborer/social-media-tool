import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { IncomingForm } from 'formidable';
import { createReadStream } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/lib/logger';

// Disable the default body parser to handle form data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create Supabase client for authentication
  const supabase = createClient(req, res);
  
  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    logger.error('Authentication error in upload API:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the incoming form data
    const form = new IncomingForm({
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    // Process the form data
    form.parse(req, async (err, fields, files) => {
      if (err) {
        logger.error('Error parsing form data:', err);
        return res.status(500).json({ error: 'Failed to process file upload' });
      }

      // Get the uploaded file
      const file = files.file?.[0];
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      try {
        // Generate a unique file name
        const fileName = `${uuidv4()}-${file.originalFilename}`;
        
        // Upload the file to Supabase Storage
        const { data, error } = await supabase.storage
          .from('uploads')
          .upload(`${user.id}/${fileName}`, createReadStream(file.filepath), {
            contentType: file.mimetype || 'application/octet-stream',
            cacheControl: '3600',
          });

        if (error) {
          logger.error('Error uploading to Supabase Storage:', error);
          return res.status(500).json({ error: 'Failed to upload file to storage' });
        }

        // Get the public URL for the uploaded file
        const { data: urlData } = supabase.storage
          .from('uploads')
          .getPublicUrl(`${user.id}/${fileName}`);

        // Return the URL of the uploaded file
        return res.status(200).json({ 
          url: urlData.publicUrl,
          fileName: fileName,
          originalName: file.originalFilename,
          size: file.size,
          type: file.mimetype
        });
      } catch (uploadError) {
        logger.error('Error in file upload process:', uploadError);
        return res.status(500).json({ error: 'Failed to upload file' });
      }
    });
  } catch (error) {
    logger.error('Unexpected error in upload API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}