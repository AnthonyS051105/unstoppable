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
} from "./companions.schema.js";

const parseId = (req: Request) => idParamSchema.parse(req.params).id;

const emitTo = (userId: string, event: string, payload: object) =>
  getIo().to(`user:${userId}`).emit(event, payload);

export const createRequestHandler = asyncHandler(async (req, res) => {
  created(res, await service.createRequest(req.user!.id, req.body as CreateRequestInput));
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
  const { volunteer, scheduledStart, caregiverIds } = await service.selectVolunteer(
    req.user!.id,
    requestId,
    offerId,
  );

  // §15.3 companion:confirmed -- payload { requestId, volunteer, scheduledStart }
  // ke relawan terpilih + caregiver tertaut requester (kontrak = sumber
  // kebenaran). Requester juga menerima konfirmasi di room-nya sendiri. Event
  // non-standar companion:selected/not_selected dihapus; hanya event kontrak
  // yang dipakai (Task 10 -- ikuti kontrak §15.3).
  const confirmedPayload = { requestId, volunteer, scheduledStart };
  const recipients = new Set<string>([volunteer.id, req.user!.id, ...caregiverIds]);
  recipients.forEach((id) => emitTo(id, "companion:confirmed", confirmedPayload));

  ok(res, { requestId, status: "confirmed", selectedVolunteer: volunteer });
});

export const checkinHandler = asyncHandler(async (req, res) => {
  created(res, await service.checkin(req.user!.id, parseId(req), req.body as CheckinInput));
});

export const cancelHandler = asyncHandler(async (req, res) => {
  ok(res, await service.cancel(req.user!.id, parseId(req), (req.body as CancelInput).reason));
});
