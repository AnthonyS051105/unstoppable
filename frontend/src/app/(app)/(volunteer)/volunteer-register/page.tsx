import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VolunteerRegisterScreen } from "@/screens/volunteer";

export const metadata: Metadata = { title: screenTitle("volunteer-register") };

export default function Page() {
  return <VolunteerRegisterScreen />;
}
