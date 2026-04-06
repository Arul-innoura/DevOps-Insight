import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// MSAL imports
import { PublicClientApplication, EventType } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./auth/authConfig";
import { TestAuthProvider } from "./auth/TestAuthContext";

const msalInstance = new PublicClientApplication(msalConfig);

// Add event callback to catch all MSAL events for debugging
msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS) {
        console.log("✅ Login successful!", event);
    }
    if (event.eventType === EventType.LOGIN_FAILURE || 
        event.eventType === EventType.ACQUIRE_TOKEN_FAILURE) {
        console.error("=== MSAL Event Error ===");
        console.error("Event Type:", event.eventType);
        console.error("Error:", event.error);
        console.error("========================");
    }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <TestAuthProvider>
        <App />
      </TestAuthProvider>
    </MsalProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
