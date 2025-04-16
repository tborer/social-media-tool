import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { IncomingForm } from 'formidable';
import { createReadStream, promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/lib/logger';
import path from 'path';
import os from 'os';

// Disable the default body parser to handle form data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Log the request method for debugging
  logger.info(`Upload API called with method: ${req.method}`);
  
  // Check if the method is allowed
  if (req.method !== 'POST') {
    logger.error(`Method not allowed: ${req.method} for upload API`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create Supabase client for authentication
    const supabase = createClient(req, res);
    
    // Get the user from the session
    const { data, error: authError } = await supabase.auth.getUser();
    const user = data?.user;
    
    if (authError || !user) {
      logger.error('Authentication error in upload API:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Parse the incoming form data
    const form = new IncomingForm({
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    // Wrap form parsing in a promise to handle errors properly
    const parseForm = () => {
      return new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({ fields, files });
        });
      });
    };

    try {
      // Parse the form data
      const { fields, files } = await parseForm() as any;
      
      // Get the uploaded file
      const file = files.file?.[0];
      if (!file) {
        logger.error('No file uploaded');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Generate a unique file name
      const fileName = `${uuidv4()}-${file.originalFilename}`;
      
      // Try to upload to Supabase Storage first
      try {
        logger.info(`Attempting to upload file to Supabase storage: ${fileName}`);
        
        // Upload the file to Supabase Storage
        const uploadResult = await supabase.storage
          .from('uploads')
          .upload(`${user.id}/${fileName}`, createReadStream(file.filepath), {
            contentType: file.mimetype || 'application/octet-stream',
            cacheControl: '3600',
          });

        if (uploadResult.error) {
          logger.error('Supabase storage upload error:', uploadResult.error);
          throw uploadResult.error;
        }

        // Get the public URL for the uploaded file
        const urlResult = supabase.storage
          .from('uploads')
          .getPublicUrl(`${user.id}/${fileName}`);

        // Check if urlResult.data exists before accessing publicUrl
        if (!urlResult || !urlResult.data) {
          logger.error('Failed to get public URL for uploaded file');
          throw new Error('Failed to get public URL for uploaded file');
        }

        logger.info(`File uploaded successfully to Supabase: ${fileName}`);
        
        // Return the URL of the uploaded file
        return res.status(200).json({ 
          url: urlResult.data.publicUrl,
          fileName: fileName,
          originalName: file.originalFilename,
          size: file.size,
          type: file.mimetype
        });
      } catch (supabaseError) {
        // If Supabase upload fails, fall back to temporary local storage
        logger.warn('Supabase storage upload failed, using temporary storage:', supabaseError);
        
        try {
          // Create a temporary directory for the user if it doesn't exist
          const tempDir = path.join(os.tmpdir(), 'instacreate-temp', user.id);
          await fs.mkdir(tempDir, { recursive: true });
          
          // Copy the file to the temporary directory
          const tempFilePath = path.join(tempDir, fileName);
          await fs.copyFile(file.filepath, tempFilePath);
          
          // Generate a temporary URL for the file
          // In a real production environment, you would use a CDN or cloud storage
          // For this demo, we'll create a base64 data URL
          const fileBuffer = await fs.readFile(tempFilePath);
          const base64Data = fileBuffer.toString('base64');
          const dataUrl = `data:${file.mimetype || 'application/octet-stream'};base64,${base64Data}`;
          
          logger.info(`File stored in temporary storage: ${fileName}`);
          
          // Return the data URL
          return res.status(200).json({
            url: dataUrl,
            fileName: fileName,
            originalName: file.originalFilename,
            size: file.size,
            type: file.mimetype,
            isTemporary: true
          });
        } catch (tempStorageError) {
          logger.error('Temporary storage fallback failed:', tempStorageError);
          throw tempStorageError;
        }
      }
    } catch (formError) {
      logger.error('Error processing form data:', formError);
      return res.status(500).json({ error: 'Failed to process file upload' });
    }
  } catch (error) {
    logger.error('Unexpected error in upload API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}