import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { ReportScreen } from "@/screens/report";

export const metadata: Metadata = { title: screenTitle("report") };

export default function Page() {
  return <ReportScreen />;
}
