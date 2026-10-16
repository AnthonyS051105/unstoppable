import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VolunteerPendingScreen } from "@/screens/volunteer";

export const metadata: Metadata = { title: screenTitle("volunteer-pending") };

export default function Page() {
  return <VolunteerPendingScreen />;
}
