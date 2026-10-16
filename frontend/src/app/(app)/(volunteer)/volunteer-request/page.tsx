import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VolunteerRequestScreen } from "@/screens/volunteer";

export const metadata: Metadata = { title: screenTitle("volunteer-request") };

export default function Page() {
  return <VolunteerRequestScreen />;
}
