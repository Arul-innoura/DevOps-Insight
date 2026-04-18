import "./ensureTopLevelWindow";
import { skipReactBootstrap } from "./ensureTopLevelWindow";
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// MSAL imports
import { EventType } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance, initializeMsal } from "./auth/msalInstance";
import { resetSessionExpiryDispatchFlag } from "./services/sessionExpiry";

// Add event callback to catch all MSAL events for debugging
msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS) {
        console.log("✅ Login successful!", event);
        resetSessionExpiryDispatchFlag();
    }
    if (event.eventType === EventType.LOGIN_FAILURE || 
        event.eventType === EventType.ACQUIRE_TOKEN_FAILURE) {
        console.error("=== MSAL Event Error ===");
        console.error("Event Type:", event.eventType);
        console.error("Error:", event.error);
        console.error("========================");
    }
});

if (skipReactBootstrap) {
    // Cross-origin iframe: ensureTopLevelWindow rendered the fallback into #root; do not mount React.
} else {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    const renderApp = async () => {
        await initializeMsal();
        root.render(
            <React.StrictMode>
                <MsalProvider instance={msalInstance}>
                    <App />
                </MsalProvider>
            </React.StrictMode>
        );
    };
    renderApp().catch((error) => {
        console.error("Failed to initialize MSAL", error);
    });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
