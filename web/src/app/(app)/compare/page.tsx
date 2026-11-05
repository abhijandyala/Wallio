import { Suspense } from "react";
import { CompareFlow } from "@/components/compare/compare-flow";

export const metadata = { title: "Compare · Wallio" };

export default function ComparePage() {
  // CompareFlow reads ?view=results on the client, so the shell stays prerendered.
  return (
    <Suspense fallback={null}>
      <CompareFlow />
    </Suspense>
  );
}
