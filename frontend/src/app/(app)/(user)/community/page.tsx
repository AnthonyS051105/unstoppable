import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { CommunityScreen } from "@/screens/places";

export const metadata: Metadata = { title: screenTitle("community") };

export default function Page() {
  return <CommunityScreen />;
}
