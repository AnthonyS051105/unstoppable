import { extractTravelPlan } from "./travel-plan.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/errors.js";

export interface GeoJsonPoint {
    type: 'Point';
    coordinates: [number, number];
}

export interface SendMessageDto {
    content: string;
    inputMode?: "text" | "voice";
}

export interface ConfirmConversationDto {
    destinationText?: string;
    destinationLocation?: GeoJsonPoint;
    plannedTime?: string;
    resultingSessionId?: string;
}

function assertValidPoint(point: GeoJsonPoint, fieldName: string): void {
    if (!point || point.type !== 'Point' || !Array.isArray(point.coordinates) || point.coordinates.length !== 2) {
        throw new AppError("VALIDATION_ERROR", `${fieldName} harus berupa GeoJSON Point [lng, lat].`, 400);
    }
    const [lng, lat] = point.coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new AppError("VALIDATION_ERROR", `Koordinat ${fieldName} harus angka valid dalam rentang [-180, 180] untuk longitude dan [-90, 90] untuk latitude.`, 400);
    }
}

async function resolveDestinationLocation(
    userId: string,
    query: string | null
): Promise<{
  matchedName: string | null;
  location: GeoJsonPoint | null;
  source: "preference" | "building" | "node" | null;
}>  {
    if (!query) return { matchedName: null, location: null, source: null };
    // Treat user/model text literally, not as SQL LIKE wildcards.
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;

    const prefRows = await prisma.$queryRaw<Array<{ place_name: string; geojson: GeoJsonPoint }>>`
    SELECT place_name, ST_AsGeoJSON(place_location)::jsonb AS geojson
    FROM user_place_preferences
    WHERE user_id = ${userId}::uuid AND place_name ILIKE ${pattern}
    ORDER BY visit_count DESC, last_visited_at DESC NULLS LAST
    LIMIT 1
  `;
  if (prefRows[0]) {
    return { matchedName: prefRows[0].place_name, location: prefRows[0].geojson, source: "preference" };
  }
  const buildingRows = await prisma.$queryRaw<Array<{ name: string; geojson: GeoJsonPoint }>>`
    SELECT name, ST_AsGeoJSON(location)::jsonb AS geojson
    FROM buildings
    WHERE name ILIKE ${pattern}
    ORDER BY accessibility_score DESC NULLS LAST
    LIMIT 1
  `;
  if (buildingRows[0]) {
    return { matchedName: buildingRows[0].name, location: buildingRows[0].geojson, source: "building" };
  }
  const nodeRows = await prisma.$queryRaw<Array<{ label: string; geojson: GeoJsonPoint }>>`
    SELECT COALESCE(name, node_type) AS label,
           ST_AsGeoJSON(location)::jsonb AS geojson
    FROM path_nodes
    WHERE status = 'approved' AND is_operational = TRUE AND name ILIKE ${pattern}
    LIMIT 1
  `;
  if (nodeRows[0]) {
    return { matchedName: nodeRows[0].label, location: nodeRows[0].geojson, source: "node" };
  }

  // Fallback for multi-word queries like "Klinik Timur" -> "[DEMO] Klinik Rehabilitasi Timur"
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9-]/g, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 4);
  if (tokens.length >= 2) {
    const tokenPatterns = tokens.map((t) => `%${t}%`);
    const tokenBuildingRows = await prisma.$queryRaw<Array<{ name: string; geojson: GeoJsonPoint }>>`
      SELECT name, ST_AsGeoJSON(location)::jsonb AS geojson
      FROM buildings
      WHERE name ILIKE ALL(${tokenPatterns})
      ORDER BY accessibility_score DESC NULLS LAST
      LIMIT 1
    `;
    if (tokenBuildingRows[0]) {
      return { matchedName: tokenBuildingRows[0].name, location: tokenBuildingRows[0].geojson, source: "building" };
    }
    const tokenNodeRows = await prisma.$queryRaw<Array<{ label: string; geojson: GeoJsonPoint }>>`
      SELECT COALESCE(name, node_type) AS label,
             ST_AsGeoJSON(location)::jsonb AS geojson
      FROM path_nodes
      WHERE status = 'approved' AND is_operational = TRUE AND name ILIKE ALL(${tokenPatterns})
      LIMIT 1
    `;
    if (tokenNodeRows[0]) {
      return { matchedName: tokenNodeRows[0].label, location: tokenNodeRows[0].geojson, source: "node" };
    }
  }

  return { matchedName: query, location: null, source: null };
}

export async function startConversation(userId: string) {
  return prisma.aiPlannerConversation.create({
    data: { userId, status: "active" },
  });
}

