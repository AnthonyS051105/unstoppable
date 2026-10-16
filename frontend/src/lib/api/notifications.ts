// Notification inbox and preferences (API_CONTRACT §18).
import { api, apiPaged } from "@/lib/api-client";
import type { AppNotification, NotificationPreferences, PageMeta } from "@/types/api";

type Page = { data: AppNotification[]; meta?: PageMeta };

export const notificationsApi = {
  // Contract §18: data is the array and meta sits beside it. The backend currently nests both
  // inside `data` ({ data: { data, meta } }); accept either until that is fixed.
  list: async (page = 1): Promise<Page> => {
    const res = await apiPaged<AppNotification[] | Page>(`/notifications?page=${page}`);
    return Array.isArray(res.data) ? { data: res.data, meta: res.meta } : res.data;
  },
  read: (id: string) => api<unknown>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
  readAll: () => api<unknown>("/notifications/read-all", { method: "POST" }),
  preferences: () => api<NotificationPreferences>("/users/me/notification-preferences"),
  savePreferences: (prefs: NotificationPreferences) =>
    api<NotificationPreferences>("/users/me/notification-preferences", { method: "PUT", body: JSON.stringify(prefs) }),
};
