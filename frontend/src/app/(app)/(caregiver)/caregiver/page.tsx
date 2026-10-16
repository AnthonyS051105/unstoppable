import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { CaregiverScreen } from "@/screens/caregiver";

export const metadata: Metadata = { title: screenTitle("caregiver") };

export default function Page() {
  return <CaregiverScreen />;
}
