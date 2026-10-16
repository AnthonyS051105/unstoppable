import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { OnboardingScreen } from "@/screens/auth";

export const metadata: Metadata = { title: screenTitle("onboarding") };

export default function Page() {
  return <OnboardingScreen />;
}
