import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { HomeScreen } from "@/screens/home";

export const metadata: Metadata = { title: screenTitle("home") };

export default function Page() {
  return <HomeScreen />;
}
