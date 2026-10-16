import { AppError } from "../../shared/errors.js";
import { prisma } from "../../config/prisma.js";
import { supportedPreferenceTypes } from "../../shared/notify.js";
import type {
  DeletePushSubscriptionInput,
  NotificationPreferencesInput,
  NotificationsQueryInput,
  PushSubscriptionInput,
} from "./notifications.schema.js";

export async function listNotifications(
  userId: string,
  query: NotificationsQueryInput,
) {
  const { page, perPage } = query;
  const [total, data] = await prisma.$transaction([
    prisma.notification.count({ where: { userId } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  return {
    data,
    meta: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    throw new AppError("NOT_FOUND", "Notifikasi tidak ditemukan.", 404);
  }

  return { id: notificationId, read: true };
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return { markedCount: result.count };
}

export async function getPushPublicKey(): Promise<{ publicKey: string }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Notifikasi push belum dikonfigurasi.",
      500,
    );
  }
  return { publicKey };
}

export async function upsertPushSubscription(
  userId: string,
  input: PushSubscriptionInput,
) {
  const subscriptionData = {
    userId,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
  };

  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: subscriptionData,
    create: {
      endpoint: input.endpoint,
      ...subscriptionData,
    },
    select: { id: true, endpoint: true },
  });
}

export async function deletePushSubscription(
  userId: string,
  input: DeletePushSubscriptionInput,
) {
  const result = await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint: input.endpoint },
  });
  return { deleted: result.count > 0 };
}

export async function getNotificationPreferences(userId: string) {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
    select: { type: true, enabled: true },
  });
  const byType = new Map(rows.map((row) => [row.type, row.enabled]));

  return Object.fromEntries(
    supportedPreferenceTypes().map((type) => [type, byType.get(type) ?? true]),
  );
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferencesInput,
) {
  await prisma.$transaction(
    Object.entries(input).map(([type, enabled]) =>
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type } },
        update: { enabled },
        create: { userId, type, enabled },
      }),
    ),
  );

  return getNotificationPreferences(userId);
}
