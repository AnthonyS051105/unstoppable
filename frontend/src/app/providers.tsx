"use client";

import { AuthSync } from "@/components/shell/AuthSync";
import { PushActions } from "@/components/shell/PushActions";
import { RouteSync } from "@/components/shell/RouteSync";
import { ActiveSessionProvider } from "@/contexts/ActiveSessionContext";
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
              <ActiveSessionProvider>
                <AuthSync />
                <RouteSync />
                <PushActions />
                {children}
              </ActiveSessionProvider>
            </VoiceProvider>
          </UiProvider>
        </DemoStateProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
