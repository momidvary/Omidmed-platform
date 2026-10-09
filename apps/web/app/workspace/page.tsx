import { Suspense } from "react";
import { Spinner } from "@/components/ui/Misc";
import { WorkspaceClient } from "./WorkspaceClient";

export default function WorkspacePage() {
  return (
    <Suspense fallback={<Spinner label="…" />}>
      <WorkspaceClient />
    </Suspense>
  );
}
