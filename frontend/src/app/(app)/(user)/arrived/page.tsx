import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { ArrivedScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("arrived") };

export default function Page() {
  return <ArrivedScreen />;
}
