import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { VolunteersScreen } from "@/screens/companion";

export const metadata: Metadata = { title: screenTitle("volunteer-offers") };

export default function Page() {
  return <VolunteersScreen offers />;
}
