import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { UnreachableScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("unreachable") };

export default function Page() {
  return <UnreachableScreen />;
}
