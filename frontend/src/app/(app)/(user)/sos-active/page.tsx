import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { SosActiveScreen } from "@/screens/sos";

export const metadata: Metadata = { title: screenTitle("sos-active") };

export default function Page() {
  return <SosActiveScreen />;
}
