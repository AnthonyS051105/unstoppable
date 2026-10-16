import type { Request } from "express";
import { ok, created } from "../../shared/response.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { getIo } from "../../realtime/index.js";
import * as service from "./companions.service.js";
import {
  idParamSchema,
  type CreateRequestInput,
  type OpenQueryInput,
  type OfferInput,
  type SelectInput,
  type CheckinInput,
  type CancelInput,
  type RespondInput,
} from "./companions.schema.js";

const parseId = (req: Request) => idParamSchema.parse(req.params).id;

const emitTo = (userId: string, event: string, payload: object) =>
  getIo().to(`user:${userId}`).emit(event, payload);

export const createRequestHandler = asyncHandler(async (req, res) => {
  const request = await service.createRequest(req.user!.id, req.body as CreateRequestInput);
  if (request.status === "invited" && request.invitedVolunteerId) {
    // Caregiver belum diberi tahu (§12.1 langkah 3); mereka tahu saat konfirmasi.
    // Payload §15.3 v1.4.2: hanya requester.name, tanpa id/kontak pengguna.
    emitTo(request.invitedVolunteerId, "companion:invite", {
      requestId: request.id,
      requester: { name: request.requesterName },
      destinationName: request.destinationName,
      scheduledStart: request.scheduledStart,
      inviteExpiresAt: request.inviteExpiresAt,
    });
  }
  created(res, request);
});

export const respondHandler = asyncHandler(async (req, res) => {
  const requestId = parseId(req);
  const result = await service.respond(req.user!.id, requestId, req.body as RespondInput);
  if (result.status === "confirmed") {
    const payload = { requestId, volunteer: result.volunteer, scheduledStart: result.scheduledStart };
    new Set([result.volunteer.id, result.requesterId, ...result.caregiverIds]).forEach((id) =>
      emitTo(id, "companion:confirmed", payload),
    );
  } else {
    emitTo(result.requesterId, "companion:invite-declined", {
      requestId,
      volunteer: result.volunteer,
      reason: result.reason,
    });
  }
  ok(res, { requestId, status: result.status });
});

export const broadcastHandler = asyncHandler(async (req, res) => {
  ok(res, await service.broadcast(req.user!.id, parseId(req)));
});

export const listInvitesHandler = asyncHandler(async (req, res) => {
  ok(res, await service.listInvites(req.user!.id));
});

export const listMineHandler = asyncHandler(async (req, res) => {
  ok(res, await service.listMine(req.user!.id));
});

export const listOpenHandler = asyncHandler(async (req, res) => {
  ok(res, await service.listOpen(req.user!.id, req.query as unknown as OpenQueryInput));
});

export const offerHandler = asyncHandler(async (req, res) => {
  const requestId = parseId(req);
  const { requesterId, offer } = await service.createOffer(req.user!.id, requestId, req.body as OfferInput);
  emitTo(requesterId, "companion:offer", { requestId, offerId: offer.offerId, volunteer: offer.volunteer });
  created(res, offer);
});

export const listOffersHandler = asyncHandler(async (req, res) => {
  ok(res, await service.listOffers(req.user!.id, parseId(req)));
});

export const selectHandler = asyncHandler(async (req, res) => {
  const requestId = parseId(req);
  const { offerId } = req.body as SelectInput;
  const { volunteer, scheduledStart, caregiverIds, notSelectedVolunteerIds } = await service.selectVolunteer(
    req.user!.id,
    requestId,
    offerId,
  );

  // Semua event sesuai kontrak §12 & §15.3 (kontrak = sumber kebenaran).
  // - companion:confirmed  -> relawan terpilih + requester + caregiver tertaut
  //   (payload lengkap { requestId, volunteer, scheduledStart }).
  // - companion:selected   -> relawan terpilih (sinyal ringkas "kamu dipilih").
  // - companion:not_selected -> tiap relawan yang tidak terpilih (kontrak §12:
  //   "notifikasi ke ... relawan lain"), supaya FE bisa menutup tawaran mereka.
  const confirmedPayload = { requestId, volunteer, scheduledStart };
  const confirmedRecipients = new Set<string>([volunteer.id, req.user!.id, ...caregiverIds]);
  confirmedRecipients.forEach((id) => emitTo(id, "companion:confirmed", confirmedPayload));

  emitTo(volunteer.id, "companion:selected", { requestId, scheduledStart });
  for (const volunteerId of notSelectedVolunteerIds) {
    emitTo(volunteerId, "companion:not_selected", { requestId });
  }

  ok(res, { requestId, status: "confirmed", selectedVolunteer: volunteer });
});

export const checkinHandler = asyncHandler(async (req, res) => {
  created(res, await service.checkin(req.user!.id, parseId(req), req.body as CheckinInput));
});

export const cancelHandler = asyncHandler(async (req, res) => {
  ok(res, await service.cancel(req.user!.id, parseId(req), (req.body as CancelInput).reason));
});
