import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { PreviewScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("preview") };

export default function Page() {
  return <PreviewScreen />;
}
