import { prisma } from "../config/prisma.js";
import { recordAuditLog } from "./auditLog.service.js";

export interface StartSessionParams {
  userId: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  routeCoordinates?: Array<{ lat: number; lng: number } | [number, number]>;
  estimatedArrival?: string | Date;
}

export interface LocationPingParams {
  sessionId: string;
  lat: number;
  lng: number;
}

export async function startSession(params: StartSessionParams) {
  const coords: [number, number][] =
    params.routeCoordinates && params.routeCoordinates.length >= 2
      ? params.routeCoordinates.map((c) => (Array.isArray(c) ? c : [c.lng, c.lat]))
      : [
          [params.origin.lng, params.origin.lat],
          [params.destination.lng, params.destination.lat],
        ];

  const lineGeoJson = JSON.stringify({
    type: "LineString",
    coordinates: coords,
  });
  // NOTE: Menggunakan "routeGeometry" (camelCase) menyesuaikan schema.prisma saat ini
  const [session] = await prisma.$queryRaw<
    {
      id: string;
      userId: string;
      status: string;
      startedAt: Date;
      estimatedArrival: Date | null;
    }[]
  >`
    INSERT INTO travel_sessions (
      id, user_id, origin, destination, "routeGeometry", estimated_arrival, status, started_at
    )
    VALUES (
      gen_random_uuid(),
      ${params.userId}::uuid,
      ST_SetSRID(ST_MakePoint(${params.origin.lng}, ${params.origin.lat}), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${params.destination.lng}, ${params.destination.lat}), 4326)::geography,
      ST_SetSRID(ST_GeomFromGeoJSON(${lineGeoJson}), 4326)::geography,
      ${params.estimatedArrival ? new Date(params.estimatedArrival) : null},
      'active',
      now()
    )
    RETURNING 
      id, 
      user_id AS "userId", 
      status, 
      started_at AS "startedAt", 
      estimated_arrival AS "estimatedArrival"
  `;

  return session;
}

export async function recordLocationPing(params: LocationPingParams) {
  const [ping] = await prisma.$queryRaw<
    { id: string; sessionId: string; recordedAt: Date }[]
  >`
    INSERT INTO location_pings (session_id, location, recorded_at)
    VALUES (
      ${params.sessionId}::uuid,
      ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
      now()
    )
    RETURNING id::text, session_id AS "sessionId", recorded_at AS "recordedAt"
  `;

  return ping;
}

export async function endSession(
  sessionId: string,
  userId: string,
  status: "completed" | "cancelled" = "completed",
  destinationName?: string
) {
  const affected = await prisma.$executeRaw`
    UPDATE travel_sessions
    SET status = ${status}, ended_at = now()
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid AND status = 'active'
  `;

  if (affected === 0) {
    return null;
  }
  // NOTE: Menggunakan "placeLocation" (camelCase) menyesuaikan schema.prisma saat ini
  if (status === "completed" && destinationName) {
    await prisma.$executeRaw`
      INSERT INTO user_place_preferences (id, user_id, place_name, "placeLocation", visit_count, last_visited_at)
      SELECT 
        gen_random_uuid(), 
        ${userId}::uuid, 
        ${destinationName}, 
        destination, 
        1, 
        now()
      FROM travel_sessions 
      WHERE id = ${sessionId}::uuid
      ON CONFLICT DO NOTHING
    `;
  }

  return { sessionId, status };
}

export async function getSessionSummary(sessionId: string, requesterId?: string) {
  const [session] = await prisma.$queryRaw<
    {
      id: string;
      userId: string;
      status: string;
      startedAt: Date;
      endedAt: Date | null;
      durationSeconds: number | null;
      originLat: number;
      originLng: number;
      destLat: number;
      destLng: number;
    }[]
  >`
    SELECT 
      id,
      user_id AS "userId",
      status,
      started_at AS "startedAt",
      ended_at AS "endedAt",
      ROUND(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)))::int AS "durationSeconds",
      ST_Y(origin::geometry) AS "originLat",
      ST_X(origin::geometry) AS "originLng",
      ST_Y(destination::geometry) AS "destLat",
      ST_X(destination::geometry) AS "destLng"
    FROM travel_sessions
    WHERE id = ${sessionId}::uuid
  `;

  if (!session) {
    return null;
  }

  const [distanceResult] = await prisma.$queryRaw<{ totalMeters: number; pingCount: number }[]>`
    SELECT 
      COALESCE(
        ROUND(
          ST_Length(
            ST_MakeLine(location::geometry ORDER BY recorded_at)::geography
          )
        ), 0
      )::int AS "totalMeters",
      COUNT(*)::int AS "pingCount"
    FROM location_pings
    WHERE session_id = ${sessionId}::uuid
  `;

  const sosIncidents = await prisma.sosIncident.findMany({
    where: { sessionId },
    select: {
      id: true,
      triggerType: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
    },
  });

  if (requesterId && requesterId !== session.userId) {
    await recordAuditLog({
      actorId: requesterId,
      action: "view_session_summary",
      targetUserId: session.userId,
    });
  }

  return {
    ...session,
    distanceMeters: distanceResult?.totalMeters ?? 0,
    pingCount: distanceResult?.pingCount ?? 0,
    sosIncidents,
  };
}