import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { IncomingForm } from 'formidable';
import { createReadStream, promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import path from 'path';
import os from 'os';
import { LogType } from '@prisma/client';
import prisma from '@/lib/prisma';

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
    // Log request details for debugging
    logger.info('Upload API - Request details:', {
      method: req.method,
      url: req.url,
      headers: {
        cookie: req.headers.cookie ? 'present' : 'missing',
        authorization: req.headers.authorization ? 'present' : 'missing',
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
      },
      cookies: Object.keys(req.cookies),
    });
    
    // Create Supabase client for authentication
    const supabase = createClient(req, res);
    
    // Get the user from the session
    const { data, error: authError } = await supabase.auth.getUser();
    const user = data?.user;
    
    // Log authentication result
    logger.info('Upload API - Authentication result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message,
      authErrorCode: authError?.status,
    });
    
    if (authError || !user) {
      logger.error('Authentication error in upload API:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Create a log entry for this upload attempt
    const logEntry = await prisma.log.create({
      data: {
        type: LogType.CONTENT_POST,
        endpoint: '/api/upload',
        requestData: { method: req.method, headers: req.headers },
        userId: user.id,
      },
    });
    
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
      
      // Update log with form parsing result
      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          requestData: {
            method: req.method,
            headers: req.headers,
            fields: fields || {},
            filesInfo: files ? Object.keys(files).map(key => ({
              fieldName: key,
              count: files[key]?.length || 0
            })) : []
          }
        }
      });
      
      // Get the uploaded file
      const file = files.file?.[0];
      if (!file) {
        const errorMsg = 'No file uploaded or file field missing';
        logger.error(errorMsg, { userId: user.id });
        
        // Update log with error
        await prisma.log.update({
          where: { id: logEntry.id },
          data: {
            error: errorMsg,
            status: 400
          }
        });
        
        return res.status(400).json({ error: errorMsg });
      }

      // Log file details
      logger.info(`File details: name=${file.originalFilename}, size=${file.size}, type=${file.mimetype}`, { userId: user.id });
      
      // Update log with file details
      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          requestData: {
            ...logEntry.requestData as any,
            fileDetails: {
              name: file.originalFilename,
              size: file.size,
              type: file.mimetype,
              filepath: file.filepath
            }
          }
        }
      });

      // Generate a unique file name
      const fileName = `${uuidv4()}-${file.originalFilename}`;
      
      // Always try to upload to Supabase Storage
      try {
        logger.info(`Attempting to upload file to Supabase storage: ${fileName}`, { userId: user.id });
        
        // Check if file exists and is readable
        try {
          await fs.access(file.filepath, fs.constants.R_OK);
          logger.info(`File is accessible at path: ${file.filepath}`, { userId: user.id });
        } catch (accessError) {
          logger.error(`File access error: ${accessError.message}`, accessError, { userId: user.id });
          
          // Update log with error
          await prisma.log.update({
            where: { id: logEntry.id },
            data: {
              error: `File access error: ${accessError.message}`,
              status: 500
            }
          });
          
          return res.status(500).json({ error: 'File access error. Please try again.' });
        }
        
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
          logger.error('Supabase storage upload error:', uploadResult.error, { userId: user.id });
          throw uploadResult.error;
        }

        // Get the public URL for the uploaded file
        const urlResult = supabase.storage
          .from('uploads')
          .getPublicUrl(`${user.id}/${fileName}`);

        // Check if urlResult.data exists before accessing publicUrl
        if (!urlResult || !urlResult.data) {
          const errorMsg = 'Failed to get public URL for uploaded file';
          logger.error(errorMsg, { userId: user.id });
          
          // Update log with error
          await prisma.log.update({
            where: { id: logEntry.id },
            data: {
              error: errorMsg,
              status: 500
            }
          });
          
          throw new Error(errorMsg);
        }

        logger.info(`File uploaded successfully to Supabase: ${fileName}`, { userId: user.id });
        
        // Update log with success
        await prisma.log.update({
          where: { id: logEntry.id },
          data: {
            response: {
              url: urlResult.data.publicUrl,
              fileName: fileName,
              originalName: file.originalFilename,
              size: file.size,
              type: file.mimetype
            },
            status: 200
          }
        });
        
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
        logger.warn('Supabase storage stream upload failed, trying buffer upload:', supabaseError, { userId: user.id });
        
        try {
          // Read the file into a buffer
          let fileBuffer;
          try {
            fileBuffer = await fs.readFile(file.filepath);
            logger.info(`Successfully read file into buffer, size: ${fileBuffer.length} bytes`, { userId: user.id });
          } catch (readError) {
            logger.error(`Error reading file into buffer: ${readError.message}`, readError, { userId: user.id });
            
            // Update log with error
            await prisma.log.update({
              where: { id: logEntry.id },
              data: {
                error: `Error reading file: ${readError.message}`,
                status: 500
              }
            });
            
            throw readError;
          }
          
          // Try to upload the buffer to Supabase Storage
          const bufferUploadResult = await supabase.storage
            .from('uploads')
            .upload(`${user.id}/${fileName}`, fileBuffer, {
              contentType: file.mimetype || 'application/octet-stream',
              cacheControl: '3600',
            });
            
          if (bufferUploadResult.error) {
            logger.error('Supabase buffer upload error:', bufferUploadResult.error, { userId: user.id });
            throw bufferUploadResult.error;
          }
          
          // Get the public URL for the uploaded file
          const urlResult = supabase.storage
            .from('uploads')
            .getPublicUrl(`${user.id}/${fileName}`);
            
          if (!urlResult || !urlResult.data) {
            const errorMsg = 'Failed to get public URL for buffer-uploaded file';
            logger.error(errorMsg, { userId: user.id });
            
            // Update log with error
            await prisma.log.update({
              where: { id: logEntry.id },
              data: {
                error: errorMsg,
                status: 500
              }
            });
            
            throw new Error(errorMsg);
          }
          
          logger.info(`File uploaded successfully to Supabase using buffer: ${fileName}`, { userId: user.id });
          
          // Update log with success
          await prisma.log.update({
            where: { id: logEntry.id },
            data: {
              response: {
                url: urlResult.data.publicUrl,
                fileName: fileName,
                originalName: file.originalFilename,
                size: file.size,
                type: file.mimetype
              },
              status: 200
            }
          });
          
          // Return the URL of the uploaded file
          return res.status(200).json({
            url: urlResult.data.publicUrl,
            fileName: fileName,
            originalName: file.originalFilename,
            size: file.size,
            type: file.mimetype
          });
        } catch (bufferUploadError) {
          logger.error('Supabase buffer upload failed:', bufferUploadError, { userId: user.id });
          
          // Create a short URL for the temporary file
          try {
            // Create a temporary directory for the user if it doesn't exist
            const tempDir = path.join(os.tmpdir(), 'instacreate-temp', user.id);
            await fs.mkdir(tempDir, { recursive: true });
            logger.info(`Created temporary directory: ${tempDir}`, { userId: user.id });
            
            // Copy the file to the temporary directory
            const tempFilePath = path.join(tempDir, fileName);
            try {
              await fs.copyFile(file.filepath, tempFilePath);
              logger.info(`Copied file to temporary path: ${tempFilePath}`, { userId: user.id });
              
              // Verify the file was copied successfully
              const stats = await fs.stat(tempFilePath);
              logger.info(`Temporary file stats: size=${stats.size}, created=${stats.birthtime}`, { userId: user.id });
            } catch (copyError) {
              logger.error(`Error copying file to temporary location: ${copyError.message}`, copyError, { userId: user.id });
              
              // Update log with error
              await prisma.log.update({
                where: { id: logEntry.id },
                data: {
                  error: `Error copying file: ${copyError.message}`,
                  status: 500
                }
              });
              
              throw copyError;
            }
            
            // Create a short URL entry in database
            const shortId = uuidv4().split('-')[0]; // Use first part of UUID for shorter ID
            
            // Store the mapping in database
            try {
              await prisma.urlMapping.create({
                data: {
                  short_id: shortId,
                  original_path: tempFilePath,
                  user_id: user.id,
                  file_name: fileName,
                  mime_type: file.mimetype || 'application/octet-stream'
                }
              });
              
              logger.info(`Created URL mapping in database with short_id: ${shortId}`, { userId: user.id });
            } catch (dbError) {
              logger.error(`Error creating URL mapping in database: ${dbError.message}`, dbError, { userId: user.id });
              
              // Update log with error
              await prisma.log.update({
                where: { id: logEntry.id },
                data: {
                  error: `Database error: ${dbError.message}`,
                  status: 500
                }
              });
              
              throw dbError;
            }
            
            // Create a short URL that will be resolved by our API
            const shortUrl = `/api/image/${shortId}`;
            
            logger.info(`Created short URL for temporary file: ${shortUrl}`, { userId: user.id });
            
            // Update log with success
            await prisma.log.update({
              where: { id: logEntry.id },
              data: {
                response: {
                  url: shortUrl,
                  fileName: fileName,
                  originalName: file.originalFilename,
                  size: file.size,
                  type: file.mimetype,
                  isTemporary: true
                },
                status: 200
              }
            });
            
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
            const errorMsg = `Failed to create short URL: ${shortUrlError.message}`;
            logger.error(errorMsg, shortUrlError, { userId: user.id });
            
            // Update log with error
            await prisma.log.update({
              where: { id: logEntry.id },
              data: {
                error: errorMsg,
                status: 500
              }
            });
            
            throw shortUrlError;
          }
        }
      }
    } catch (formError) {
      const errorMsg = `Error processing form data: ${formError.message}`;
      logger.error(errorMsg, formError, { userId: user.id });
      
      // Update log with error
      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          error: errorMsg,
          status: 500
        }
      });
      
      return res.status(500).json({ error: 'Failed to process file upload. Please try again with a different file or contact support.' });
    }
  } catch (error) {
    const errorMsg = `Unexpected error in upload API: ${error.message}`;
    logger.error(errorMsg, error);
    return res.status(500).json({ error: 'Internal server error. Please try again later or contact support.' });
  }
}