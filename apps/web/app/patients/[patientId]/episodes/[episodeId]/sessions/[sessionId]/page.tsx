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

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ patientId: string; episodeId: string; sessionId: string }>;
}) {
  const { patientId, episodeId, sessionId } = use(params);
  const { t } = useLocale();
  const { session, loading: authLoading } = useAuth();
  const [episode, setEpisode] = useState<EpisodeRow | null>(null);
  const [row, setRow] = useState<SessionRow | null>(null);
  const [previous, setPrevious] = useState<SessionRow | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    if (isMockMode || authLoading || !session) return;
    getEpisode(episodeId).then((res) => {
      if (!res) {
        setState("error");
        return;
      }
      const found = res.sessions.find((s) => s.id === sessionId) ?? null;
      if (!found) {
        setState("error");
        return;
      }
      setEpisode(res.episode);
      setRow(found);
      const done = res.sessions
        .filter((s) => s.status === "completed" && s.id !== sessionId)
        .sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0));
      setPrevious(done[done.length - 1] ?? null);
      setState("ready");
    });
  }, [episodeId, sessionId, session, authLoading]);

  if (!isMockMode && !authLoading && !session) {
    return <PageState state="denied" t={t} />;
  }
  if (state !== "ready" || !episode || !row) {
    return <PageState state={state as Exclude<LoadState, "ready">} t={t} />;
  }
  return (
    <div className="space-y-5">
      <PageIntro title={`${t("se.date")} #${row.session_number ?? ""}`} description={episode.title ?? ""} />
      <SessionForm
        episode={episode}
        existing={row}
        previous={previous}
        backHref={`/patients/${patientId}/episodes/${episodeId}`}
      />
    </div>
  );
}
