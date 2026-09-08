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
type SandboxPostureReport = Omit<PostureReport, "confidence">;
const POSTURE_SANDBOX_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_POSTURE_SANDBOX === "true";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MIN_PHOTO_BYTES = 10 * 1024;
const MIN_PHOTO_WIDTH = 600;
const MIN_PHOTO_HEIGHT = 800;
const MAX_PHOTO_DIMENSION = 10_000;

const severityTone: Record<string, "success" | "warn" | "danger"> = {
  mild: "success",
  moderate: "warn",
  marked: "danger",
};

const sandboxCopy = {
  en: {
    description:
      "Internal UI sandbox only. No vision model is connected and uploaded photos are not analysed.",
    disabledTitle: "Posture sandbox is disabled",
    disabledDetail:
      "No posture-analysis service is available. Enable NEXT_PUBLIC_ENABLE_POSTURE_SANDBOX=true only for internal UI testing; never for clinical assessment.",
    warningTitle: "Sandbox — not a posture assessment",
    warningDetail:
      "Photos remain local previews. The sandbox uses only the selected view names and shows fixed sample cards; it does not inspect image pixels or patient posture.",
    showSample: "Show fixed sandbox sample",
    loading: "Loading fixed sample…",
    sampleNotice:
      "Fixed UI sample only — none of the findings below were derived from the uploaded photos. Do not copy them into a clinical record or use them to plan treatment.",
    sampleSummary: "Sample report (not image-derived)",
    fixedOutput: "Fixed content for interface testing",
    sampleView: "Fixed sample for this view label",
    sampleLabel: "sample",
    sampleFocus: "Sample focus-area cards — not recommendations",
  },
  fa: {
    description:
      "فقط محیط آزمایشی رابط کاربری است. هیچ مدل بینایی متصل نیست و عکس‌ها تحلیل نمی‌شوند.",
    disabledTitle: "محیط آزمایشی پاسچر غیرفعال است",
    disabledDetail:
      "سرویس تحلیل پاسچر وجود ندارد. متغیر NEXT_PUBLIC_ENABLE_POSTURE_SANDBOX=true فقط برای آزمون داخلی رابط فعال شود؛ نه برای ارزیابی بالینی.",
    warningTitle: "محیط آزمایشی — نه ارزیابی پاسچر",
    warningDetail:
      "عکس فقط به‌صورت پیش‌نمایش محلی نمایش داده می‌شود. خروجی صرفاً بر اساس نام نما، ثابت و نمونه است و پیکسل یا پاسچر بیمار را بررسی نمی‌کند.",
    showSample: "نمایش نمونه ثابت آزمایشی",
    loading: "در حال بارگذاری نمونه ثابت…",
    sampleNotice:
      "فقط نمونه رابط کاربری — هیچ‌یک از یافته‌های زیر از عکس استخراج نشده است. آن‌ها را وارد پرونده یا مبنای درمان نکنید.",
    sampleSummary: "گزارش نمونه (استخراج‌نشده از عکس)",
    fixedOutput: "محتوای ثابت برای آزمون رابط",
    sampleView: "نمونه ثابت برای برچسب این نما",
    sampleLabel: "نمونه",
    sampleFocus: "کارت‌های نمونه حوزه تمرکز — نه توصیه درمانی",
  },
  ar: {
    description:
      "بيئة اختبار داخلية للواجهة فقط. لا يوجد نموذج رؤية متصل ولا يتم تحليل الصور.",
    disabledTitle: "بيئة اختبار القوام معطلة",
    disabledDetail:
      "لا تتوفر خدمة لتحليل القوام. فعّل NEXT_PUBLIC_ENABLE_POSTURE_SANDBOX=true للاختبار الداخلي فقط، وليس للتقييم السريري.",
    warningTitle: "بيئة اختبار — وليست تقييماً للقوام",
    warningDetail:
      "الصور معاينة محلية فقط. تستخدم البيئة أسماء المناظر لعرض بطاقات ثابتة ولا تفحص البكسلات أو قوام المريض.",
    showSample: "عرض عينة ثابتة",
    loading: "جارٍ تحميل العينة الثابتة…",
    sampleNotice:
      "عينة واجهة ثابتة فقط — لم تُشتق النتائج أدناه من الصور. لا تنسخها إلى السجل السريري ولا تستخدمها للعلاج.",
    sampleSummary: "تقرير عينة غير مشتق من الصور",
    fixedOutput: "محتوى ثابت لاختبار الواجهة",
    sampleView: "عينة ثابتة لتسمية هذا المنظر",
    sampleLabel: "عينة",
    sampleFocus: "بطاقات مجالات تركيز نموذجية — وليست توصيات",
  },
} as const;

