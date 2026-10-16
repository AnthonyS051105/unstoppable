import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { LoadingScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("loading") };

export default function Page() {
  return <LoadingScreen />;
}
