import type { Metadata } from "next";
import { screenTitle } from "@/lib/data";
import { EditorScreen } from "@/screens/mapper";

export const metadata: Metadata = { title: screenTitle("editor") };

export default function Page() {
  return <EditorScreen />;
}