type PhotoValidationCopy = {
  invalidType: string;
  invalidSize: string;
  invalidDimensions: string;
  portraitRequired: string;
  decodeFailed: string;
  validating: string;
};

const photoValidationCopy: Record<"en" | "fa" | "ar", PhotoValidationCopy> = {
  en: {
    invalidType: "Choose a JPEG or PNG image.",
    invalidSize: "Image size must be between 10 KB and 8 MB.",
    invalidDimensions:
      "Image must be at least 600 × 800 px and no side may exceed 10,000 px.",
    portraitRequired: "Use a portrait-orientation, full-body photo.",
    decodeFailed: "The image could not be decoded. Choose another file.",
    validating: "Checking image quality…",
  },
  fa: {
    invalidType: "یک تصویر JPEG یا PNG انتخاب کنید.",
    invalidSize: "حجم تصویر باید بین ۱۰ کیلوبایت و ۸ مگابایت باشد.",
    invalidDimensions:
      "تصویر باید حداقل ۶۰۰ × ۸۰۰ پیکسل باشد و هیچ ضلع آن از ۱۰٬۰۰۰ پیکسل بیشتر نباشد.",
    portraitRequired: "از عکس تمام‌قد با جهت عمودی استفاده کنید.",
    decodeFailed: "تصویر قابل خواندن نیست؛ فایل دیگری انتخاب کنید.",
    validating: "در حال بررسی کیفیت تصویر…",
  },
  ar: {
    invalidType: "اختر صورة JPEG أو PNG.",
    invalidSize: "يجب أن يكون حجم الصورة بين 10 كيلوبايت و8 ميغابايت.",
    invalidDimensions:
      "يجب ألا تقل الصورة عن 600 × 800 بكسل وألا يتجاوز أي ضلع 10000 بكسل.",
    portraitRequired: "استخدم صورة كاملة للجسم بوضع عمودي.",
    decodeFailed: "تعذر فك الصورة. اختر ملفاً آخر.",
    validating: "جارٍ فحص جودة الصورة…",
  },
};

