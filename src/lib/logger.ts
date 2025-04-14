import { LogType } from '@prisma/client';

interface LogData {
  type: LogType;
  endpoint: string;
  requestData: any;
  response?: any;
  status?: number;
  error?: string;
  userId: string;
}

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