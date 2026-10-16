import type { Metadata } from "next";
import { Suspense } from "react";
import { screenTitle } from "@/lib/data";
import { PreviewScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("preview") };

export default function Page() {
  return (
    <Suspense>
      <PreviewScreen />
    </Suspense>
  );
}
