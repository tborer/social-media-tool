import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { IncomingForm } from 'formidable';
import { promises as fs, constants as FS_CONSTANTS } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import { LogType } from '@prisma/client';
import prisma from '@/lib/prisma';

// Disable the default body parser to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logger.info(`Upload API called with method: ${req.method}`);

  if (req.method !== 'POST') {
    logger.error(`Method not allowed: ${req.method} for upload API`);
    return res.status(405).json({ error: 'Upload method not allowed.' });
  }

  try {
    logger.info('Upload API - Request details:', {
      method: req.method,
      url: req.url,
      headers: {
        cookie: req.headers.cookie ? 'present' : 'missing',
        authorization: req.headers.authorization ? 'present' : 'missing',
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
      },
      cookies: Object.keys(req.cookies || {}),
    });

    const supabase = createClient(req, res);
    const { data, error: authError } = await supabase.auth.getUser();
    const user = data?.user;

    logger.info('Upload API - Authentication result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: (authError as any)?.message,
      authErrorCode: (authError as any)?.status,
    });

    if (authError || !user) {
      logger.error('Authentication error in upload API:', authError);
      return res.status(401).json({ error: 'You must be signed in to upload files.' });
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

    // Parse incoming multipart form
    const form = new IncomingForm({
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      multiples: false,
    });

    const parseForm = () =>
      new Promise<{ fields: any; files: any }>((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) return reject(err);
          resolve({ fields, files });
        });
      });

    try {
      const { fields, files } = (await parseForm()) as any;

      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          requestData: {
            method: req.method,
            headers: req.headers,
            fields: fields || {},
            filesInfo: files
              ? Object.keys(files).map((key) => ({
                  fieldName: key,
                  count: Array.isArray(files[key]) ? files[key].length : files[key] ? 1 : 0,
                }))
              : [],
          },
        },
      });

      // Support both array and single-file shapes from formidable
      const uploaded: any =
        (files as any)?.file?.[0] ||
        (files as any)?.file ||
        (Object.values(files || {})[0] as any)?.[0] ||
        Object.values(files || {})[0];

      if (!uploaded) {
        const errorMsg = 'No file was uploaded. Please attach an image and try again.';
        logger.error(errorMsg, { userId: user.id });

        await prisma.log.update({
          where: { id: logEntry.id },
          data: { error: errorMsg, status: 400 },
        });

        return res.status(400).json({ error: errorMsg });
      }

      const filePath: string = uploaded.filepath;
      const originalName: string = uploaded.originalFilename || 'upload';
      const mimeType: string = uploaded.mimetype || 'application/octet-stream';
      const size: number = uploaded.size || 0;

      logger.info(`File details: name=${originalName}, size=${size}, type=${mimeType}`, { userId: user.id });

      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          requestData: {
            method: req.method,
            headers: req.headers,
            fields: fields || {},
            fileDetails: {
              name: originalName,
              size,
              type: mimeType,
              filepath: filePath,
            },
          },
        },
      });

      const fileName = `${uuidv4()}-${originalName}`;

      // Single, reliable path: read to Buffer and upload to Supabase Storage
      try {
        // Ensure file is readable
        await fs.access(filePath, FS_CONSTANTS.R_OK);
        logger.info(`File is accessible at path: ${filePath}`, { userId: user.id });

        // Read file into memory
        const buffer = await fs.readFile(filePath);
        logger.info(`Read file into buffer, size: ${buffer.length} bytes`, { userId: user.id });

        const storagePath = `${user.id}/${fileName}`;
        const uploadResult = await supabase.storage.from('uploads').upload(storagePath, buffer, {
          contentType: mimeType,
          cacheControl: '3600',
          upsert: true,
        });

        if ((uploadResult as any)?.error) {
          const err: any = (uploadResult as any).error;
          logger.error('Supabase storage upload error:', err, { userId: user.id });

          await prisma.log.update({
            where: { id: logEntry.id },
            data: {
              error: `Supabase upload failed: ${err.message || 'Unknown error'}`,
              status: 500,
            },
          });

          return res.status(500).json({
            error: 'We could not upload your file right now. Please try again in a moment.',
            reference: logEntry.id,
          });
        }

        const urlResult = supabase.storage.from('uploads').getPublicUrl(storagePath);
        if (!urlResult || !urlResult.data || !urlResult.data.publicUrl) {
          const errorMsg = 'Failed to create public URL for the uploaded file.';
          logger.error(errorMsg, { userId: user.id });

          await prisma.log.update({
            where: { id: logEntry.id },
            data: { error: errorMsg, status: 500 },
          });

          return res.status(500).json({
            error: 'Your file was uploaded, but we could not create a public link. Please try again.',
            reference: logEntry.id,
          });
        }

        const uploadedPublicUrl = urlResult.data.publicUrl;

        await prisma.log.update({
          where: { id: logEntry.id },
          data: {
            response: {
              url: uploadedPublicUrl,
              fileName,
              originalName: originalName,
              size,
              type: mimeType,
            },
            status: 200,
          },
        });

        logger.info(`File uploaded successfully to Supabase: ${fileName}`, { userId: user.id });

        return res.status(200).json({
          url: uploadedPublicUrl,
          fileName,
          originalName: originalName,
          size,
          type: mimeType,
        });
      } finally {
        // Always attempt to clean up formidable temp file
        if (filePath) {
          try {
            await fs.unlink(filePath);
            logger.info(`Temp file cleaned up: ${filePath}`, { userId: user.id });
          } catch (cleanupErr: any) {
            // Do not fail the request on cleanup issues
            logger.warn(`Failed to clean up temp file: ${cleanupErr?.message}`, cleanupErr, { userId: user.id });
          }
        }
      }
    } catch (formError: any) {
      const message = String(formError?.message || '');
      const tooLarge =
        formError?.httpCode === 413 ||
        /maxFileSize/i.test(message) ||
        /request entity too large/i.test(message);

      const errorMsg = tooLarge
        ? 'This file is too large. The maximum allowed size is 10MB.'
        : 'Failed to process file upload. Please try again with a different file.';

      logger.error(`Error processing form data: ${message}`, formError, { userId: user?.id });

      // Best-effort log update for this request
      try {
        await prisma.log.update({
          where: { id: logEntry.id },
          data: {
            error: `Form parse error: ${message}`,
            status: tooLarge ? 413 : 500,
          },
        });
      } catch {
        // ignore
      }

      return res.status(tooLarge ? 413 : 500).json({ error: errorMsg });
    }
  } catch (error: any) {
    const errorMsg = `Unexpected error in upload API: ${error.message}`;
    logger.error(errorMsg, error);
    return res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
}