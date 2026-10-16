import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { CommunitiesScreen } from "@/screens/places";

export const metadata: Metadata = { title: screenTitle("communities") };

export default function Page() {
  return <CommunitiesScreen />;
}
