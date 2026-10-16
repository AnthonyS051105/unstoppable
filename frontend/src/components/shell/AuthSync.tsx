"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoStateContext";
import { choicesFromTolerance } from "@/lib/api/users";
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

  return null;
}
