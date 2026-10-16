import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { ProfileScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("profile") };

export default function Page() {
  return <ProfileScreen />;
}
