import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { MyReportsScreen } from "@/screens/report";

export const metadata: Metadata = { title: screenTitle("my-reports") };

export default function Page() {
  return <MyReportsScreen />;
}
