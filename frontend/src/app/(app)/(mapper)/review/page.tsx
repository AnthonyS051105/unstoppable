import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { ReviewScreen } from "@/screens/mapper";

export const metadata: Metadata = { title: screenTitle("review") };

export default function Page() {
  return <ReviewScreen />;
}
