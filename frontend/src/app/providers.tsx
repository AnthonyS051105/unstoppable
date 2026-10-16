"use client";

import { AuthSync } from "@/components/shell/AuthSync";
import { RouteSync } from "@/components/shell/RouteSync";
import { AuthProvider } from "@/contexts/AuthContext";
import { DemoStateProvider } from "@/contexts/DemoStateContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { UiProvider } from "@/contexts/UiContext";
import { VoiceProvider } from "@/contexts/VoiceContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SocketProvider>
        <DemoStateProvider>
          <UiProvider>
            <VoiceProvider>
              <AuthSync />
              <RouteSync />
              {children}
            </VoiceProvider>
          </UiProvider>
        </DemoStateProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
