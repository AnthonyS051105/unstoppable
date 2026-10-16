import { z } from "zod";

export const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

export const notificationIdSchema = z.object({
  id: z.string().uuid(),
});

export const pushSubscriptionSchema = z
  .object({
    endpoint: z.string().url(),
    keys: z
      .object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      })
      .strict(),
    userAgent: z.string().max(500).optional(),
  })
  .strict();

export const deletePushSubscriptionSchema = z
  .object({
    endpoint: z.string().url(),
  })
  .strict();

export const notificationPreferencesSchema = z
  .object({
    companion: z.boolean(),
    session: z.boolean(),
    community: z.boolean(),
    trip: z.boolean(),
  })
  .strict();

export type NotificationsQueryInput = z.infer<typeof notificationsQuerySchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export type DeletePushSubscriptionInput = z.infer<typeof deletePushSubscriptionSchema>;
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