export async function sendMessage(conversationId: string, userId: string, dto: SendMessageDto) {
    const content = typeof dto?.content === "string" ? dto.content.trim() : "";
    if (!content || content.length > 4000) {
        throw new AppError("VALIDATION_ERROR", "Isi pesan wajib diisi, maksimal 4000 karakter.", 400);
    }
    const inputMode = dto.inputMode ?? "text";
    if (inputMode !== "text" && inputMode !== "voice") {
        throw new AppError("VALIDATION_ERROR", "inputMode harus 'text' atau 'voice'.", 400);
    }
    const conversation = await prisma.aiPlannerConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation) {
        throw new AppError("NOT_FOUND", "Percakapan AI Planner tidak ditemukan.", 404);
    }
    if (conversation.userId !== userId) {
        throw new AppError("FORBIDDEN", "Anda tidak berhak mengirim pesan di percakapan ini.", 403);
    }
    if (conversation.status !== "active") {
        throw new AppError("CONFLICT", `Percakapan sudah berstatus '${conversation.status}'.`, 409);
    }

    const history = await prisma.aiPlannerMessage.findMany({
        where: { conversationId }, orderBy: { createdAt: "desc" }, take: 8,
        select: { sender: true, content: true },
    });
    const extracted = await extractTravelPlan(content, history.reverse());
    const userMessage = await prisma.aiPlannerMessage.create({
        data: { conversationId, sender: "user", inputMode, content },
    });

    const resolved = await resolveDestinationLocation(userId, extracted.destinationQuery);
    const prevExtractions = await prisma.aiPlannerExtraction.count({ where: { conversationId } });
    const clarificationRounds = prevExtractions + (resolved.location ? 0 : 1);

    let extractionId: string;
    if (resolved.location) {
        const [lng, lat] = resolved.location.coordinates;
        const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO ai_planner_extractions (
            id, conversation_id, destination_text, destination_location,
            planned_time, context_notes, clarification_rounds
        ) VALUES (
            gen_random_uuid(),
            ${conversationId}::uuid,
            ${resolved.matchedName},
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${extracted.plannedTime},
            ${extracted.contextNotes},
            ${clarificationRounds}
        )
        RETURNING id
        `;
        const insertedId = rows[0]?.id;
        if (!insertedId) {
            throw new AppError("INTERNAL_ERROR", "Gagal menyimpan ekstraksi tujuan perjalanan.", 500);
        }
        extractionId = insertedId;
    } else {
        const created = await prisma.aiPlannerExtraction.create({
        data: {
            conversationId,
            destinationText: resolved.matchedName,
            plannedTime: extracted.plannedTime,
            contextNotes: extracted.contextNotes,
            clarificationRounds,
        },
        });
        extractionId = created.id;
    }

    let replyContent: string;
    if (resolved.location && resolved.matchedName) {
        const timePart = extracted.plannedTime
        ? ` · Waktu WIB: ${extracted.plannedTime.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })}`
        : "";
        const notePart = extracted.contextNotes ? ` (${extracted.contextNotes})` : "";
        replyContent = `Tujuan ditemukan: ${resolved.matchedName}${timePart}${notePart}. Periksa tujuan lalu konfirmasi untuk melihat pratinjau rute. Waktu ini adalah rencana, bukan jadwal transportasi.`;
    } else if (extracted.destinationQuery) {
        replyContent = `Lokasi "${extracted.destinationQuery}" belum ditemukan dalam data kami. Sebutkan nama yang lebih spesifik atau pilih tujuan secara manual.`;
    } else {
        replyContent = "Ke mana tujuan Anda? Sebutkan nama gedung atau tempat.";
    }
    const assistantMessage = await prisma.aiPlannerMessage.create({
        data: { conversationId, sender: "assistant", inputMode: "text", content: replyContent },
    });
    return {
        userMessage,
        assistantMessage,
        extraction: {
        id: extractionId,
        destinationText: resolved.matchedName,
        destinationLocation: resolved.location,
        matchSource: resolved.source,
        plannedTime: extracted.plannedTime,
        contextNotes: extracted.contextNotes,
        clarificationRounds,
        },
        readyToConfirm: Boolean(resolved.location),
    };
}

export async function getConversation(conversationId: string, userId: string) {
    const conversation = await prisma.aiPlannerConversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) {
        throw new AppError("NOT_FOUND", "Percakapan AI Planner tidak ditemukan.", 404);
    }
    if (conversation.userId !== userId) {
        throw new AppError("FORBIDDEN", "Anda tidak berhak melihat percakapan ini.", 403);
    }
    const extractions = await prisma.$queryRaw<
        Array<{
        id: string;
        destination_text: string | null;
        destination_location: GeoJsonPoint | null;
        planned_time: Date | null;
        context_notes: string | null;
        clarification_rounds: number;
        resulting_session_id: string | null;
        created_at: Date;
        }>
    >`
        SELECT id, destination_text,
            ST_AsGeoJSON(destination_location)::jsonb AS destination_location,
            planned_time, context_notes, clarification_rounds,
            resulting_session_id, created_at
        FROM ai_planner_extractions
        WHERE conversation_id = ${conversationId}::uuid
        ORDER BY created_at ASC
    `;
    return {
        ...conversation,
        extractions: extractions.map((e) => ({
        id: e.id,
        destinationText: e.destination_text,
        destinationLocation: e.destination_location,
        plannedTime: e.planned_time,
        contextNotes: e.context_notes,
        clarificationRounds: e.clarification_rounds,
        resultingSessionId: e.resulting_session_id,
        createdAt: e.created_at,
        })),
    };
}

export async function confirmConversation(
    conversationId: string,
    userId: string,
    dto: ConfirmConversationDto
    ) {
    if (dto.plannedTime && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(dto.plannedTime) || !Number.isFinite(Date.parse(dto.plannedTime)))) {
        throw new AppError("VALIDATION_ERROR", "plannedTime wajib berupa waktu ISO dengan zona waktu.", 400);
    }
    const detail = await getConversation(conversationId, userId);
    if (detail.status !== "active") throw new AppError("CONFLICT", "Percakapan sudah selesai.", 409);
    if (dto.resultingSessionId) {
        const ownedSession = await prisma.travelSession.findFirst({ where: { id: dto.resultingSessionId, userId } });
        if (!ownedSession) throw new AppError("FORBIDDEN", "Sesi perjalanan tidak tersedia untuk pengguna ini.", 403);
    }
    const latest = detail.extractions[detail.extractions.length - 1];
    const finalName = dto.destinationText?.trim() || latest?.destinationText;
    const finalLocation = dto.destinationLocation || latest?.destinationLocation || null;
    if (!finalName || !finalLocation) {
        throw new AppError(
        "VALIDATION_ERROR",
        "Nama dan lokasi tujuan wajib disediakan, baik lewat request maupun dari ekstraksi terakhir.",
        400,
        );
    }
    assertValidPoint(finalLocation, "destinationLocation");
    if (dto.resultingSessionId && latest) {
        await prisma.aiPlannerExtraction.update({
        where: { id: latest.id },
        data: { resultingSessionId: dto.resultingSessionId },
        });
    }
    const updatedConversation = await prisma.aiPlannerConversation.update({
        where: { id: conversationId },
        data: { status: "completed", completedAt: new Date() },
    });
    const existingPref = await prisma.userPlacePreference.findFirst({
        where: { userId, placeName: { equals: finalName, mode: "insensitive" } },
    });
    const [lng, lat] = finalLocation.coordinates;
    if (existingPref) {
        await prisma.$executeRaw`
        UPDATE user_place_preferences
        SET visit_count = visit_count + 1,
            last_visited_at = NOW(),
            place_location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        WHERE id = ${existingPref.id}::uuid
        `;
    } else {
        await prisma.$executeRaw`
        INSERT INTO user_place_preferences (id, user_id, place_name, place_location, visit_count, last_visited_at)
        VALUES (
            gen_random_uuid(),
            ${userId}::uuid,
            ${finalName},
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            1,
            NOW()
        )
        `;
    }
    return {
        conversation: updatedConversation,
        confirmedDestination: {
        destinationText: finalName,
        destinationLocation: finalLocation,
        plannedTime: dto.plannedTime ? new Date(dto.plannedTime) : latest?.plannedTime ?? null,
        },
    };
}

export async function getUserPlacePreferences(userId: string) {
    const rows = await prisma.$queryRaw<
        Array<{
        id: string;
        place_name: string;
        place_location: GeoJsonPoint;
        visit_count: number;
        last_visited_at: Date | null;
        }>
    >`
        SELECT id, place_name,
            ST_AsGeoJSON(place_location)::jsonb AS place_location,
            visit_count, last_visited_at
        FROM user_place_preferences
        WHERE user_id = ${userId}::uuid
        ORDER BY visit_count DESC, last_visited_at DESC NULLS LAST
        LIMIT 20
    `;
    return rows.map((r) => ({
        id: r.id,
        placeName: r.place_name,
        placeLocation: r.place_location,
        visitCount: r.visit_count,
        lastVisitedAt: r.last_visited_at,
    }));
}