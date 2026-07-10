import { Suspense } from "react";
import { CaseAnalysisClient } from "./CaseAnalysisClient";
import { Spinner } from "@/components/ui/Misc";

export default function CaseAnalysisPage() {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <CaseAnalysisClient />
    </Suspense>
  );
}
