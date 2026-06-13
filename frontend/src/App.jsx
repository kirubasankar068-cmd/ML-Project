import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Predictor from './pages/Predictor';
import BulkPredictor from './pages/BulkPredictor';
import Analytics from './pages/Analytics';
import Monitoring from './pages/Monitoring';
import SettingsPage from './pages/Settings';
import Login from './pages/Login';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      gcTime: 300000,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Check if token exists or dev bypass is enabled
    const token = localStorage.getItem('token');
    const devBypass = localStorage.getItem('dev_bypass') === 'true';
    
    if (token || devBypass) {
      setIsAuthenticated(true);
    }
    setCheckingAuth(false);
  }, []);

  if (checkingAuth) {
    return null; // or simple splash screen loader
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/prediction" element={<Predictor />} />
            <Route path="/bulk-predict" element={<BulkPredictor />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
