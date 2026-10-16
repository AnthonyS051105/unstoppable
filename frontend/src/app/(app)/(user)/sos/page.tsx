import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { SosScreen } from "@/screens/sos";

export const metadata: Metadata = { title: screenTitle("sos") };

export default function Page() {
  return <SosScreen />;
}
