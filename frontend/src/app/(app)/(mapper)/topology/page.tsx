import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { TopologyScreen } from "@/screens/mapper";

export const metadata: Metadata = { title: screenTitle("topology") };

export default function Page() {
  return <TopologyScreen />;
}
