import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { PrivacyScreen } from "@/screens/account";

export const metadata: Metadata = { title: screenTitle("privacy") };

export default function Page() {
  return <PrivacyScreen />;
}
