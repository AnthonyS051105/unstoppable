import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VolunteerScheduleScreen } from "@/screens/volunteer";

export const metadata: Metadata = { title: screenTitle("volunteer-schedule") };

export default function Page() {
  return <VolunteerScheduleScreen />;
}
