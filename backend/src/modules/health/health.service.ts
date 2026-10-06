// Health Service — lightweight liveness/readiness checks for /health (API_CONTRACT §16).
// Returns a flat snapshot: process status, DB connectivity, speech microservice
// reachability, process uptime, and app version. No auth; cheap and fast so it
// can be polled before a demo. Any dependency failure is reported as "down"
// rather than throwing — /health itself must never 500.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prisma } from "../../config/prisma.js";

const DB_PING_TIMEOUT_MS = 2000; // keep /health snappy even if DB hangs
const SPEECH_PING_TIMEOUT_MS = 2000; // short timeout — speech is optional for health

export type DependencyStatus = "ok" | "down";

export interface HealthSnapshot {
  status: "ok";
  db: DependencyStatus;
  speech: DependencyStatus;
  uptimeSec: number;
  version: string;
}

// Resolve package.json version once at module load (process-stable value).
function readAppVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // src/modules/health -> ../../../package.json (same depth at dist/ runtime).
    const pkgPath = join(here, "..", "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const APP_VERSION = readAppVersion();

// Lightweight DB probe: `SELECT 1` with a short timeout. Confirms Postgres is
// reachable without touching domain tables.
async function checkDb(): Promise<DependencyStatus> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db ping timeout")), DB_PING_TIMEOUT_MS),
      ),
    ]);
    return "ok";
  } catch {
    return "down";
  }
}

// Short-timeout ping to the voice/speech microservice's unauthenticated
// /healthz endpoint. If SPEECH_SERVICE_URL is unset or the service is
// unreachable, report "down" (never throw).
async function checkSpeech(): Promise<DependencyStatus> {
  const baseUrl = process.env.SPEECH_SERVICE_URL;
  if (!baseUrl) return "down";
  try {
    const res = await fetch(`${baseUrl}/healthz`, {
      method: "GET",
      signal: AbortSignal.timeout(SPEECH_PING_TIMEOUT_MS),
    });
    return res.ok ? "ok" : "down";
  } catch {
    return "down";
  }
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const [db, speech] = await Promise.all([checkDb(), checkSpeech()]);
  return {
    status: "ok",
    db,
    speech,
    uptimeSec: Math.floor(process.uptime()),
    version: APP_VERSION,
  };
}
