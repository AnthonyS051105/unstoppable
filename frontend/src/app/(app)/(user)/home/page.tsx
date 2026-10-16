import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { HomeScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("home") };

export default function Page() {
  return <HomeScreen />;
}
