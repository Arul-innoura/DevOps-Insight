import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./authConfig";

export const msalInstance = new PublicClientApplication(msalConfig);

let msalInitializationPromise = null;

export const initializeMsal = async () => {
    if (!msalInitializationPromise) {
        msalInitializationPromise = msalInstance.initialize();
    }
    await msalInitializationPromise;
    return msalInstance;
};
