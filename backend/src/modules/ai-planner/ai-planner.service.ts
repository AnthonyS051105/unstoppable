import { GoogleGenAI } from "@google/genai";
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
        throw new AppError(400, "VALIDATION_ERROR", `${fieldName} has to be GeoJSON Point [lng, lat]`);
    }
    const [lng, lat] = point.coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new AppError(400, "VALIDATION_ERROR", `${fieldName} coordinates must be valid numbers in the range [-180, 180] for longitude and [-90, 90] for latitude`);
    }
}

type TravelPlan = {
    destinationQuery: string | null;
    plannedTimeHHMM: string | null;
    contextNotes: string | null;
};

async function extractLocationFromText(text: string): Promise<{
    destinationQuery: string | null;
    plannedTime: Date | null;
    contextNotes: string | null;
}> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new AppError("INTERNAL_ERROR", "GEMINI_API_KEY is not set in environment variables", 500);
    }

    const ai = new GoogleGenAI({ apiKey });

    const interaction = await ai.interactions.create({
        model: "gemini-3.5-flash-lite",
        input: `
                Ekstrak informasi rencana perjalanan dari kalimat berikut.
                Kalimat dapat ditulis dalam Bahasa Indonesia atau Bahasa Inggris.
                Aturan:
                1. destinationQuery adalah nama tempat atau gedung tujuan.
                2. Hapus kata depan/preposisi yang menunjukkan tujuan, seperti:
                - Bahasa Indonesia: "ke", "menuju"
                - Bahasa Inggris: "to", "towards"
                3. Jangan menerjemahkan nama tempat.
                4. plannedTimeHHMM adalah waktu keberangkatan dalam format 24-jam "HH:MM".
                5. Konversikan format seperti:
                - "jam 9 pagi" -> "09:00"
                - "9 AM" -> "09:00"
                - "jam 2 siang" -> "14:00"
                - "2:30 PM" -> "14:30"
                6. contextNotes berisi kondisi khusus seperti hujan, kursi roda,
                terburu-buru, atau kebutuhan khusus lainnya.
                7. Jika informasi tidak disebutkan, gunakan null.
                Kalimat:
                "${text}"
                `,
        response_format: {
            type: "text",
            mime_type: "application/json",
            schema: {
                type: "object",
                properties: {
                    destinationQuery: { type: ["string", "null"] },
                    plannedTimeHHMM: { type: ["string", "null"] },
                    contextNotes: { type: ["string", "null"] },
                },
                required: ["destinationQuery", "plannedTimeHHMM", "contextNotes"],
            },
        },
    });

    const parsed = JSON.parse(interaction.output_text ?? "{}") as TravelPlan;

    let plannedTime: Date | null = null;
    if (parsed.plannedTimeHHMM && /^\d{1,2}:\d{2}$/.test(parsed.plannedTimeHHMM)) {
        const [hh, mm] = parsed.plannedTimeHHMM.split(":").map(Number);
        if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
            const d = new Date();
            d.setHours(hh, mm, 0, 0);
            plannedTime = d;
        }
    }

    return {
        destinationQuery: parsed.destinationQuery?.trim() || null,
        plannedTime,
        contextNotes: parsed.contextNotes?.trim() || null,
    };
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
    const pattern = `%${query}%`;

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
    WHERE name ILIKE ${pattern}
    LIMIT 1
  `;
  if (nodeRows[0]) {
    return { matchedName: nodeRows[0].label, location: nodeRows[0].geojson, source: "node" };
  }
  return { matchedName: query, location: null, source: null };
}

export async function startConversation(userId: string) {
  return prisma.aiPlannerConversation.create({
    data: { userId, status: "active" },
  });
}

export async function sendMessage(conversationId: string, userId: string, dto: SendMessageDto) {
    const content = dto.content.trim();
    if (!content) {
        throw new AppError(400, "VALIDATION_ERROR", "Text content cannot be empty");
    }
    const inputMode = dto.inputMode ?? "text";
    if (inputMode !== "text" && inputMode !== "voice") {
        throw new AppError(400, "VALIDATION_ERROR", "inputMode must be 'text' or 'voice'");
    }
    const conversation = await prisma.aiPlannerConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation) {
        throw new AppError(404, "NOT_FOUND", "AI Planner conversation not found");
    }
    if (conversation.userId !== userId) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to send messages in this conversation");
    }
    if (conversation.status !== "active") {
        throw new AppError(409, "CONFLICT", `Conversation is already in status '${conversation.status}'`);
    }

    const userMessage = await prisma.aiPlannerMessage.create({
        data: { conversationId, sender: "user", inputMode, content },
    });

    const extracted = await extractLocationFromText(content);
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
        extractionId = rows[0].id;
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
        ? `Time: ${extracted.plannedTime.toTimeString().slice(0, 5)}`
        : "";
        const notePart = extracted.contextNotes ? ` (${extracted.contextNotes})` : "";
        replyContent = `Destination Found: ${resolved.matchedName}${timePart}${notePart}. Please confirm to calculate the accessible route.`;
    } else if (extracted.destinationQuery) {
        replyContent = `Location "${extracted.destinationQuery}" not found in our database. Please provide a more specific name or landmark.`;
    } else {
        replyContent = "Where do you want to go today?";
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
        throw new AppError(404, "NOT_FOUND", "AI Planner conversation not found");
    }
    if (conversation.userId !== userId) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to view this conversation");
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
    const detail = await getConversation(conversationId, userId);
    const latest = detail.extractions[detail.extractions.length - 1];
    const finalName = dto.destinationText?.trim() || latest?.destinationText;
    const finalLocation = dto.destinationLocation || latest?.destinationLocation || null;
    if (!finalName || !finalLocation) {
        throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Destination name and location must be provided either in the request or from the latest extraction"
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