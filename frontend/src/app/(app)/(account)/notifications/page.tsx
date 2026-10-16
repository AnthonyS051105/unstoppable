import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { NotificationsScreen } from "@/screens/account";

export const metadata: Metadata = { title: screenTitle("notifications") };

export default function Page() {
  return <NotificationsScreen />;
}
