import { FT_DEMO_ACCOUNTS, ftEmail } from "../../backend/prisma/ft-ugm-demo.fixture.js";
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/ft_demo") throw new Error("Reset only supports disposable localhost/ft_demo.");
const { prisma } = await import("../../backend/src/config/prisma.js");
try {
  const users = await prisma.user.findMany({ where: { email: { in: FT_DEMO_ACCOUNTS.map(a => ftEmail(a.key)) }, name: { startsWith: "[DEMO FT]" } }, select: { id: true } });
  const ids = users.map(u => u.id);
  if (ids.length !== 5) throw new Error("Expected the five dedicated demo identities.");
  const result = await prisma.$transaction(async tx => {
    const sessions = await tx.$executeRaw`UPDATE travel_sessions SET status='cancelled', ended_at=NOW(), ended_reason='user' WHERE user_id=ANY(${ids}::uuid[]) AND status='active'`;
    const sos = await tx.$executeRaw`UPDATE sos_incidents SET status='cancelled', resolved_at=NOW() WHERE user_id=ANY(${ids}::uuid[]) AND status IN ('active','responded')`;
    const reports = await tx.$executeRaw`UPDATE road_reports SET status='rejected' WHERE reporter_id=ANY(${ids}::uuid[]) AND description LIKE '[DEMO FT]%' AND status='active'`;
    const bookings = await tx.$executeRaw`UPDATE companion_requests SET status='cancelled', updated_at=NOW(), cancel_reason='[DEMO FT] Reset latihan' WHERE requester_id=ANY(${ids}::uuid[]) AND notes LIKE '[DEMO FT]%' AND status IN ('open','confirmed','invited','invite_declined','invite_expired')`;
    return { sessions,sos,reports,bookings };
  });
  console.log(JSON.stringify({ reset:"local demo runtime only",...result }));
} finally { await prisma.$disconnect(); }
