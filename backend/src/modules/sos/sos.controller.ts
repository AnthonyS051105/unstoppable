import type { Request, Response } from "express";
import * as sosService from "./sos.service.js";
import { getIo } from "../../realtime/index.js";
import { broadcastSosTriggered } from "../../realtime/sos.handlers.js";

// TODO: ganti ke req.user.id begitu auth middleware (JWT) sudah ada.
// Sementara userId dikirim di body sebagai stand-in.

export async function trigger(req: Request, res: Response) {
  const { userId, sessionId, triggerType, lat, lng, audioRecordingUrl } = req.body;

  if (!userId || !triggerType || lat == null || lng == null) {
    return res.status(400).json({ error: "userId, triggerType, lat, lng wajib diisi" });
  }

  const incident = await sosService.triggerSos(userId, {
    sessionId, triggerType, lat, lng, audioRecordingUrl,
  });

  const caregiverIds = await sosService.getCaregiverIds(userId);
  broadcastSosTriggered(getIo(), caregiverIds, {
    incidentId: incident.id, userId, sessionId, triggerType, lat, lng,
  });

  // SOS tidak boleh gagal senyap — 201 tetap dikirim walau notifiedCaregivers 0,
  // frontend yang bertanggung jawab memberi tahu pengguna (CLAUDE.md §5.4).
  res.status(201).json({ id: incident.id, notifiedCaregivers: caregiverIds.length });
}

export async function cancel(req: Request, res: Response) {
  const id = req.params.id as string;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId wajib diisi" });
  }

  const affected = await sosService.cancelSos(id, userId);
  if (affected === 0) {
    return res.status(404).json({ error: "SOS tidak ditemukan atau sudah tidak aktif" });
  }

  res.json({ status: "cancelled" });
}

export async function respond(req: Request, res: Response) {
  const id = req.params.id as string;
  const { volunteerId, status } = req.body;

  if (!volunteerId || !status) {
    return res.status(400).json({ error: "volunteerId dan status wajib diisi" });
  }

  const response = await sosService.respondToSos(id, volunteerId, status);
  res.status(201).json(response);
}

export async function status(req: Request, res: Response) {
  const id = req.params.id as string;
  const incident = await sosService.getSosStatus(id);

  if (!incident) {
    return res.status(404).json({ error: "SOS tidak ditemukan" });
  }

  res.json(incident);
}
