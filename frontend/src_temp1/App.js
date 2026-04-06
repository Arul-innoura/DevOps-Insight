import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Components
import Login from './auth/login';
import AdminDashboard from './dashboards/admin/AdminDashboard';
import DevOpsDashboard from './dashboards/devops/DevOpsDashboard';
import UserDashboard from './dashboards/user/UserDashboard';
import ProtectedRoute from './routes/ProtectedRoute';
import { RoleRedirect, Unauthorized } from './routes/roleRoutes';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Public login page */}
          <Route path="/login" element={<Login />} />

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
  );
}

export default App;
