import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { SettingsScreen } from "@/screens/account";

export const metadata: Metadata = { title: screenTitle("settings") };

export default function Page() {
  return <SettingsScreen />;
}
