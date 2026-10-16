import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { AuthScreen } from "@/screens/auth";

export const metadata: Metadata = { title: screenTitle("register") };

export default function Page() {
  return <AuthScreen mode="register" />;
}
