// Unit test MURNI (vitest, tanpa DB) untuk payload report:nearby (§15.3):
// { reportId, coordinates, category, severity } ke room user:{id} tiap
// penerima.
import { describe, it, expect, vi } from "vitest";
import type { Server } from "socket.io";
import { broadcastReportNearby, type ReportNearbyPayload } from "./report.handlers.js";

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

describe("broadcastReportNearby (§15.3)", () => {
  const payload: ReportNearbyPayload = {
    reportId: "rep-1",
    coordinates: [110.37, -7.76],
    category: "terhalang",
    severity: "high",
  };

  it("mengirim report:nearby ke room user:{id} tiap penerima dengan payload kontrak", () => {
    const { io, emissions } = fakeIo();
    broadcastReportNearby(io, ["u1", "u2"], payload);

    expect(emissions).toEqual([
      { room: "user:u1", event: "report:nearby", payload },
      { room: "user:u2", event: "report:nearby", payload },
    ]);
    const keys = Object.keys(emissions[0]!.payload as object).sort();
    expect(keys).toEqual(["category", "coordinates", "reportId", "severity"].sort());
  });

  it("tanpa penerima -> tidak ada emisi", () => {
    const emitSpy = vi.fn();
    const io = { to: () => ({ emit: emitSpy }) } as unknown as Server;
    broadcastReportNearby(io, [], payload);
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
