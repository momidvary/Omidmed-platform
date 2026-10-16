import { Suspense } from "react";
import { Spinner } from "@/components/ui/Misc";
import { QuickVisitClient } from "./QuickVisitClient";

export default function QuickVisitPage() {
  return (
    <Suspense fallback={<Spinner label="…" />}>
      <QuickVisitClient />
    </Suspense>
  );
}
