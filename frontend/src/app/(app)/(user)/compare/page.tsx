import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { CompareScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("compare") };

export default function Page() {
  return <CompareScreen />;
}
