// BE-F-06-2 -- eskalasi SOS otomatis. Port dari backend/docs/SDD.md §6.2.
// State SELALU dari DB (sos_incidents.escalation_level), tidak ada counter di
// memori proses -- job berikutnya (atau instance proses lain) melanjutkan dari
// kondisi terakhir di DB (CLAUDE.local.md §5.6).
import { getIo } from "../realtime/index.js";
import { broadcastSosNew, broadcastSosUpdate } from "../realtime/sos.handlers.js";
import * as sosService from "../modules/sos/sos.service.js";

const LEVEL_THRESHOLDS_MIN = [2, 5, 10]; // level 0->1, 1->2, 2->3 (SDD §6.2)

function ageMinutes(createdAt: Date): number {
  return (Date.now() - createdAt.getTime()) / 60_000;
}

export async function escalateSos(): Promise<void> {
  const candidates = await sosService.getEscalationCandidates();
  const io = getIo();

  for (const candidate of candidates) {
    const threshold = LEVEL_THRESHOLDS_MIN[candidate.escalationLevel];
    if (threshold === undefined) continue; // sudah di level maksimum (3)
    if (ageMinutes(candidate.createdAt) < threshold) continue;

    const nextLevel = candidate.escalationLevel + 1;
    const bumped = await sosService.bumpEscalationLevel(candidate.id, candidate.escalationLevel, nextLevel);
    if (!bumped) continue; // sudah dinaikkan proses/run lain duluan -- aman diabaikan

    if (nextLevel === 1) {
      // Perluas radius pencarian relawan, kirim ulang sos:new ke kandidat baru.
      const volunteerIds = await sosService.findNearbyVolunteerIds(candidate.lng, candidate.lat);
      broadcastSosNew(io, volunteerIds, {
        sosId: candidate.id,
        user: { id: candidate.userId },
        coordinates: [candidate.lng, candidate.lat],
        triggerType: "escalated",
      });
    } else if (nextLevel === 2) {
      // Re-notifikasi caregiver (idempoten -- lihat sos.service.ts).
      const caregiverIds = await sosService.getCaregiverIds(candidate.userId);
      await sosService.recordCaregiverNotifications(candidate.id, caregiverIds);
    }
    // nextLevel === 3: tidak ada aksi data tambahan -- sinyal "tampilkan nomor
    // darurat" dikirim lewat broadcastSosUpdate di bawah untuk semua level,
    // klien yang menentukan tampilan UI berdasarkan escalationLevel (backend
    // tidak pernah menentukan teks UI, CLAUDE.md §1).

    const status = await sosService.getSosStatus(candidate.id);
    broadcastSosUpdate(io, candidate.userId, {
      sosId: candidate.id,
      status: status.status,
      escalationLevel: status.escalationLevel,
      responders: status.responders,
    });
  }
}
