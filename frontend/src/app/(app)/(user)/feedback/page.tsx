import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { FeedbackScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("feedback") };

export default function Page() {
  return <FeedbackScreen />;
}
