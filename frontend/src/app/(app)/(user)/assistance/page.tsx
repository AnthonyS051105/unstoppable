import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { AssistanceHubScreen } from "@/screens/companion";

export const metadata: Metadata = { title: screenTitle("assistance") };

export default function Page() {
  return <AssistanceHubScreen />;
}
