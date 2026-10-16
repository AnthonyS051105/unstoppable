import webpush from "web-push";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { getIo } from "../realtime/index.js";

export type NotifyType = "session" | "companion" | "sos" | "community" | "trip";

export interface NotifyInput {
  type: NotifyType;
  event: string;
  title: string;
  body: string;
  url?: string;
  actions?: Array<{ action: string; title: string }>;
  payload: Record<string, unknown>;
  urgent?: boolean;
}

const preferenceTypes: Array<Exclude<NotifyType, "sos">> = [
  "companion",
  "session",
  "community",
  "trip",
];

function configurePush(): boolean {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function isNotificationEnabled(userId: string, type: NotifyType): Promise<boolean> {
  if (type === "sos") return true;

  const preference = await prisma.notificationPreference.findUnique({
    where: {
      userId_type: { userId, type },
    },
    select: { enabled: true },
  });

  return preference?.enabled ?? true;
}

async function sendPush(userId: string, notification: NotifyInput): Promise<void> {
  if (!configurePush()) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  const body = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.url,
    actions: notification.actions,
    data: notification.payload,
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          body,
          {
            TTL: notification.urgent ? 300 : 3600,
            urgency: notification.urgent ? "high" : "normal",
          },
        );

        await prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastSuccessAt: new Date() },
        });
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({
            where: { id: subscription.id },
          });
          return;
        }
        throw error;
      }
    }),
  );
}

/**
 * Satu pintu notifikasi: inbox, Socket.io, lalu Web Push.
 * Kegagalan delivery tidak menggagalkan request/job pemicu.
 */
export async function notify(userIds: string[], notification: NotifyInput): Promise<void> {
  for (const userId of new Set(userIds)) {
    try {
      const shouldSend =
        notification.type === "sos" ||
        notification.urgent === true ||
        (await isNotificationEnabled(userId, notification.type));
      if (!shouldSend) continue;

      await prisma.notification.create({
        data: {
          userId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          payload: notification.payload as Prisma.InputJsonValue,
          ...(notification.url !== undefined ? { url: notification.url } : {}),
        },
      });

      try {
        getIo().to(`user:${userId}`).emit(notification.event, notification.payload);
      } catch (error) {
        console.error(
          `[notify] socket gagal untuk ${notification.event}:`,
          error instanceof Error ? error.message : error,
        );
      }

      try {
        await sendPush(userId, notification);
      } catch (error) {
        console.error(
          `[notify] push gagal untuk ${notification.event}:`,
          error instanceof Error ? error.message : error,
        );
      }
    } catch (error) {
      console.error(
        `[notify] gagal menyimpan notifikasi ${notification.event}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

export function supportedPreferenceTypes(): typeof preferenceTypes {
  return preferenceTypes;
}
