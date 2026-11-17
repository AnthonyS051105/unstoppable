import { api, jsonBody } from "@/lib/api-client";
import type {
  MultimodalRecommendRequest,
  MultimodalRecommendationResponse,
} from "@/types/api";

export const transitDemoApi = {
  recommend: (payload: MultimodalRecommendRequest) =>
    api<MultimodalRecommendationResponse>("/transit-demo/recommend", jsonBody(payload)),

  fixture: () =>
    api<Record<string, unknown>>("/transit-demo/fixture"),
};
