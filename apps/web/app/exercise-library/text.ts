import type { PageText } from "@/lib/i18n/text";
import type { Difficulty, Stage } from "@/lib/types";

const en = {
  title: "Exercise Library",
  intro: (count: number) =>
    `${count} evidence-informed exercises with dosage, mistakes to watch for, and progression / regression options.`,
  search: "Search…",
  searchAria: "Search exercises",
  allRegions: "All regions",
  allGoals: "All goals",
  allDifficulties: "All difficulties",
  allStages: "All stages",
  difficulty: {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
  } as Record<Difficulty, string>,
  stage: {
    acute: "Acute",
    subacute: "Subacute",
    chronic: "Chronic",
    "post-op": "Post-op",
    "return-to-sport": "Return to sport",
  } as Record<Stage, string>,
  noMatchTitle: "No exercises match",
  noMatchBody: "Try removing a filter or using a broader search term.",
  clearFilters: "Clear all filters",
  howTo: "How to do it",
  setsReps: "Sets & reps",
  stages: "Stages",
  mistakes: "Common mistakes",
  whenToStop: "When to stop",
  progression: "Progression",
  regression: "Regression",
};

export const exerciseLibraryText: PageText<typeof en> = {
  en,
  fa: {
    title: "کتابخانه تمرین",
    intro: (count) =>
      `${count.toLocaleString("fa-IR")} تمرین مبتنی بر شواهد همراه با دوز، خطاهای رایج و گزینه‌های پیشرفت / پسرفت.`,
    search: "جستجو…",
    searchAria: "جستجوی تمرین",
    allRegions: "همه نواحی",
    allGoals: "همه اهداف",
    allDifficulties: "همه سطوح دشواری",
    allStages: "همه مراحل",
    difficulty: {
      beginner: "مبتدی",
      intermediate: "متوسط",
      advanced: "پیشرفته",
    },
    stage: {
      acute: "حاد",
      subacute: "تحت‌حاد",
      chronic: "مزمن",
      "post-op": "پس از جراحی",
      "return-to-sport": "بازگشت به ورزش",
    },
    noMatchTitle: "تمرینی پیدا نشد",
    noMatchBody: "یک فیلتر را بردارید یا عبارت جستجوی کلی‌تری امتحان کنید.",
    clearFilters: "پاک کردن همه فیلترها",
    howTo: "روش انجام",
    setsReps: "ست و تکرار",
    stages: "مراحل",
    mistakes: "خطاهای رایج",
    whenToStop: "چه زمانی متوقف شود",
    progression: "پیشرفت",
    regression: "پسرفت",
  },
};
