import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { OtpScreen } from "@/screens/auth";

export const metadata: Metadata = { title: screenTitle("otp") };

export default function Page() {
  return <OtpScreen />;
}
