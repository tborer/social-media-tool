import { LogType } from '@prisma/client';
import prisma from '@/lib/prisma';

interface LogData {
  type: LogType;
  endpoint: string;
  requestData: any;
  response?: any;
  status?: number;
  error?: string;
  userId: string;
}

// For client-side logging
export async function createLog(logData: LogData): Promise<void> {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logData),
    });
  } catch (error) {
    console.error('Failed to create log:', error);
  }
}

// For server-side logging (API routes)
export async function createServerLog(logData: LogData): Promise<void> {
  try {
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
    if (!response.ok) {
      throw new Error('Failed to fetch logs');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
}

// Export a logger object for convenience
export const logger = {
  log: createLog,
  serverLog: createServerLog,
  
  // Enhanced console logging methods
  info: (message: string, ...args: any[]) => {
    console.info(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
    
    // Log to database if userId is provided as the last argument
    const lastArg = args.length > 0 ? args[args.length - 1] : null;
    if (lastArg && typeof lastArg === 'object' && lastArg.userId) {
      const { userId, ...rest } = lastArg;
      createServerLog({
        type: LogType.CONTENT_POST,
        endpoint: 'console',
        requestData: { message, ...rest },
        userId,
      }).catch(err => console.error('Failed to create server log:', err));
    }
  },
  
  error: (message: string, ...args: any[]) => {
    // Create a detailed error log
    const errorDetails = args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\nStack: ${arg.stack}`;
      }
      return safeStringify(arg);
    }).join('\n');
    
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
    
    // Log to database if userId is provided as the last argument
    const lastArg = args.length > 0 ? args[args.length - 1] : null;
    if (lastArg && typeof lastArg === 'object' && lastArg.userId) {
      const { userId, ...rest } = lastArg;
      createServerLog({
        type: LogType.CONTENT_POST,
        endpoint: 'console',
        requestData: { message },
        error: errorDetails,
        userId,
      }).catch(err => console.error('Failed to create server log:', err));
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
    
    // Log to database if userId is provided as the last argument
    const lastArg = args.length > 0 ? args[args.length - 1] : null;
    if (lastArg && typeof lastArg === 'object' && lastArg.userId) {
      const { userId, ...rest } = lastArg;
      createServerLog({
        type: LogType.CONTENT_POST,
        endpoint: 'console',
        requestData: { message, ...rest },
        userId,
      }).catch(err => console.error('Failed to create server log:', err));
    }
  },
  
  debug: (message: string, ...args: any[]) => {
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
  }
};

// Default export for backward compatibility
export default logger;