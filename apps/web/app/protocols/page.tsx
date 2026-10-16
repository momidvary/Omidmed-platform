"use client";

import Link from "next/link";
import { hypothesisLabel, protocols } from "@/lib/clinical/protocols";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";
import { Badge } from "@/components/ui/Badge";
import { PageIntro } from "@/components/ui/Misc";
import { protocolText } from "./text";

const REGION_ORDER = ["low-back", "neck", "shoulder", "hip", "knee", "ankle-foot"] as const;

export default function ProtocolsPage() {
  const { locale } = useLocale();
  const t = useText(protocolText);
  const lang = locale === "fa" ? "fa" : "en";

  return (
    <div className="space-y-6">
      <PageIntro title={t.title} description={t.intro(protocols.length)} />
      <p role="note" className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]">
        <span className="font-semibold">{t.draft}. </span>{t.draftNote}
      </p>
      {REGION_ORDER.map((region) => {
        const list = protocols.filter((protocol) => protocol.region === region);
        if (list.length === 0) return null;
        return (
          <section key={region} aria-labelledby={`region-${region}`}>
            <h2 id={`region-${region}`} className="mb-3 text-base font-bold text-[var(--color-ink)]">
              {t.regionShort[region]}
            </h2>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((protocol) => (
                <li key={protocol.id}>
                  <Link
                    href={`/protocols/${protocol.id}`}
                    aria-label={t.open(protocol.title[lang])}
                    className="group flex h-full flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold text-[var(--color-ink)] group-hover:text-[var(--color-primary-strong)]">
                        {protocol.title[lang]}
                      </h3>
                      <Badge>{t.phases(protocol.phases.length)}</Badge>
                    </div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-[var(--color-ink-soft)]">{protocol.summary[lang]}</p>
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      {protocol.postOp && <Badge tone="warn">{t.postOpBadge}</Badge>}
                      {protocol.hypotheses.map((id) => (
                        <Badge key={id} tone="primary">{hypothesisLabel(id)?.[lang] ?? id}</Badge>
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
