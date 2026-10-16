import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { ReportSentScreen } from "@/screens/report";

export const metadata: Metadata = { title: screenTitle("report-sent") };

export default function Page() {
  return <ReportSentScreen />;
}
