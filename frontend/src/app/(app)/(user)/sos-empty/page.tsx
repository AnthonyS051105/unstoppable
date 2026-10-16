import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { SosEmptyScreen } from "@/screens/sos";

export const metadata: Metadata = { title: screenTitle("sos-empty") };

export default function Page() {
  return <SosEmptyScreen />;
}
