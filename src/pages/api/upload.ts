import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { IncomingForm } from 'formidable';
import { createReadStream, promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
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
    return res.status(405).json({ error: 'Upload method not allowed. Please try again or contact support.' });
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
      
      // Always try to upload to Supabase Storage
      try {
        logger.info(`Attempting to upload file to Supabase storage: ${fileName}`);
        
        // Create a readable stream from the file
        const fileStream = createReadStream(file.filepath);
        
        // Upload the file to Supabase Storage
        const uploadResult = await supabase.storage
          .from('uploads')
          .upload(`${user.id}/${fileName}`, fileStream, {
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
        // If direct Supabase upload fails, try to upload the file as a buffer
        logger.warn('Supabase storage stream upload failed, trying buffer upload:', supabaseError);
        
        try {
          // Read the file into a buffer
          const fileBuffer = await fs.readFile(file.filepath);
          
          // Try to upload the buffer to Supabase Storage
          const bufferUploadResult = await supabase.storage
            .from('uploads')
            .upload(`${user.id}/${fileName}`, fileBuffer, {
              contentType: file.mimetype || 'application/octet-stream',
              cacheControl: '3600',
            });
            
          if (bufferUploadResult.error) {
            logger.error('Supabase buffer upload error:', bufferUploadResult.error);
            throw bufferUploadResult.error;
          }
          
          // Get the public URL for the uploaded file
          const urlResult = supabase.storage
            .from('uploads')
            .getPublicUrl(`${user.id}/${fileName}`);
            
          if (!urlResult || !urlResult.data) {
            logger.error('Failed to get public URL for buffer-uploaded file');
            throw new Error('Failed to get public URL for buffer-uploaded file');
          }
          
          logger.info(`File uploaded successfully to Supabase using buffer: ${fileName}`);
          
          // Return the URL of the uploaded file
          return res.status(200).json({
            url: urlResult.data.publicUrl,
            fileName: fileName,
            originalName: file.originalFilename,
            size: file.size,
            type: file.mimetype
          });
        } catch (bufferUploadError) {
          logger.error('Supabase buffer upload failed:', bufferUploadError);
          
          // Create a short URL for the temporary file
          try {
            // Create a temporary directory for the user if it doesn't exist
            const tempDir = path.join(os.tmpdir(), 'instacreate-temp', user.id);
            await fs.mkdir(tempDir, { recursive: true });
            
            // Copy the file to the temporary directory
            const tempFilePath = path.join(tempDir, fileName);
            await fs.copyFile(file.filepath, tempFilePath);
            
            // Create a short URL entry in Supabase
            const shortId = uuidv4().split('-')[0]; // Use first part of UUID for shorter ID
            
            // Store the mapping in Supabase
            const { error: mappingError } = await supabase
              .from('url_mappings')
              .insert({
                short_id: shortId,
                original_path: tempFilePath,
                user_id: user.id,
                file_name: fileName,
                mime_type: file.mimetype || 'application/octet-stream'
              });
              
            if (mappingError) {
              logger.error('Error creating URL mapping:', mappingError);
              throw mappingError;
            }
            
            // Create a short URL that will be resolved by our API
            const shortUrl = `/api/image/${shortId}`;
            
            logger.info(`Created short URL for temporary file: ${shortUrl}`);
            
            // Return the short URL
            return res.status(200).json({
              url: shortUrl,
              fileName: fileName,
              originalName: file.originalFilename,
              size: file.size,
              type: file.mimetype,
              isTemporary: true
            });
          } catch (shortUrlError) {
            logger.error('Failed to create short URL:', shortUrlError);
            throw shortUrlError;
          }
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