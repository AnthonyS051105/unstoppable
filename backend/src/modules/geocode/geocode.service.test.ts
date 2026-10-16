import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../shared/errors.js";
import {
  clearGeocodeCache,
  reverse,
  search,
  toGeocodeResult,
} from "./geocode.service.js";

const fetchMock = vi.fn();

beforeEach(() => {
  clearGeocodeCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GEOCODER_URL = "https://photon.test";
});

describe("geocode service", () => {
  it("maps Photon properties to GeoJSON in [lng, lat] order", () => {
    expect(
      toGeocodeResult({
        properties: {
          name: "Puskesmas Mergangsan",
          street: "Jalan Contoh",
          housenumber: "10",
          city: "Yogyakarta",
        },
        geometry: { coordinates: [110.3753, -7.8101] },
      }),
    ).toEqual({
      name: "Puskesmas Mergangsan",
      address: "Jalan Contoh 10, Yogyakarta",
      location: {
        type: "Point",
        coordinates: [110.3753, -7.8101],
      },
    });
  });

  it("caches identical searches", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: { name: "Puskesmas" },
            geometry: { coordinates: [110.3753, -7.8101] },
          },
        ],
      }),
    });

    const query = { q: "puskesmas", limit: 6 };
    await search(query);
    await search(query);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/?q=puskesmas");
  });

  it("returns the requested coordinates when reverse has no result", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await expect(reverse({ lng: 110.3753, lat: -7.8101 })).resolves.toEqual({
      name: "Lokasi pada peta",
      address: "-7.81010, 110.37530",
      location: {
        type: "Point",
        coordinates: [110.3753, -7.8101],
      },
    });
  });

  it("maps upstream failure to GEOCODER_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValue(new Error("upstream unavailable"));

    await expect(search({ q: "puskesmas", limit: 6 })).rejects.toMatchObject<Partial<AppError>>({
      code: "GEOCODER_UNAVAILABLE",
      httpStatus: 503,
    });
  });
});
