import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { StoredScreen } from "@/screens/account";

export const metadata: Metadata = { title: screenTitle("history") };

export default function Page() {
  return <StoredScreen kind="history" />;
}
