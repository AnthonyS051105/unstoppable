import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { NotificationSettingsScreen } from "@/screens/account";

export const metadata: Metadata = { title: screenTitle("notification-settings") };

export default function Page() {
  return <NotificationSettingsScreen />;
}
