import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { ServiceAreaScreen } from "@/screens/volunteer";

export const metadata: Metadata = { title: screenTitle("service-area") };

export default function Page() {
  return <ServiceAreaScreen />;
}
