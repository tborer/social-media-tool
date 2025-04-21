import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Header from '@/components/Header';
import DetailedLogsViewer from '@/components/DetailedLogsViewer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, FileText, Upload, Image } from 'lucide-react';

const TroubleshootingPage = () => {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto py-6 px-4 md:px-6">
          <h1 className="text-3xl font-bold mb-6">Troubleshooting</h1>
          
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Troubleshooting Tools</AlertTitle>
            <AlertDescription>
              This page provides tools to help diagnose and resolve issues with file uploads and content posts.
            </AlertDescription>
          </Alert>
          
          <Tabs defaultValue="logs">
            <TabsList className="mb-6">
              <TabsTrigger value="logs">
                <FileText className="h-4 w-4 mr-2" />
                Detailed Logs
              </TabsTrigger>
              <TabsTrigger value="upload-issues">
                <Upload className="h-4 w-4 mr-2" />
                Upload Issues
              </TabsTrigger>
              <TabsTrigger value="image-issues">
                <Image className="h-4 w-4 mr-2" />
                Image Issues
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="logs">
              <DetailedLogsViewer />
            </TabsContent>
            
            <TabsContent value="upload-issues">
              <Card>
                <CardHeader>
                  <CardTitle>Common Upload Issues</CardTitle>
                  <CardDescription>
                    Solutions for common file upload problems
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">Failed to process file upload</h3>
                    <p className="text-muted-foreground mt-1">
                      This error can occur for several reasons:
                    </p>
                    <ul className="list-disc pl-6 mt-2 space-y-2">
                      <li>The file may be too large (maximum size is 10MB)</li>
                      <li>The file format may not be supported (supported formats: JPEG, PNG, GIF)</li>
                      <li>There might be temporary issues with the storage service</li>
                      <li>The file might be corrupted or have an invalid format</li>
                    </ul>
                    <p className="mt-2">
                      <strong>Solution:</strong> Try uploading a smaller image or a different file format. 
                      Check the detailed logs for more specific error information.
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium">Image URL is too long</h3>
                    <p className="text-muted-foreground mt-1">
                      This error occurs when the URL of the uploaded image exceeds the maximum allowed length (2000 characters).
                    </p>
                    <p className="mt-2">
                      <strong>Solution:</strong> The system now automatically creates shortened URLs for images. 
                      If you're still seeing this error, try uploading a different image or using a different upload method.
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium">Upload method not allowed</h3>
                    <p className="text-muted-foreground mt-1">
                      This error occurs when the upload API is called with an incorrect HTTP method.
                    </p>
                    <p className="mt-2">
                      <strong>Solution:</strong> Ensure you're using the POST method for uploads. 
                      If you're using the application's built-in upload functionality, please report this as a bug.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="image-issues">
              <Card>
                <CardHeader>
                  <CardTitle>Image Serving Issues</CardTitle>
                  <CardDescription>
                    Solutions for problems with image display and retrieval
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">Image not found or no longer available</h3>
                    <p className="text-muted-foreground mt-1">
                      This error occurs when the system cannot find an image that was previously uploaded.
                    </p>
                    <ul className="list-disc pl-6 mt-2 space-y-2">
                      <li>Temporary images may have expired</li>
                      <li>The image might have been deleted from storage</li>
                      <li>The image URL might be incorrect or malformed</li>
                    </ul>
                    <p className="mt-2">
                      <strong>Solution:</strong> Try uploading the image again. If the problem persists,
                      check the detailed logs for more information about the specific error.
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium">Image URL is invalid or expired</h3>
                    <p className="text-muted-foreground mt-1">
                      This error occurs when trying to use a temporary image URL that has expired or is invalid.
                    </p>
                    <p className="mt-2">
                      <strong>Solution:</strong> Temporary image URLs are valid for a limited time. 
                      Upload the image again to get a fresh URL. For permanent storage, 
                      save the post to convert the temporary URL to a permanent one.
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium">Failed to serve image</h3>
                    <p className="text-muted-foreground mt-1">
                      This is a general error that occurs when the system encounters an unexpected issue while serving an image.
                    </p>
                    <p className="mt-2">
                      <strong>Solution:</strong> Check the detailed logs for more specific error information.
                      Try refreshing the page or uploading the image again. If the problem persists,
                      it might indicate a server-side issue that requires administrator attention.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </ProtectedRoute>
  );
};

export default TroubleshootingPage;