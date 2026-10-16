import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { ReportConfirmScreen } from "@/screens/report";

export const metadata: Metadata = { title: screenTitle("report-confirm") };

export default function Page() {
  return <ReportConfirmScreen />;
}
