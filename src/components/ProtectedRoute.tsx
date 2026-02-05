import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authApi } from '@/lib/api-client';
import { isAuthenticated, clearAuthData } from '@/lib/auth-utils';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Wrapper component that checks if user is authenticated before rendering children.
 * Redirects to /auth if not authenticated.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      if (!isAuthenticated()) {
        setIsAuth(false);
        setIsLoading(false);
        return;
      }

      try {
        // Verify token with backend
        await authApi.verify();
        setIsAuth(true);
      } catch (error) {
        // Token is invalid or expired
        console.error('Auth verification failed:', error);
        clearAuthData();
        setIsAuth(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuth) {
    // Redirect to auth page with return URL
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
