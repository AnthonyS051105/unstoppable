import type { Metadata } from "next";
import { Landing } from "@/screens/landing";

export const metadata: Metadata = { title: { absolute: "Sampai dengan Selamat | Unstoppable" } };

export default function Page() {
  return <Landing />;
}
