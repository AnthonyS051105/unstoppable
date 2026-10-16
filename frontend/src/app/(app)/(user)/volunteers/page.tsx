import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VolunteersScreen } from "@/screens/companion";

export const metadata: Metadata = { title: screenTitle("volunteers") };

export default function Page() {
  return <VolunteersScreen />;
}