export default function PostureAnalysisPage() {
  const { t, locale, dir } = useLocale();
  const copy = sandboxCopy[locale];
  const [photos, setPhotos] = useState<Record<PostureView, string | null>>({
    front: null,
    side: null,
    back: null,
  });
  const [report, setReport] = useState<SandboxPostureReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploaded = views.filter((v) => photos[v]);

  async function analyze() {
    if (!POSTURE_SANDBOX_ENABLED) {
      setError(copy.disabledDetail);
      return;
    }
    if (uploaded.length === 0) {
      setError(t("posture.needPhoto"));
      return;
    }
    setError(null);
    setLoading(true);
    setReport(null);
    try {
      // This deliberately receives view labels only. It is a fixed UI sample,
      // not a placeholder that may be mistaken for image analysis.
      const result = await delay(buildPostureReport(uploaded, locale), 500);
      setReport({
        perView: result.perView,
        summary: result.summary,
        recommendations: result.recommendations,
      });
    } catch {
      setError("The fixed sandbox sample could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  if (!POSTURE_SANDBOX_ENABLED) {
    return (
      <div className="space-y-6">
        <PageIntro title={t("posture.title")} description={copy.description} />
        <Card className="border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)]">
          <CardBody className="flex items-start gap-3">
            <span className="mt-0.5 text-[var(--color-warn)]">
              <Icon name="shield" width={20} height={20} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-warn)]">
                {copy.disabledTitle}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                {copy.disabledDetail}
              </p>
            </div>
          </CardBody>
        </Card>
        <Disclaimer fa={dir === "rtl" && locale === "fa"} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro title={t("posture.title")} description={copy.description} />

      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border border-[var(--color-danger)]/35 bg-[var(--color-danger-soft)] px-5 py-4"
      >
        <span className="mt-0.5 text-[var(--color-danger)]">
          <Icon name="alert" width={20} height={20} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-danger)]">
            {copy.warningTitle}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
            {copy.warningDetail}
          </p>
        </div>
      </div>

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
            validationCopy={photoValidationCopy[locale]}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={analyze} disabled={loading}>
          <Icon name="sparkle" width={16} height={16} />
          {loading ? copy.loading : copy.showSample}
        </Button>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <p className="text-xs text-[var(--color-ink-faint)]">{t("posture.privacy")}</p>
      </div>

      {loading && (
        <Card>
          <Spinner label={copy.loading} />
        </Card>
      )}

      {report && !loading && (
        <div className="space-y-4">
          <p className="rounded-xl bg-[var(--color-accent-soft)]/50 px-4 py-3 text-xs leading-relaxed text-[var(--color-accent)]">
            {copy.sampleNotice}
          </p>

          {/* Summary */}
          <Card>
            <CardHeader
              title={copy.sampleSummary}
              subtitle={copy.fixedOutput}
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
                  subtitle={copy.sampleView}
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
                        <Badge tone={severityTone[f.severity]}>
                          {copy.sampleLabel}: {f.severity}
                        </Badge>
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
              title={copy.sampleFocus}
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
  validationCopy,
}: {
  label: string;
  dataUrl: string | null;
  onChange: (dataUrl: string | null) => void;
  t: (key: string) => string;
  validationCopy: PhotoValidationCopy;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setFileError(validationCopy.invalidType);
      return;
    }
    if (file.size < MIN_PHOTO_BYTES || file.size > MAX_PHOTO_BYTES) {
      setFileError(validationCopy.invalidSize);
      return;
    }

    setValidating(true);
    try {
      const { width, height } = await readImageDimensions(file);
      if (
        width < MIN_PHOTO_WIDTH ||
        height < MIN_PHOTO_HEIGHT ||
        width > MAX_PHOTO_DIMENSION ||
        height > MAX_PHOTO_DIMENSION
      ) {
        throw new PhotoValidationError(validationCopy.invalidDimensions);
      }
      if (width > height) {
        throw new PhotoValidationError(validationCopy.portraitRequired);
      }
      onChange(await readFileAsDataUrl(file));
    } catch (cause) {
      setFileError(
        cause instanceof PhotoValidationError
          ? cause.message
          : validationCopy.decodeFailed
      );
    } finally {
      setValidating(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <p className="text-sm font-semibold text-[var(--color-ink)]">{label}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={validating}
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
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="flex flex-col items-center gap-2 px-4 text-center text-xs text-[var(--color-ink-faint)]">
              <Icon name="plus" width={22} height={22} />
              {validating ? validationCopy.validating : t("posture.upload")}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFileError(null);
                onChange(null);
              }}
            >
              {t("posture.remove")}
            </Button>
          </div>
        )}
        {fileError && (
          <p role="alert" className="text-xs leading-relaxed text-[var(--color-danger)]">
            {fileError}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

class PhotoValidationError extends Error {}

async function readImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("decode failed"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read failed"));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
