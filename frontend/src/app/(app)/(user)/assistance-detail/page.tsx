import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { AssistanceDetailScreen } from "@/screens/companion";

export const metadata: Metadata = { title: screenTitle("assistance-detail") };

export default function Page() {
  return <AssistanceDetailScreen />;
}
