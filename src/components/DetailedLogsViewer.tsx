import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Log {
  id: string;
  type: string;
  endpoint: string;
  requestData: any;
  response: any;
  status: number | null;
  error: string | null;
  createdAt: string;
}

interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const DetailedLogsViewer = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });
  const [endpointFilter, setEndpointFilter] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const fetchLogs = async (endpoint?: string, limit = 20, offset = 0) => {
    if (!user) return;
    
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (endpoint) queryParams.append('endpoint', endpoint);
      queryParams.append('limit', limit.toString());
      queryParams.append('offset', offset.toString());
      
      const response = await fetch(`/api/logs/detailed?${queryParams.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      
      const data = await response.json();
      setLogs(data.logs);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError('Failed to load logs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLogs(endpointFilter);
    }
  }, [user, endpointFilter]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    
    if (value === 'all') {
      setEndpointFilter('');
    } else if (value === 'upload') {
      setEndpointFilter('/api/upload');
    } else if (value === 'content') {
      setEndpointFilter('/api/content-posts');
    } else if (value === 'image') {
      setEndpointFilter('/api/image');
    }
  };

  const handleLoadMore = () => {
    fetchLogs(endpointFilter, pagination.limit, pagination.offset + pagination.limit);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatJson = (json: any) => {
    if (!json) return 'No data';
    try {
      if (typeof json === 'string') {
        return json;
      }
      return JSON.stringify(json, null, 2);
    } catch (err) {
      return 'Invalid JSON data';
    }
  };

  const getStatusBadge = (status: number | null) => {
    if (!status) return <Badge variant="outline">No Status</Badge>;
    
    if (status >= 200 && status < 300) {
      return <Badge variant="success" className="bg-green-500">Success {status}</Badge>;
    } else if (status >= 400 && status < 500) {
      return <Badge variant="destructive">Client Error {status}</Badge>;
    } else if (status >= 500) {
      return <Badge variant="destructive" className="bg-red-700">Server Error {status}</Badge>;
    }
    
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Detailed Logs</CardTitle>
        <CardDescription>
          View detailed logs for troubleshooting upload and content post issues
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">All Logs</TabsTrigger>
            <TabsTrigger value="upload">Upload Logs</TabsTrigger>
            <TabsTrigger value="content">Content Post Logs</TabsTrigger>
            <TabsTrigger value="image">Image Serving Logs</TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab}>
            {loading && logs.length === 0 ? (
              <div className="flex justify-center p-4">Loading logs...</div>
            ) : error ? (
              <div className="text-red-500 p-4">{error}</div>
            ) : logs.length === 0 ? (
              <div className="text-center p-4">No logs found</div>
            ) : (
              <>
                <div className="text-sm text-muted-foreground mb-2">
                  Showing {logs.length} of {pagination.total} logs
                </div>
                <ScrollArea className="h-[600px] rounded-md border p-4">
                  {logs.map((log) => (
                    <div key={log.id} className="mb-6 pb-6 border-b">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-medium">{log.endpoint}</h3>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(log.createdAt)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {getStatusBadge(log.status)}
                          <Badge variant="outline">{log.type}</Badge>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <h4 className="text-sm font-medium mb-1">Request Data</h4>
                          <pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-[200px]">
                            {formatJson(log.requestData)}
                          </pre>
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium mb-1">Response</h4>
                          <pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-[200px]">
                            {formatJson(log.response)}
                          </pre>
                        </div>
                      </div>
                      
                      {log.error && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium mb-1 text-red-500">Error</h4>
                          <pre className="text-xs bg-red-50 text-red-800 p-2 rounded-md overflow-auto max-h-[200px]">
                            {log.error}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </ScrollArea>
                
                {pagination.hasMore && (
                  <div className="flex justify-center mt-4">
                    <Button onClick={handleLoadMore} variant="outline">
                      Load More
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DetailedLogsViewer;