/*
 * Professional dosage details for a prescribed exercise (migration 030).
 * Every field is optional; the bounds mirror the database constraint and
 * the draft RPC, which remain the authority.
 */

export const LOAD_TYPES = ["bodyweight", "band", "free_weight", "machine", "assisted", "other"] as const;
export type LoadType = (typeof LOAD_TYPES)[number];
export const SIDES = ["both", "left", "right", "alternating"] as const;
export type Side = (typeof SIDES)[number];
export const TEMPO_PATTERN = /^[0-9X]{1,2}(-[0-9X]{1,2}){1,3}$/;

export interface DosageDetails {
  holdSeconds?: number;
  restSeconds?: number;
  loadType?: LoadType;
  loadDetail?: string;
  targetRpe?: number;
  painLimit?: number;
  tempo?: string;
  side?: Side;
  timesPerDay?: number;
  clinicianNote?: string;
}

export const DOSAGE_KEYS = [
  "holdSeconds", "restSeconds", "loadType", "loadDetail", "targetRpe",
  "painLimit", "tempo", "side", "timesPerDay", "clinicianNote",
] as const satisfies readonly (keyof DosageDetails)[];

const toLatinDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function cleanText(value: string | undefined): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : undefined;
}

export function normalizeTempo(value: string | undefined): string | undefined {
  const text = cleanText(value);
  return text ? toLatinDigits(text).toUpperCase().replace(/\s*[-–/]\s*/g, "-") : undefined;
}

