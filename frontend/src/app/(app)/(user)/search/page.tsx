import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { SearchScreen } from "@/screens/journey";

export const metadata: Metadata = { title: screenTitle("search") };

export default function Page() {
  return <SearchScreen />;
}
