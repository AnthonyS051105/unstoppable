import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { MonitorScreen } from "@/screens/caregiver";

export const metadata: Metadata = { title: screenTitle("monitor") };

export default function Page() {
  return <MonitorScreen />;
}
