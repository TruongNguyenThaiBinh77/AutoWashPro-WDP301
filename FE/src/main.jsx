import React from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './i18n/index';
import App from './App';
import AdminRoutes from './routes/AdminRoutes';
import ManagerRoutes from './routes/ManagerRoutes';
import ChatBot from './components/ChatBot';
import { ConfigProvider } from './hooks/useSystemConfig';
import './index.css';
import './styles.css';
import './overrides.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID}>
      <ConfigProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/admin/*" element={<AdminRoutes />} />
            <Route path="/manager/*" element={<ManagerRoutes />} />
            <Route path="/*" element={<App />} />
          </Routes>
        <ChatBot />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '12px',
              background: '#fff',
              color: '#1e293b',
              fontSize: '14px',
              fontWeight: 500,
              boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
              border: '1px solid #e2e8f0',
              padding: '10px 14px',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
      </ConfigProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
);
