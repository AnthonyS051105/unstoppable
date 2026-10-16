import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { AccountScreen } from "@/screens/account";

export const metadata: Metadata = { title: screenTitle("account") };

export default function Page() {
  return <AccountScreen />;
}
