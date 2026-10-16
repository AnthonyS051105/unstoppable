"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoStateContext";
import { isSeniorRole } from "@/lib/access";
import { choicesFromTolerance, listCaregivers } from "@/lib/api/users";
import type { ProfileId } from "@/lib/data";

// Mirrors the signed-in user (GET /users/me) into the DemoState fields screens
// already read (name, role, capabilities, profiles), so every screen shows server
// data without touching each reader. These keys are no longer persisted
// (lib/demo-state.ts SERVER_KEYS); AuthContext stays the source of truth.
export function AuthSync() {
  const { user } = useAuth();
  const { update } = useDemo();

  useEffect(() => {
    if (!user) {
      update({ syncedUserId: null });
      return;
    }
    const ordered = [...user.accessibilityProfiles].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    const primary = ordered[0];
    const vp = user.volunteerProfile;
    update({
      name: user.name,
      role: user.role,
      verified: vp?.verificationStatus === "verified",
      canCompanion: !!vp?.canCompanion,
      canMapData: !!vp?.canMapData,
      profiles: ordered.map((p) => p.profileId as ProfileId),
      ...choicesFromTolerance(primary?.toleranceOverrides),
      syncedUserId: user.id,
    });
  }, [user, update]);

  // Family link shown on Beranda / Keluarga / Privasi. Re-read whenever the user object
  // is reloaded (screens call refreshUser() after linking or unlinking).
  useEffect(() => {
    if (!user || !isSeniorRole(user)) return;
    let alive = true;
    listCaregivers()
      .then((links) => {
        if (!alive) return;
        const primary = links.find((l) => l.relationshipType === "primary") ?? links[0];
        update({
          caregiverLinkId: primary?.id ?? null,
          contactName: primary?.caregiver.name ?? "",
          contactPhone: primary?.caregiver.phoneNumber ?? "",
          sharing: primary?.locationSharingMode ?? "sos_only",
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, update]);

  return null;
}
