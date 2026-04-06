import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Components
import Login from './auth/login';
import AdminDashboard from './dashboards/admin/AdminDashboard';
import DevOpsDashboard from './dashboards/devops/DevOpsDashboard';
import UserDashboard from './dashboards/user/UserDashboard';
import ManagerApprovalPage from './dashboards/ManagerApprovalPage';
import ProtectedRoute from './routes/ProtectedRoute';
import { RoleRedirect, Unauthorized } from './routes/roleRoutes';
import { ToastProvider } from './services/ToastNotification';

function App() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 992);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 992);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!isDesktop) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "2rem",
          textAlign: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#fff"
        }}
      >
        <div
          style={{
            width: 78,
            height: 78,
            borderRadius: "50%",
            border: "5px solid rgba(255,255,255,0.22)",
            borderTopColor: "#60a5fa",
            animation: "mobile-spin 1s linear infinite",
            marginBottom: "1rem"
          }}
        />
        <h2 style={{ margin: 0, fontSize: "1.4rem" }}>Desktop Only</h2>
        <p style={{ marginTop: "0.75rem", maxWidth: 420, opacity: 0.92 }}>
          This portal is optimized for desktop workflows. Please open it on a laptop or desktop browser.
        </p>
        <style>{`
          @keyframes mobile-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <ToastProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Public login page */}
            <Route path="/login" element={<Login />} />
            
            {/* Public manager approval page (no login required) */}
            <Route path="/manager-approval" element={<ManagerApprovalPage />} />

            {/* Root '/' path - Redirects based on role or login status */}
            <Route path="/" element={<RoleRedirect />} />

            {/* Protected Dashboard Routes */}
            <Route path="/admin" element={
              <ProtectedRoute requiredRole="Admin">
                <AdminDashboard />
              </ProtectedRoute>
            } />

              <Route path="/devops" element={
                <ProtectedRoute requiredRole="DevOps Team">
                  <DevOpsDashboard />
                </ProtectedRoute>
              } />

            <Route path="/user" element={
              <ProtectedRoute requiredRole="User">
                <UserDashboard />
              </ProtectedRoute>
            } />

            {/* Error and Unauthorized pages */}
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </ToastProvider>
  );
}

export default App;
