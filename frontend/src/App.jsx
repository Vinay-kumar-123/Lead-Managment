import React from 'react';
import AppRoutes from './routes/AppRoutes.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProviderAuthProvider } from './context/ProviderAuthContext.jsx';

export default function App() {
  return (
    <AuthProvider>
      <ProviderAuthProvider>
        <AppRoutes />
      </ProviderAuthProvider>
    </AuthProvider>
  );
}
