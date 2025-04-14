import { useEffect, useState } from 'react';
import { fetchLogs } from '@/lib/logger';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LogType } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface Log {
  id: string;
  type: LogType;
  endpoint: string;
  requestData: any;
  response?: any;
  status?: number;
  error?: string;
  createdAt: string;
}

export default function LogsViewer() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | LogType>('all');

  const loadLogs = async () => {
    setLoading(true);
    const fetchedLogs = await fetchLogs();
    setLogs(fetchedLogs);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = activeTab === 'all' 
    ? logs 
    : logs.filter(log => log.type === activeTab);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatJson = (json: any) => {
    try {
      return JSON.stringify(json, null, 2);
    } catch (e) {
      return String(json);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Request Logs</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadLogs} 
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | LogType)}>
        <TabsList>
          <TabsTrigger value="all">All Logs</TabsTrigger>
          <TabsTrigger value="CONTENT_POST">Content Posts</TabsTrigger>
          <TabsTrigger value="AI_GENERATION">AI Generation</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Log Entries</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p>Loading logs...</p>
              ) : filteredLogs.length === 0 ? (
                <p>No logs found</p>
              ) : (
                <div className="max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Endpoint</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow 
                          key={log.id} 
                          className={`cursor-pointer ${selectedLog?.id === log.id ? 'bg-muted' : ''}`}
                          onClick={() => setSelectedLog(log)}
                        >
                          <TableCell>
                            <Badge variant={log.type === 'CONTENT_POST' ? 'default' : 'secondary'}>
                              {log.type === 'CONTENT_POST' ? 'Post' : 'AI'}
                            </Badge>
                          </TableCell>
                          <TableCell className="truncate max-w-[150px]">{log.endpoint}</TableCell>
                          <TableCell>{formatDate(log.createdAt)}</TableCell>
                          <TableCell>
                            {log.status ? (
                              <Badge variant={log.status >= 400 ? 'destructive' : 'outline'}>
                                {log.status}
                              </Badge>
                            ) : (
                              <Badge variant="outline">N/A</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          {selectedLog ? (
            <Card>
              <CardHeader>
                <CardTitle>Log Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">Request Data</h3>
                    <pre className="bg-muted p-4 rounded-md overflow-x-auto mt-2 text-xs">
                      {formatJson(selectedLog.requestData)}
                    </pre>
                  </div>

                  {selectedLog.response && (
                    <div>
                      <h3 className="text-lg font-medium">Response</h3>
                      <pre className="bg-muted p-4 rounded-md overflow-x-auto mt-2 text-xs">
                        {formatJson(selectedLog.response)}
                      </pre>
                    </div>
                  )}

                  {selectedLog.error && (
                    <div>
                      <h3 className="text-lg font-medium text-destructive">Error</h3>
                      <pre className="bg-destructive/10 p-4 rounded-md overflow-x-auto mt-2 text-xs">
                        {selectedLog.error}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-[400px]">
                <p className="text-muted-foreground">Select a log entry to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}