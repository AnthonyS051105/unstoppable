import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { DashboardScreen } from "@/screens/volunteer";

export const metadata: Metadata = { title: screenTitle("dashboard") };

export default function Page() {
  return <DashboardScreen />;
}
