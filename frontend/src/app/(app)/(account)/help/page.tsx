import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { HelpScreen } from "@/screens/account";

export const metadata: Metadata = { title: screenTitle("help") };

export default function Page() {
  return <HelpScreen />;
}
