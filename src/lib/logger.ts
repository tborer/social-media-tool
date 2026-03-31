// Client-safe logger — no Prisma. For server-side DB logging use src/lib/server-logger.ts

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
