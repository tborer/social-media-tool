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
};