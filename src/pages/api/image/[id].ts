import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { promises as fs } from 'fs';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { LogType } from '@prisma/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    logger.error(`Method not allowed: ${req.method} for image API`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    logger.error(`Invalid image ID: ${id}`);
    return res.status(400).json({ error: 'Invalid image ID' });
  }

  logger.info(`Image API called for ID: ${id}`);

  try {
    // Create Supabase client
    const supabase = createClient(req, res);
    
    // Get user for logging purposes
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    // Create a log entry for this image request
    let logEntry;
    if (userId) {
      logEntry = await prisma.log.create({
        data: {
          type: LogType.CONTENT_POST,
          endpoint: `/api/image/${id}`,
          requestData: { 
            method: req.method, 
            headers: req.headers,
            id 
          },
          userId: userId,
        },
      });
      logger.info(`Created log entry for image request: ${logEntry.id}`, { userId });
    }

    // Look up the URL mapping in the database directly
    try {
      const mapping = await prisma.urlMapping.findUnique({
        where: { short_id: id }
      });

      if (!mapping) {
        const errorMsg = `Image mapping not found for ID: ${id}`;
        logger.error(errorMsg);
        
        // Update log with error if we have a log entry
        if (logEntry) {
          await prisma.log.update({
            where: { id: logEntry.id },
            data: {
              error: errorMsg,
              status: 404
            }
          });
        }
        
        return res.status(404).json({ error: 'Image not found' });
      }

      // Update access count and timestamp
      await prisma.urlMapping.update({
        where: { id: mapping.id },
        data: {
          access_count: { increment: 1 },
          accessed_at: new Date()
        }
      });

      logger.info(`Found URL mapping: ${mapping.short_id} -> ${mapping.original_path}`, 
        userId ? { userId } : undefined);

      try {
        // Check if file exists and is readable
        try {
          await fs.access(mapping.original_path, fs.constants.R_OK);
          logger.info(`File is accessible at path: ${mapping.original_path}`, 
            userId ? { userId } : undefined);
        } catch (accessError) {
          logger.error(`File access error: ${accessError.message}`, accessError, 
            userId ? { userId } : undefined);
          throw accessError;
        }

        // Read the file from the temporary path
        const fileBuffer = await fs.readFile(mapping.original_path);
        logger.info(`Successfully read file from path: ${mapping.original_path}, size: ${fileBuffer.length} bytes`, 
          userId ? { userId } : undefined);

        // Set the appropriate content type
        res.setHeader('Content-Type', mapping.mime_type || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        // Update log with success if we have a log entry
        if (logEntry) {
          await prisma.log.update({
            where: { id: logEntry.id },
            data: {
              response: {
                contentType: mapping.mime_type,
                fileSize: fileBuffer.length,
                fileName: mapping.file_name
              },
              status: 200
            }
          });
        }
        
        // Send the file
        return res.status(200).send(fileBuffer);
      } catch (fileError) {
        logger.error(`Error reading temporary file: ${mapping.original_path}`, fileError, 
          userId ? { userId } : undefined);
        
        // If we can't read the file, try to get it from Supabase storage as a fallback
        try {
          logger.info(`Attempting to retrieve file from Supabase storage: ${mapping.file_name}`, 
            userId ? { userId } : undefined);
          
          // Try to download the file from Supabase storage
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('uploads')
            .download(`${mapping.user_id}/${mapping.file_name}`);
            
          if (downloadError || !fileData) {
            logger.error(`Supabase storage download error: ${downloadError?.message || 'No file data returned'}`, 
              downloadError, userId ? { userId } : undefined);
            throw downloadError || new Error('File not found in storage');
          }
          
          // Convert the blob to a buffer
          const buffer = await fileData.arrayBuffer();
          logger.info(`Successfully retrieved file from Supabase storage, size: ${buffer.byteLength} bytes`, 
            userId ? { userId } : undefined);
          
          // Set the appropriate content type
          res.setHeader('Content-Type', mapping.mime_type || 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          
          // Update log with success if we have a log entry
          if (logEntry) {
            await prisma.log.update({
              where: { id: logEntry.id },
              data: {
                response: {
                  contentType: mapping.mime_type,
                  fileSize: buffer.byteLength,
                  fileName: mapping.file_name,
                  source: 'supabase_storage'
                },
                status: 200
              }
            });
          }
          
          // Send the file
          return res.status(200).send(Buffer.from(buffer));
        } catch (storageError) {
          const errorMsg = `Failed to retrieve file from storage: ${storageError.message}`;
          logger.error(errorMsg, storageError, userId ? { userId } : undefined);
          
          // Update log with error if we have a log entry
          if (logEntry) {
            await prisma.log.update({
              where: { id: logEntry.id },
              data: {
                error: errorMsg,
                status: 404
              }
            });
          }
          
          return res.status(404).json({ error: 'Image not found or no longer available' });
        }
      }
    } catch (dbError) {
      const errorMsg = `Database error looking up URL mapping: ${dbError.message}`;
      logger.error(errorMsg, dbError, userId ? { userId } : undefined);
      
      // Update log with error if we have a log entry
      if (logEntry) {
        await prisma.log.update({
          where: { id: logEntry.id },
          data: {
            error: errorMsg,
            status: 500
          }
        });
      }
      
      return res.status(500).json({ error: 'Failed to retrieve image information' });
    }
  } catch (error) {
    const errorMsg = `Unexpected error in image API: ${error.message}`;
    logger.error(errorMsg, error);
    return res.status(500).json({ error: 'Failed to serve image. Please try again later.' });
  }
}