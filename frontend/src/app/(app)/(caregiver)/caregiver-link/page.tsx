import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { CaregiverLinkScreen } from "@/screens/caregiver";

export const metadata: Metadata = { title: screenTitle("caregiver-link") };

export default function Page() {
  return <CaregiverLinkScreen />;
}
