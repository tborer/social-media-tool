import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AuthContext } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const publicRoutes = ['/', '/login', '/signup', '/forgot-password', '/magic-link-login'];

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, initializing } = useContext(AuthContext);
  const router = useRouter();
  const [isDeveloperAccess, setIsDeveloperAccess] = useState(false);
  
  // Check for developer access parameter
  const devAccess = router.query.dev_access === 'true';

  useEffect(() => {
    // Set developer access state
    setIsDeveloperAccess(devAccess);
    
    // Only redirect to login if not developer access and not authenticated
    if (!initializing && !user && !publicRoutes.includes(router.pathname) && !devAccess) {
      router.push('/login');
    }
  }, [user, initializing, router, devAccess]);

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Allow access if user is authenticated OR if developer access is enabled
  if (!user && !publicRoutes.includes(router.pathname) && !devAccess) {
    return null;
  }

  return (
    <>
      {/* Show developer mode warning banner if using dev access */}
      {devAccess && (
        <Alert variant="destructive" className="mb-4 border-amber-600 bg-amber-900/20">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Developer Mode</AlertTitle>
          <AlertDescription>
            You are accessing this page in developer mode. Authentication is bypassed.
          </AlertDescription>
        </Alert>
      )}
      {children}
    </>
  );
};

export default ProtectedRoute;