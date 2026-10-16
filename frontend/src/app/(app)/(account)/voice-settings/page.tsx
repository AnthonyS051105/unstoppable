import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VoiceSettingsScreen } from "@/screens/account";

export const metadata: Metadata = { title: screenTitle("voice-settings") };

export default function Page() {
  return <VoiceSettingsScreen />;
}
