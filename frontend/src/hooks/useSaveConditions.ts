"use client";

import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUi } from "@/contexts/UiContext";
import { accessibilitySelection, putAccessibility } from "@/lib/api/users";
import { errorMessage } from "@/lib/api-client";
import type { ProfileId } from "@/lib/data";

/** PUT /users/me/accessibility, then reload the user so every screen shows the saved conditions. */
export function useSaveConditions() {
  const { refreshUser } = useAuth();
  const { toast } = useUi();
  return useCallback(
    async (profiles: ProfileId[], stairs: string, slope: string) => {
      try {
        await putAccessibility(accessibilitySelection(profiles, stairs, slope));
        await refreshUser();
        return true;
      } catch (e) {
        toast(errorMessage(e));
        return false;
      }
    },
    [refreshUser, toast],
  );
}
