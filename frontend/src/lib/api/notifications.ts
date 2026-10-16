// Notification inbox and preferences (API_CONTRACT §18).
import { api, apiPaged } from "@/lib/api-client";
import type { AppNotification, NotificationPreferences } from "@/types/api";

export const notificationsApi = {
  list: (page = 1) => apiPaged<AppNotification[]>(`/notifications?page=${page}`),
  read: (id: string) => api<unknown>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
  readAll: () => api<unknown>("/notifications/read-all", { method: "POST" }),
  preferences: () => api<NotificationPreferences>("/users/me/notification-preferences"),
  savePreferences: (prefs: NotificationPreferences) =>
    api<NotificationPreferences>("/users/me/notification-preferences", { method: "PUT", body: JSON.stringify(prefs) }),
};