/** Normalized details for the RPC; empty values are dropped. */
export function dosagePayload(details: DosageDetails): DosageDetails {
  const out: DosageDetails = {};
  const ints = ["holdSeconds", "restSeconds", "targetRpe", "painLimit", "timesPerDay"] as const;
  for (const key of ints) {
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  if (details.loadType) out.loadType = details.loadType;
  const loadDetail = cleanText(details.loadDetail);
  if (loadDetail && details.loadType) out.loadDetail = loadDetail;
  const tempo = normalizeTempo(details.tempo);
  if (tempo) out.tempo = tempo;
  if (details.side) out.side = details.side;
  const note = cleanText(details.clinicianNote);
  if (note) out.clinicianNote = note;
  return out;
}

export type DosageError =
  | "holdSeconds" | "restSeconds" | "targetRpe" | "painLimit" | "timesPerDay"
  | "loadDetail" | "tempo" | "clinicianNote";

/** First invalid field, or null. */
export function validateDosage(details: DosageDetails): DosageError | null {
  const int = (value: number | undefined, min: number, max: number) =>
    value === undefined || (Number.isInteger(value) && value >= min && value <= max);
  if (!int(details.holdSeconds, 1, 300)) return "holdSeconds";
  if (!int(details.restSeconds, 0, 600)) return "restSeconds";
  if (!int(details.targetRpe, 1, 10)) return "targetRpe";
  if (!int(details.painLimit, 0, 10)) return "painLimit";
  if (!int(details.timesPerDay, 1, 12)) return "timesPerDay";
  const loadDetail = cleanText(details.loadDetail);
  if (loadDetail && (!details.loadType || loadDetail.length > 80)) return "loadDetail";
  const tempo = normalizeTempo(details.tempo);
  if (tempo && !TEMPO_PATTERN.test(tempo)) return "tempo";
  if ((cleanText(details.clinicianNote)?.length ?? 0) > 300) return "clinicianNote";
  return null;
}

/* ── Readable summary ───────────────────────────────────────────── */

type Lang = "fa" | "en";

const loadLabels: Record<Lang, Record<LoadType, string>> = {
  fa: { bodyweight: "وزن بدن", band: "کش", free_weight: "وزنه آزاد", machine: "دستگاه", assisted: "با کمک", other: "وسیله" },
  en: { bodyweight: "Bodyweight", band: "Band", free_weight: "Free weight", machine: "Machine", assisted: "Assisted", other: "Equipment" },
};
const sideLabels: Record<Lang, Record<Side, string>> = {
  fa: { both: "هر دو طرف", left: "فقط سمت چپ", right: "فقط سمت راست", alternating: "یک‌درمیان چپ و راست" },
  en: { both: "Both sides", left: "Left side only", right: "Right side only", alternating: "Alternate sides" },
};

export function loadTypeLabel(type: LoadType, lang: Lang): string {
  return loadLabels[lang][type];
}
export function sideLabel(side: Side, lang: Lang): string {
  return sideLabels[lang][side];
}

export interface DosageTargets {
  targetSets?: number;
  targetReps?: number;
  targetDurationSeconds?: number;
}

/**
 * Short, patient-readable dosage lines, e.g.
 * "۳ ست × ۱۰ تکرار", "۵ ثانیه نگه‌داشتن", "کش · قرمز", "درد حین تمرین حداکثر ۳ از ۱۰".
 */
export function describeDosage(item: DosageTargets & DosageDetails, lang: Lang): string[] {
  const n = (value: number) => (lang === "fa" ? value.toLocaleString("fa-IR") : String(value));
  const fa = lang === "fa";
  const lines: string[] = [];
  if (item.targetSets && item.targetReps) {
    lines.push(fa ? `${n(item.targetSets)} ست × ${n(item.targetReps)} تکرار` : `${item.targetSets} sets × ${item.targetReps} reps`);
  } else if (item.targetDurationSeconds) {
    lines.push(fa ? `${n(item.targetDurationSeconds)} ثانیه در مجموع` : `${item.targetDurationSeconds} s in total`);
  }
  if (item.holdSeconds) lines.push(fa ? `${n(item.holdSeconds)} ثانیه نگه‌داشتن در هر تکرار` : `hold ${item.holdSeconds} s each rep`);
  if (item.loadType) {
    const label = loadLabels[lang][item.loadType];
    lines.push(item.loadDetail ? `${label} · ${item.loadDetail}` : label);
  }
  if (item.side) lines.push(sideLabels[lang][item.side]);
  // Standard tempo notation (e.g. 3-1-X), kept left-to-right inside Persian text.
  if (item.tempo) lines.push(fa ? `ریتم \u2066${item.tempo}\u2069` : `tempo ${item.tempo}`);
  if (item.restSeconds !== undefined) lines.push(fa ? `استراحت بین ست‌ها ${n(item.restSeconds)} ثانیه` : `rest ${item.restSeconds} s between sets`);
  if (item.targetRpe) lines.push(fa ? `شدت تلاش ${n(item.targetRpe)} از ۱۰` : `effort RPE ${item.targetRpe}/10`);
  if (item.painLimit !== undefined) lines.push(fa ? `درد حین تمرین حداکثر ${n(item.painLimit)} از ۱۰` : `pain during exercise ≤ ${item.painLimit}/10`);
  if (item.timesPerDay && item.timesPerDay > 1) lines.push(fa ? `${n(item.timesPerDay)} بار در روز` : `${item.timesPerDay}× per day`);
  return lines;
}

/** Map database columns (snake_case) to details. */
export function dosageFromRow(row: Record<string, unknown>): DosageDetails {
  const num = (key: string) => (typeof row[key] === "number" ? (row[key] as number) : undefined);
  const str = (key: string) => (typeof row[key] === "string" && row[key] ? (row[key] as string) : undefined);
  return {
    holdSeconds: num("hold_seconds"),
    restSeconds: num("rest_seconds"),
    loadType: str("load_type") as LoadType | undefined,
    loadDetail: str("load_detail"),
    targetRpe: num("target_rpe"),
    painLimit: num("pain_limit"),
    tempo: str("tempo"),
    side: str("side") as Side | undefined,
    timesPerDay: num("times_per_day"),
    clinicianNote: str("clinician_note"),
  };
}

export const DOSAGE_COLUMNS =
  "hold_seconds, rest_seconds, load_type, load_detail, target_rpe, pain_limit, tempo, side, times_per_day, clinician_note";
