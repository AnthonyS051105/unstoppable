import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VolunteerRequestsScreen } from "@/screens/volunteer";

export const metadata: Metadata = { title: screenTitle("volunteer-requests") };

export default function Page() {
  return <VolunteerRequestsScreen />;
}
