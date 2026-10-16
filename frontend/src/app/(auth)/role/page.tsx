import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { RoleScreen } from "@/screens/auth";

export const metadata: Metadata = { title: screenTitle("role") };

export default function Page() {
  return <RoleScreen />;
}
