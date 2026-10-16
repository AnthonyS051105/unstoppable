// B12b (§15.4) — kotak notifikasi. Semua akses prisma.notification di sini
// (controller tidak menyentuh prisma langsung). Kepemilikan dicek di service.
import { prisma } from "../../config/prisma.js";
import { getIo } from "../../realtime/index.js";
import { AppError } from "../../shared/errors.js";
import type { ListQueryInput } from "./notifications.schema.js";

const PAGE_SIZE = 20;

export type NotificationType = "session" | "companion" | "sos" | "community" | "trip";

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  url: true,
  payload: true,
  readAt: true,
  createdAt: true,
} as const;

export async function listMine(userId: string, { page }: ListQueryInput) {
  const skip = (page - 1) * PAGE_SIZE;
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: notificationSelect,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    items,
    unread,
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) },
  };
}

export async function markRead(userId: string, id: string) {
  // Kepemilikan lewat where: user lain tidak bisa menandai notifikasi orang lain.
  const { count } = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (count === 0) {
    // Tidak ditemukan (atau sudah dibaca / bukan milik user). Pastikan ada supaya 404 jelas.
    const exists = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
    if (!exists) throw new AppError("NOT_FOUND", "Notifikasi tidak ditemukan.", 404);
  }
  return { id, readAt: new Date() };
}

export async function markAllRead(userId: string) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: count };
}

export interface NotifyInboxInput {
  type: NotificationType;
  event: string; // nama event socket, mis. "session:stalled"
  title: string; // Bahasa Indonesia
  body: string;
  url?: string; // route frontend saat notifikasi dibuka
  payload?: object; // JANGAN memuat koordinat
}

// Pengganti notify() (B13) tanpa push: simpan ke kotak notifikasi + kirim lewat
// socket. Dibuat agar mudah dialihkan ke notify() saat Web Push (B13) selesai.
// Kegagalan satu notifikasi tidak boleh menjatuhkan request/job pemicunya.
export async function notifyInbox(userIds: string[], n: NotifyInboxInput): Promise<void> {
  const io = getIo();
  for (const userId of new Set(userIds)) {
    try {
      await prisma.notification.create({
        data: { userId, type: n.type, title: n.title, body: n.body, url: n.url ?? null, payload: n.payload ?? {} },
      });
      io.to(`user:${userId}`).emit(n.event, n.payload ?? {});
    } catch (err) {
      console.error(`[notifyInbox] gagal untuk ${n.event}:`, err instanceof Error ? err.message : err);
    }
  }
}
