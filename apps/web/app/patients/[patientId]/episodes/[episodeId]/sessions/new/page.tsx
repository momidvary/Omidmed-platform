"use client";

import { use, useEffect, useState } from "react";
import { useLocale } from "@/lib/store/LocaleContext";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import {
  getEpisode,
  type EpisodeRow,
  type SessionRow,
} from "@/lib/supabase/clinical";
import { PageState, type LoadState } from "@/components/patients/shared";
import { SessionForm } from "@/components/patients/SessionForm";
import { PageIntro } from "@/components/ui/Misc";

export default function NewSessionPage({
  params,
}: {
  params: Promise<{ patientId: string; episodeId: string }>;
}) {
  const { patientId, episodeId } = use(params);
  const { t } = useLocale();
  const { session, loading: authLoading } = useAuth();
  const [episode, setEpisode] = useState<EpisodeRow | null>(null);
  const [previous, setPrevious] = useState<SessionRow | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    if (isMockMode || authLoading || !session) return;
    getEpisode(episodeId).then((res) => {
      if (!res) {
        setState("error");
        return;
      }
      setEpisode(res.episode);
      const done = res.sessions
        .filter((s) => s.status === "completed")
        .sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0));
      setPrevious(done[done.length - 1] ?? null);
      setState("ready");
    });
  }, [episodeId, session, authLoading]);

  if (!isMockMode && !authLoading && !session) {
    return <PageState state="denied" t={t} />;
  }
  if (state !== "ready" || !episode) {
    return <PageState state={state as Exclude<LoadState, "ready">} t={t} />;
  }
  return (
    <div className="space-y-5">
      <PageIntro title={t("se.new")} description={episode.title ?? ""} />
      <SessionForm
        episode={episode}
        existing={null}
        previous={previous}
        backHref={`/patients/${patientId}/episodes/${episodeId}`}
      />
    </div>
  );
}
