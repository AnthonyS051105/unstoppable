import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { TripScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("trip") };

export default function Page() {
  return <TripScreen />;
}
