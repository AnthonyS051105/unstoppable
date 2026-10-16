import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { AssistanceRatingScreen } from "@/screens/companion";

export const metadata: Metadata = { title: screenTitle("assistance-rating") };

export default function Page() {
  return <AssistanceRatingScreen />;
}
