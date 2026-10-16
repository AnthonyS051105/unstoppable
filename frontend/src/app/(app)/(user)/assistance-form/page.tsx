import type { Metadata } from "next";
import { Suspense } from "react";
import { screenTitle } from "@/lib/data";
import { AssistanceFormScreen } from "@/screens/companion";

export const metadata: Metadata = { title: screenTitle("assistance-form") };

export default function Page() {
  return (
    <Suspense>
      <AssistanceFormScreen />
    </Suspense>
  );
}
