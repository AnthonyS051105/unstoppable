// Health Controller — returns the flat health snapshot defined in
// API_CONTRACT §16: { status, db, speech, uptimeSec, version }. Note this
// endpoint intentionally does NOT use the standard { success, data } envelope;
// the contract specifies a flat shape for quick pre-demo checks.
import { asyncHandler } from "../../shared/async-handler.js";
import { getHealthSnapshot } from "./health.service.js";

export const getHealth = asyncHandler(async (_req, res) => {
  const snapshot = await getHealthSnapshot();
  res.status(200).json(snapshot);
});
