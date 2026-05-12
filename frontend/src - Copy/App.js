import React, { useEffect } from 'react';
import { requestNotificationPermission } from './services/pushNotificationService';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Components
import Login from './auth/login';
import AdminDashboard from './dashboards/admin/AdminDashboard';
import DevOpsDashboard from './dashboards/devops/DevOpsDashboard';
import CostEstimateWindowPage from './dashboards/devops/CostEstimateWindowPage';
import UserDashboard from './dashboards/user/UserDashboard';
import ManagerApprovalPage from './dashboards/ManagerApprovalPage';
import LiveBuildView from './dashboards/LiveBuildView';
import ProtectedRoute from './routes/ProtectedRoute';
import { RoleRedirect, Unauthorized } from './routes/roleRoutes';
import NotFoundPage from './pages/NotFoundPage';
import { ToastProvider } from './services/ToastNotification';
import { ThemeProvider } from './services/ThemeContext';

function App() {
  useEffect(() => {
    // Ask for browser notification permission after a short delay so the UI is visible first.
    const t = setTimeout(() => requestNotificationPermission(), 3000);
    return () => clearTimeout(t);
  }, []);

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

              {/* Live auto-build view — opened in a new tab from the trigger flow.
                  Any authenticated role (User / DevOps / Admin) can watch a build. */}
              <Route path="/build/:executionId" element={
                <ProtectedRoute>
                  <LiveBuildView />
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
