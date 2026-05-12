import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./authConfig";

export const msalInstance = new PublicClientApplication(msalConfig);

let msalInitializationPromise = null;

export const initializeMsal = async () => {
    if (!msalInitializationPromise) {
        msalInitializationPromise = (async () => {
            await msalInstance.initialize();
            // Required after any redirect (login, token renew, logout return) or inProgress/auth state can stay wrong.
            await msalInstance.handleRedirectPromise();
        })();
    }
    await msalInitializationPromise;
    return msalInstance;
};
