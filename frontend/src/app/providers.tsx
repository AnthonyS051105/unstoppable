"use client";

import { RouteSync } from "@/components/shell/RouteSync";
import { DemoStateProvider } from "@/contexts/DemoStateContext";
import { UiProvider } from "@/contexts/UiContext";
import { VoiceProvider } from "@/contexts/VoiceContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DemoStateProvider>
      <UiProvider>
        <VoiceProvider>
          <RouteSync />
          {children}
        </VoiceProvider>
      </UiProvider>
    </DemoStateProvider>
  );
}
