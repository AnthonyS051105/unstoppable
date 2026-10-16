import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { AssistanceStatusScreen } from "@/screens/companion";

export const metadata: Metadata = { title: screenTitle("assistance-status") };

export default function Page() {
  return <AssistanceStatusScreen />;
}
