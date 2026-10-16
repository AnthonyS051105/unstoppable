import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VerificationScreen } from "@/screens/mapper";

export const metadata: Metadata = { title: screenTitle("verification") };

export default function Page() {
  return <VerificationScreen />;
}
