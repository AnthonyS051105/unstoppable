import type { Metadata } from "next";
import { Suspense } from "react";
import { screenTitle } from "@/lib/data";
import { MonitorScreen } from "@/screens/caregiver";

export const metadata: Metadata = { title: screenTitle("monitor") };

export default function Page() {
  return (
    <Suspense>
      <MonitorScreen />
    </Suspense>
  );
}
