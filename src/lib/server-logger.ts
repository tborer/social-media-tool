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

function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (value instanceof Error) {
          return { name: value.name, message: value.message, stack: value.stack };
        }
        if (value instanceof File || value.constructor?.name === 'File') {
          return { name: value.name, size: value.size, type: value.type, lastModified: value.lastModified };
        }
      }
      return value;
    }, 2);
  } catch (error) {
    return `[Unstringifiable object: ${error.message}]`;
  }
}

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.info(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
    const lastArg = args.length > 0 ? args[args.length - 1] : null;
    if (lastArg && typeof lastArg === 'object' && lastArg.userId) {
      const { userId, ...rest } = lastArg;
      createServerLog({ type: LogType.CONTENT_POST, endpoint: 'console', requestData: { message, ...rest }, userId })
        .catch(err => console.error('Failed to create server log:', err));
    }
  },
  error: (message: string, ...args: any[]) => {
    const errorDetails = args.map(arg =>
      arg instanceof Error ? `${arg.name}: ${arg.message}\nStack: ${arg.stack}` : safeStringify(arg)
    ).join('\n');
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
    const lastArg = args.length > 0 ? args[args.length - 1] : null;
    if (lastArg && typeof lastArg === 'object' && lastArg.userId) {
      const { userId } = lastArg;
      createServerLog({ type: LogType.CONTENT_POST, endpoint: 'console', requestData: { message }, error: errorDetails, userId })
        .catch(err => console.error('Failed to create server log:', err));
    }
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
    const lastArg = args.length > 0 ? args[args.length - 1] : null;
    if (lastArg && typeof lastArg === 'object' && lastArg.userId) {
      const { userId, ...rest } = lastArg;
      createServerLog({ type: LogType.CONTENT_POST, endpoint: 'console', requestData: { message, ...rest }, userId })
        .catch(err => console.error('Failed to create server log:', err));
    }
  },
  debug: (message: string, ...args: any[]) => {
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
  },
};

export default logger;
