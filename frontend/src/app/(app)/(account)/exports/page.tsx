import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { ExportsScreen } from "@/screens/account";

export const metadata: Metadata = { title: screenTitle("exports") };

export default function Page() {
  return <ExportsScreen />;
}
