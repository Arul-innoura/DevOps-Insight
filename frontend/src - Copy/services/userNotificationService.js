import { apiRequest } from "./apiClient";

export const getMyNotificationPreferences = () =>
    apiRequest("/notification-preferences/me");

export const saveMyNotificationPreferences = (body) =>
    apiRequest("/notification-preferences/me", { method: "PUT", body: JSON.stringify(body) });
