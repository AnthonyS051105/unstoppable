import type { Metadata } from "next";
import { Suspense } from "react";
import { screenTitle } from "@/lib/data";
import { PlaceScreen } from "@/screens/places";

export const metadata: Metadata = { title: screenTitle("place") };

export default function Page() {
  return (
    <Suspense>
      <PlaceScreen />
    </Suspense>
  );
}
