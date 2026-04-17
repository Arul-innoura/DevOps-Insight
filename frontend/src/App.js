import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Components
import Login from './auth/login';
import AdminDashboard from './dashboards/admin/AdminDashboard';
import DevOpsDashboard from './dashboards/devops/DevOpsDashboard';
import CostEstimateWindowPage from './dashboards/devops/CostEstimateWindowPage';
import UserDashboard from './dashboards/user/UserDashboard';
import ManagerApprovalPage from './dashboards/ManagerApprovalPage';
import ProtectedRoute from './routes/ProtectedRoute';
import { RoleRedirect, Unauthorized } from './routes/roleRoutes';
import NotFoundPage from './pages/NotFoundPage';
import { ToastProvider } from './services/ToastNotification';
import { ThemeProvider } from './services/ThemeContext';

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
          background: "#0f172a",
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
    <ThemeProvider>
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

              <Route path="/devops/cost-estimate" element={
                <ProtectedRoute requiredRole="DevOps Team">
                  <CostEstimateWindowPage />
                </ProtectedRoute>
              } />

              <Route path="/user" element={
                <ProtectedRoute requiredRole="User">
                  <UserDashboard />
                </ProtectedRoute>
              } />

              {/* Error and Unauthorized pages */}
              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </div>
        </Router>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
