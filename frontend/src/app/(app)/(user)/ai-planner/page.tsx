import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { AIPlannerScreen } from "@/screens/ai-planner";

export const metadata: Metadata = { title: screenTitle("ai-planner") };

export default function Page() {
  return <AIPlannerScreen />;
}
