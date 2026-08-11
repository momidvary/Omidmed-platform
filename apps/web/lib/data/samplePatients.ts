import type { Patient, ProgressEntry } from "@/lib/types";
import { localDateOffset } from "@/lib/utils";

/** yyyy-mm-dd for `daysAgo` days before today (local time). */
function dateAgo(daysAgo: number): string {
  return localDateOffset(-daysAgo);
}

/** Build demo progress entries from (daysAgo, pain, completed) triples. */
function entries(rows: [number, number, boolean][]): ProgressEntry[] {
  return rows.map(([daysAgo, painLevel, completed]) => ({
    date: dateAgo(daysAgo),
    painLevel,
    completed,
  }));
}

// Demo patients for the portal. Login with the national id (کد ملی).
export const samplePatients: Patient[] = [
  {
    id: "pt_reza",
    nationalId: "1234567890",
    nameFa: "رضا کریمی",
    age: 68,
    conditionFa: "توان‌بخشی بعد از تعویض مفصل زانوی چپ (هفته چهارم)",
    therapistNoteFa:
      "روند بهبود خوب است. تمرکز این هفته: افزایش خم‌شدن زانو و راه‌رفتن با کمترین کمک واکر.",
    weeklyTarget: 6,
    program: [
      { exerciseId: "ex_quad_sets", dosageFa: "۳ ست × ۱۰ تکرار — هر روز", daysPerWeek: 7 },
      { exerciseId: "ex_ankle_pumps", dosageFa: "۱۵ تکرار — هر ساعت در بیداری", daysPerWeek: 7 },
      { exerciseId: "ex_heel_slides", dosageFa: "۲ ست × ۱۰ تکرار — روزی دو بار", daysPerWeek: 7 },
      { exerciseId: "ex_wall_sit", dosageFa: "۳ نگه‌داشتن ۲۰ ثانیه‌ای — یک روز در میان", daysPerWeek: 3 },
    ],
    progress: entries([
      [13, 7, true], [12, 7, true], [11, 6, false], [10, 6, true],
      [9, 6, true], [8, 5, true], [7, 5, false], [6, 5, true],
      [5, 4, true], [4, 4, true], [3, 4, true], [2, 3, false],
      [1, 3, true],
    ]),
    tickets: [
      {
        id: "tk_demo_1",
        createdAt: new Date(Date.now() - 3 * 864e5).toISOString(),
        exerciseId: "ex_heel_slides",
        subject: "کشش پشت زانو",
        message: "موقع سُر دادن پاشنه، پشت زانوم کشش نسبتاً زیادی حس می‌کنم. طبیعیه؟",
        status: "answered",
        replies: [
          {
            id: "tr_demo_1",
            from: "therapist",
            content:
              "سلام رضا جان. کشش ملایم پشت زانو در این مرحله طبیعی است، به شرطی که بعد از تمرین ظرف چند دقیقه آرام شود. اگر دردِ تیز یا ورم بیشتر شد، دامنه را کمتر کنید و به من خبر دهید.",
            createdAt: new Date(Date.now() - 2 * 864e5).toISOString(),
          },
        ],
      },
    ],
  },
  {
    id: "pt_sara",
    nationalId: "0987654321",
    nameFa: "سارا احمدی",
    age: 42,
    conditionFa: "کمردرد مکانیکی مزمن با انتشار به باسن راست",
    therapistNoteFa:
      "هدف این ماه: بازگشت به کار نشسته بدون درد و شروع پیاده‌روی منظم ۲۰ دقیقه‌ای.",
    weeklyTarget: 5,
    program: [
      { exerciseId: "ex_curl_up", dosageFa: "۳ ست × ۸ تکرار — ۵ روز در هفته", daysPerWeek: 5 },
      { exerciseId: "ex_bird_dog", dosageFa: "۳ ست × ۸ تکرار هر سمت — ۵ روز در هفته", daysPerWeek: 5 },
      { exerciseId: "ex_glute_bridge", dosageFa: "۳ ست × ۱۲ تکرار — ۵ روز در هفته", daysPerWeek: 5 },
      { exerciseId: "ex_glute_med_sidelying", dosageFa: "۲ ست × ۱۲ تکرار هر سمت — ۳ روز در هفته", daysPerWeek: 3 },
    ],
    progress: entries([
      [13, 6, true], [12, 5, true], [11, 5, true], [10, 6, false],
      [9, 5, true], [8, 4, true], [7, 4, true], [6, 4, false],
      [5, 3, true], [4, 3, true], [3, 3, true], [2, 2, true],
      [1, 2, true],
    ]),
    tickets: [],
  },
];
