import { LogType } from '@prisma/client';

interface LogData {
  type: string;
  endpoint: string;
  requestData: any;
  response?: any;
  status?: number;
  error?: string;
  userId: string;
}

// For client-side logging via API
export async function createLog(logData: LogData): Promise<void> {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logData),
    });
  } catch (error) {
    console.error('Failed to create log:', error);
  }
}

// For server-side logging (API routes)
export async function createServerLog(logData: LogData): Promise<void> {
  try {
    // Dynamic import to avoid bundling Prisma into client-side code
    const prisma = (await import('@/lib/prisma')).default;
    await prisma.log.create({
      data: {
        type: logData.type,
        endpoint: logData.endpoint,
        requestData: logData.requestData,
        response: logData.response,
        status: logData.status,
        error: logData.error,
        userId: logData.userId,
      },
    });
  } catch (error) {
    console.error('Failed to create server log:', error);
  }
}

// Helper function to safely stringify objects for logging
function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj, (key, value) => {
      // Handle circular references and special objects
      if (typeof value === 'object' && value !== null) {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        }
        // Handle File objects
        if (value instanceof File || value.constructor?.name === 'File') {
          return {
            name: value.name,
            size: value.size,
            type: value.type,
            lastModified: value.lastModified,
          };
        }
      }
      return value;
    }, 2);
  } catch (error) {
    return `[Unstringifiable object: ${error.message}]`;
  }
}

export async function fetchLogs(): Promise<any[]> {
  try {
    const response = await fetch('/api/logs');
    if (!response.ok) throw new Error('Failed to fetch logs');
    return await response.json();
  } catch (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
}

export const logger = {
  log: createLog,
  info: (message: string, ...args: any[]) => {
    console.info(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
  },
};

export default logger;
