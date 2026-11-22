import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useProviderAuth } from '../../context/ProviderAuthContext.jsx';

export default function ProviderProtectedRoute({ children, requireCompletedOnboarding = true }) {
  const { isAuthenticated, onboardingCompleted, isLoading } = useProviderAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-primary">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold text-text-muted">
          Verifying Dealsathi Provider Session...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/become-a-partner" state={{ from: location }} replace />;
  }

  if (requireCompletedOnboarding && !onboardingCompleted) {
    return <Navigate to="/become-a-partner?step=business-profile" replace />;
  }

  return children;
}
