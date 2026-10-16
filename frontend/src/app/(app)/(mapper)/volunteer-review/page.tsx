import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VolunteerReviewScreen } from "@/screens/mapper";

export const metadata: Metadata = { title: screenTitle("volunteer-review") };

export default function Page() {
  return <VolunteerReviewScreen />;
}
