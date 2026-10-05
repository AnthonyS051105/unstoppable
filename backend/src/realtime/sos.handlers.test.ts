// Unit test MURNI (vitest, tanpa DB) untuk payload sos:new (§15.3). Fokusnya
// bentuk payload yang dikirim ke tiap relawan: distanceM harus per-relawan dan
// user: {id,name} ikut terkirim -- itulah yang diminta kontrak §15.3.
import { describe, it, expect, vi } from "vitest";
import type { Server } from "socket.io";
import { broadcastSosNew, type SosNewBasePayload, type SosNewRecipient } from "./sos.handlers.js";

// `io` palsu minimal: to(room) mengembalikan objek ber-emit, kita rekam
// (room, event, payload) tiap panggilan supaya bisa diperiksa.
function fakeIo() {
  const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emissions.push({ room, event, payload });
        },
      };
    },
  } as unknown as Server;
  return { io, emissions };
}

describe("broadcastSosNew (§15.3)", () => {
  const base: SosNewBasePayload = {
    sosId: "sos-1",
    user: { id: "user-1", name: "Budi" },
    coordinates: [110.37, -7.76],
    triggerType: "manual_button",
  };

  it("mengirim sos:new ke room user:{volunteerId} tiap relawan dengan distanceM masing-masing", () => {
    const { io, emissions } = fakeIo();
    const recipients: SosNewRecipient[] = [
      { volunteerId: "vol-a", distanceM: 320 },
      { volunteerId: "vol-b", distanceM: 980 },
    ];

    broadcastSosNew(io, recipients, base);

    expect(emissions).toHaveLength(2);
    expect(emissions[0]).toEqual({
      room: "user:vol-a",
      event: "sos:new",
      payload: { ...base, distanceM: 320 },
    });
    expect(emissions[1]).toEqual({
      room: "user:vol-b",
      event: "sos:new",
      payload: { ...base, distanceM: 980 },
    });
  });

  it("payload memuat semua field kontrak §15.3: sosId, user{id,name}, coordinates, distanceM, triggerType", () => {
    const { io, emissions } = fakeIo();
    broadcastSosNew(io, [{ volunteerId: "vol-a", distanceM: 100 }], base);

    const payload = emissions[0]!.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ["coordinates", "distanceM", "sosId", "triggerType", "user"].sort(),
    );
    expect(payload.user).toEqual({ id: "user-1", name: "Budi" });
    expect(payload.distanceM).toBe(100);
  });

  it("tanpa relawan -> tidak ada emisi", () => {
    const emitSpy = vi.fn();
    const io = { to: () => ({ emit: emitSpy }) } as unknown as Server;
    broadcastSosNew(io, [], base);
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
