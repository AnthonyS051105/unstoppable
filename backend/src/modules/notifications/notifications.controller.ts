import { asyncHandler } from "../../shared/async-handler.js";
import { created, ok } from "../../shared/response.js";
import * as service from "./notifications.service.js";
import {
  deletePushSubscriptionSchema,
  notificationIdSchema,
  notificationPreferencesSchema,
  notificationsQuerySchema,
  pushSubscriptionSchema,
} from "./notifications.schema.js";

export const listHandler = asyncHandler(async (req, res) => {
  const query = notificationsQuerySchema.parse(req.query);
  ok(res, await service.listNotifications(req.user!.id, query));
});

export const markReadHandler = asyncHandler(async (req, res) => {
  const { id } = notificationIdSchema.parse(req.params);
  ok(res, await service.markNotificationRead(req.user!.id, id));
});

export const markAllReadHandler = asyncHandler(async (req, res) => {
  ok(res, await service.markAllNotificationsRead(req.user!.id));
});

export const publicKeyHandler = asyncHandler(async (_req, res) => {
  ok(res, await service.getPushPublicKey());
});

export const upsertSubscriptionHandler = asyncHandler(async (req, res) => {
  const input = pushSubscriptionSchema.parse(req.body);
  created(res, await service.upsertPushSubscription(req.user!.id, input));
});

export const deleteSubscriptionHandler = asyncHandler(async (req, res) => {
  const input = deletePushSubscriptionSchema.parse(req.body);
  ok(res, await service.deletePushSubscription(req.user!.id, input));
});

export const getPreferencesHandler = asyncHandler(async (req, res) => {
  ok(res, await service.getNotificationPreferences(req.user!.id));
});

export const updatePreferencesHandler = asyncHandler(async (req, res) => {
  const input = notificationPreferencesSchema.parse(req.body);
  ok(res, await service.updateNotificationPreferences(req.user!.id, input));
});
