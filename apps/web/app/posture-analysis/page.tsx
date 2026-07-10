"use client";

import { useRef, useState } from "react";
import {
  buildPostureReport,
  delay,
  type PostureReport,
  type PostureView,
} from "@/lib/ai/engine";
import { useLocale } from "@/lib/store/LocaleContext";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, PageIntro, Spinner } from "@/components/ui/Misc";
import { cn } from "@/lib/utils";

const views: PostureView[] = ["front", "side", "back"];

const severityTone: Record<string, "success" | "warn" | "danger"> = {
  mild: "success",
  moderate: "warn",
  marked: "danger",
};

export default function PostureAnalysisPage() {
  const { t, locale, dir } = useLocale();
  const [photos, setPhotos] = useState<Record<PostureView, string | null>>({
    front: null,
    side: null,
    back: null,
  });
  const [report, setReport] = useState<PostureReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploaded = views.filter((v) => photos[v]);

  async function analyze() {
    if (uploaded.length === 0) {
      setError(t("posture.needPhoto"));
      return;
    }
    setError(null);
    setLoading(true);
    setReport(null);
    // 🔌 REAL AI API INTEGRATION POINT — replace with a server-side
    // vision AI call sending the photos (see lib/ai/engine.ts).
    const result = await delay(buildPostureReport(uploaded, locale), 1200);
    setReport(result);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <PageIntro title={t("posture.title")} description={t("posture.description")} />

      {/* Photo slots */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {views.map((view) => (
          <PhotoSlot
            key={view}
            label={t(`posture.view.${view}`)}
            dataUrl={photos[view]}
            onChange={(dataUrl) => {
              setPhotos((prev) => ({ ...prev, [view]: dataUrl }));
              setError(null);
              setReport(null);
            }}
            t={t}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={analyze} disabled={loading}>
          <Icon name="sparkle" width={16} height={16} />
          {loading ? t("posture.analyzing") : t("posture.analyze")}
        </Button>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <p className="text-xs text-[var(--color-ink-faint)]">{t("posture.privacy")}</p>
      </div>

      {loading && (
        <Card>
          <Spinner label={t("posture.analyzing")} />
        </Card>
      )}

      {report && !loading && (
        <div className="space-y-4">
          <p className="rounded-xl bg-[var(--color-accent-soft)]/50 px-4 py-3 text-xs leading-relaxed text-[var(--color-accent)]">
            {t("posture.demo")}
          </p>

          {/* Summary */}
          <Card>
            <CardHeader
              title={t("posture.summary")}
              subtitle={`${Math.round(report.confidence * 100)}% ${t("posture.confidence")}`}
              icon={<Icon name="sparkle" width={18} height={18} />}
            />
            <CardBody>
              <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
                {report.summary}
              </p>
            </CardBody>
          </Card>

          {/* Per-view findings */}
          <div
            className={cn(
              "grid grid-cols-1 gap-4",
              report.perView.length > 1 && "lg:grid-cols-2"
            )}
          >
            {report.perView.map(({ view, findings }) => (
              <Card key={view}>
                <CardHeader
                  title={t(`posture.view.${view}`)}
                  icon={<Icon name="user" width={18} height={18} />}
                />
                <CardBody className="space-y-3">
                  {findings.map((f) => (
                    <div
                      key={f.title}
                      className="rounded-xl border border-[var(--color-border)] p-3"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <h4 className="text-[13px] font-semibold text-[var(--color-ink)]">
                          {f.title}
                        </h4>
                        <Badge tone={severityTone[f.severity]}>{f.severity}</Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
                        {f.detail}
                      </p>
                    </div>
                  ))}
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Recommendations */}
          <Card className="border-[var(--color-primary)]/40 bg-[var(--color-primary-tint)]">
            <CardHeader
              title={t("posture.recommendations")}
              icon={<Icon name="treatment" width={18} height={18} />}
            />
            <CardBody>
              <ul className="space-y-2">
                {report.recommendations.map((r) => (
                  <li
                    key={r}
                    className="flex gap-2.5 text-sm text-[var(--color-ink-soft)]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      <Disclaimer fa={dir === "rtl" && locale === "fa"} />
    </div>
  );
}

function PhotoSlot({
  label,
  dataUrl,
  onChange,
  t,
}: {
  label: string;
  dataUrl: string | null;
  onChange: (dataUrl: string | null) => void;
  t: (key: string) => string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file || !["image/png", "image/jpeg"].includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <p className="text-sm font-semibold text-[var(--color-ink)]">{label}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "grid h-52 w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed transition-colors",
            dataUrl
              ? "border-transparent"
              : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
          )}
        >
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt={label}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex flex-col items-center gap-2 px-4 text-center text-xs text-[var(--color-ink-faint)]">
              <Icon name="plus" width={22} height={22} />
              {t("posture.upload")}
              <span className="text-[10px]">{t("posture.hint")}</span>
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {dataUrl && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              {t("posture.change")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              {t("posture.remove")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
