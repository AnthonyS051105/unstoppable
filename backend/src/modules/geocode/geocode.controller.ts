import { asyncHandler } from "../../shared/async-handler.js";
import { ok } from "../../shared/response.js";
import * as service from "./geocode.service.js";
import type { SearchQueryInput, ReverseQueryInput } from "./geocode.schema.js";

export const searchHandler = asyncHandler(async (req, res) => {
  const results = await service.search(req.query as unknown as SearchQueryInput);
  ok(res, results);
});

export const reverseHandler = asyncHandler(async (req, res) => {
  const result = await service.reverse(req.query as unknown as ReverseQueryInput);
  ok(res, result);
});
