import { HOOS, NPRS, OARSI_TESTS, ODI, PSFS, STARTBACK } from "@/lib/clinical/protocols/outcomes";
import { L, type Protocol } from "@/lib/clinical/protocols/types";

export const hipProtocols: Protocol[] = [
  {
    id: "hip_oa",
    region: "hip",
    hypotheses: ["h_oa"],
    title: L("Hip osteoarthritis", "آرتروز لگن (هیپ)"),
    summary: L(
      "Education, strengthening, mobility and aerobic exercise are first-line; manual therapy can be added for pain and mobility.",
      "آموزش، تقویت، تحرک و ورزش هوازی درمان خط اول است؛ برای درد و تحرک می‌توان درمان دستی را اضافه کرد."
    ),
    principles: [
      L("Exercise is recommended for everyone with hip OA, regardless of imaging.", "تمرین برای همه بیماران آرتروز لگن توصیه می‌شود، صرف‌نظر از تصویربرداری."),
      L("Combine strength, range of motion and walking or cycling.", "ترکیب تقویت، دامنه حرکتی و پیاده‌روی یا دوچرخه."),
    ],
    phases: [
      {
        id: "start",
        name: L("Education and mobility", "آموزش و تحرک"),
        typical: L("Usually 2–3 weeks", "معمولاً ۲ تا ۳ هفته"),
        goals: [L("Understand the condition and pacing", "شناخت عارضه و تنظیم فعالیت"), L("Improve hip range of motion", "بهبود دامنه حرکتی لگن")],
        exercises: ["ex_hip_mobility", "ex_hip_90_90", "ex_glute_bridge", "ex_glute_med_sidelying", "ex_walking_program"],
        other: [L("Manual therapy for pain and stiffness if helpful", "درمان دستی برای درد و خشکی در صورت اثربخشی"), L("Walking aid if needed", "وسیله کمکی راه رفتن در صورت نیاز")],
        progressWhen: [L("Exercise pain settles within 24 hours", "درد تمرین ظرف ۲۴ ساعت فروکش می‌کند")],
      },
      {
        id: "strength",
        name: L("Strength and function", "تقویت و عملکرد"),
        typical: L("Usually 6–12 weeks", "معمولاً ۶ تا ۱۲ هفته"),
        goals: [L("Hip abductor and extensor strength", "قدرت دورکننده‌ها و بازکننده‌های لگن"), L("Sit-to-stand and stairs", "برخاستن از صندلی و پله")],
        exercises: ["ex_sit_to_stand", "ex_step_up", "ex_glute_med_bridge", "ex_side_plank_knees", "ex_ankle_balance"],
        other: [],
        progressWhen: [L("Improved chair stand and walking tests", "بهبود آزمون‌های برخاستن از صندلی و راه رفتن")],
      },
      {
        id: "maintain",
        name: L("Self-management", "خودمدیریتی"),
        typical: L("Ongoing", "ادامه‌دار"),
        goals: [L("Independent exercise and activity", "تمرین و فعالیت مستقل")],
        exercises: ["ex_single_leg_bridge", "ex_monster_walk", "ex_walking_program"],
        other: [L("Cycling, swimming or community exercise", "دوچرخه، شنا یا ورزش گروهی")],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, HOOS, OARSI_TESTS],
    watchFor: [L("Night pain, fever or rapid loss of function", "درد شبانه، تب یا افت سریع عملکرد"), L("Groin pain on loading in a runner (exclude stress fracture)", "درد کشاله با بارگذاری در دونده (رد شکستگی استرسی)")],
    references: [
      "Cibulka MT, et al. Hip Pain and Mobility Deficits—Hip Osteoarthritis: Revision 2017. J Orthop Sports Phys Ther. 2017;47(6):A1–A37.",
      "Bannuru RR, et al. OARSI guidelines for the non-surgical management of knee, hip, and polyarticular osteoarthritis. Osteoarthritis Cartilage. 2019;27(11):1578–1589.",
    ],
  },
  {
    id: "gluteal_tendinopathy",
    region: "hip",
    hypotheses: ["h_gtps"],
    title: L("Gluteal tendinopathy", "تاندینوپاتی گلوتئال"),
    summary: L(
      "Education on avoiding tendon compression plus progressive abductor loading outperformed a corticosteroid injection and wait-and-see at one year.",
      "آموزش پرهیز از فشرده شدن تاندون همراه با بارگذاری پیشرونده دورکننده‌ها، در یک سال نتیجه بهتری از تزریق کورتون و انتظار داشت."
    ),
    principles: [
      L("Avoid compressive positions: crossing legs, hanging on one hip, lying on the painful side.", "پرهیز از وضعیت‌های فشاری: پا روی پا انداختن، ایستادن روی یک لگن، خوابیدن روی سمت دردناک."),
      L("Avoid stretching the iliotibial band and gluteals in hip adduction early on.", "در ابتدا از کشش نوار ایلیوتیبیال و گلوتئال‌ها در وضعیت نزدیک کردن ران خودداری شود."),
      L("Load progressively: isometric, then isotonic, then functional.", "بارگذاری پیشرونده: ایزومتریک، سپس ایزوتونیک و بعد عملکردی."),
    ],
    phases: [
      {
        id: "settle",
        name: L("Education and isometric loading", "آموزش و بارگذاری ایزومتریک"),
        typical: L("Usually 2–4 weeks", "معمولاً ۲ تا ۴ هفته"),
        goals: [L("Reduce compressive load", "کاهش بار فشاری"), L("Pain relief with isometric abduction", "کاهش درد با ابداکشن ایزومتریک")],
        exercises: ["ex_glute_bridge", "ex_glute_med_bridge", "ex_walking_program"],
        other: [L("Pillow between the knees when lying on the other side", "بالش بین زانوها هنگام خوابیدن روی سمت مقابل")],
        progressWhen: [L("Pain of 3/10 or less with daily tasks", "درد ۳ از ۱۰ یا کمتر در فعالیت‌های روزانه")],
      },
      {
        id: "strength",
        name: L("Progressive abductor strengthening", "تقویت پیشرونده دورکننده‌ها"),
        typical: L("Usually 6–8 weeks", "معمولاً ۶ تا ۸ هفته"),
        goals: [L("Abductor strength in standing and side-lying", "قدرت دورکننده‌ها در ایستاده و به پهلو")],
        exercises: ["ex_glute_med_sidelying", "ex_side_plank_knees", "ex_sit_to_stand", "ex_step_up", "ex_monster_walk"],
        other: [],
        progressWhen: [L("Single-leg stance 30 s without lateral hip pain", "ایستادن تک‌پا ۳۰ ثانیه بدون درد کنار لگن")],
      },
      {
        id: "function",
        name: L("Functional and sport loading", "بارگذاری عملکردی و ورزشی"),
        typical: L("Usually from week 8", "معمولاً از هفته ۸"),
        goals: [L("Stairs, hills and running as needed", "پله، سربالایی و دویدن به میزان لازم")],
        exercises: ["ex_single_leg_bridge", "ex_side_plank", "ex_single_leg_squat", "ex_balance_reach"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, PSFS],
    watchFor: [L("Severe night pain or swelling over the trochanter", "درد شدید شبانه یا ورم روی تروکانتر")],
    references: [
      "Mellor R, et al. Education plus exercise versus corticosteroid injection use versus a wait and see approach on global outcome and pain from gluteal tendinopathy: prospective, single blinded, randomised clinical trial. BMJ. 2018;361:k1662.",
      "Grimaldi A, et al. Gluteal Tendinopathy: A Review of Mechanisms, Assessment and Management. Sports Med. 2015;45(8):1107–1119.",
    ],
  },
  {
    id: "fai",
    region: "hip",
    hypotheses: ["h_fai"],
    title: L("FAI syndrome / hip-related pain", "سندرم گیرافتادگی فموروستابولار / درد مرتبط با لگن"),
    summary: L(
      "Physiotherapist-led treatment focusing on hip and trunk strength, movement control and activity modification for at least 3 months.",
      "درمان به رهبری فیزیوتراپیست با تمرکز بر قدرت لگن و تنه، کنترل حرکت و تعدیل فعالیت، دست‌کم به مدت ۳ ماه."
    ),
    principles: [
      L("Reduce provocative deep flexion with rotation while building strength.", "کاهش فلکشن عمیق همراه با چرخش که درد ایجاد می‌کند، هم‌زمان با افزایش قدرت."),
      L("Exercise therapy for at least 3 months before considering surgery.", "تمرین‌درمانی دست‌کم ۳ ماه پیش از بررسی جراحی."),
    ],
    phases: [
      {
        id: "control",
        name: L("Settle and control", "آرام کردن و کنترل"),
        typical: L("Usually 2–4 weeks", "معمولاً ۲ تا ۴ هفته"),
        goals: [L("Reduce provocation", "کاهش تحریک"), L("Trunk and gluteal activation", "فعال‌سازی تنه و گلوتئال")],
        exercises: ["ex_glute_bridge", "ex_glute_med_bridge", "ex_dead_bug", "ex_bird_dog"],
        other: [L("Modify deep sitting, squatting and pivoting", "تعدیل نشستن عمیق، اسکوات و چرخش")],
        progressWhen: [L("Daily tasks with little pain", "فعالیت‌های روزانه با درد کم")],
      },
      {
        id: "strength",
        name: L("Strength", "تقویت"),
        typical: L("Usually 6–12 weeks", "معمولاً ۶ تا ۱۲ هفته"),
        goals: [L("Hip abductor, extensor and adductor strength", "قدرت دورکننده، بازکننده و نزدیک‌کننده لگن")],
        exercises: ["ex_side_plank_knees", "ex_single_leg_bridge", "ex_monster_walk", "ex_split_squat", "ex_copenhagen_short"],
        other: [],
        progressWhen: [L("Single-leg tasks with good control", "فعالیت‌های تک‌پا با کنترل خوب")],
      },
      {
        id: "return",
        name: L("Return to sport", "بازگشت به ورزش"),
        typical: L("Usually from month 3", "معمولاً از ماه ۳"),
        goals: [L("Sport-specific movement within symptom limits", "حرکات ویژه ورزش در محدوده علائم")],
        exercises: ["ex_single_leg_squat", "ex_balance_reach", "ex_hop_progression"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, HOOS, PSFS],
    watchFor: [L("Mechanical locking or no improvement after 3 months: orthopaedic opinion", "قفل مکانیکی یا عدم بهبود پس از ۳ ماه: نظر ارتوپد")],
    references: [
      "Griffin DR, et al. The 2016 Warwick Agreement on femoroacetabular impingement syndrome (FAI syndrome): an international consensus statement. Br J Sports Med. 2016;50(19):1169–1176.",
      "Kemp JL, et al. Physiotherapist-led treatment for young to middle-aged active adults with hip-related pain: consensus recommendations from the International Hip-related Pain Research Network, Zurich 2018. Br J Sports Med. 2020;54(9):504–511.",
    ],
  },
];

export const lowBackProtocols: Protocol[] = [
  {
    id: "lbp_nonspecific",
    region: "low-back",
    hypotheses: ["lb_nonspecific", "lb_sij"],
    title: L("Non-specific low back pain", "کمردرد غیراختصاصی"),
    summary: L(
      "Reassurance and advice to stay active, exercise therapy matched to preference, and a stratified approach (for example STarT Back); manual therapy only alongside exercise.",
      "اطمینان‌بخشی و توصیه به فعال ماندن، تمرین‌درمانی متناسب با ترجیح بیمار و رویکرد طبقه‌بندی‌شده (مثلاً STarT Back)؛ درمان دستی فقط همراه تمرین."
    ),
    principles: [
      L("No single exercise type is clearly superior; choose what the patient will do.", "هیچ نوع تمرینی به‌وضوح برتر نیست؛ تمرینی را انتخاب کنید که بیمار انجام می‌دهد."),
      L("Avoid bed rest; encourage normal activity and work.", "پرهیز از استراحت در بستر؛ تشویق به فعالیت و کار عادی."),
      L("Address fear, beliefs and sleep where relevant (higher-risk patients).", "در بیماران پرخطر، به ترس، باورها و خواب پرداخته شود."),
    ],
    phases: [
      {
        id: "settle",
        name: L("Reassure and keep moving", "اطمینان‌بخشی و حفظ حرکت"),
        typical: L("Usually 1–2 weeks", "معمولاً ۱ تا ۲ هفته"),
        goals: [L("Reduce fear and pain", "کاهش ترس و درد"), L("Maintain daily activity", "حفظ فعالیت روزانه")],
        exercises: ["ex_pelvic_tilt", "ex_cat_camel", "ex_knee_to_chest", "ex_prone_press_up", "ex_walking_program"],
        other: [
          L("Choose movement direction by symptom response (flexion or extension)", "انتخاب جهت حرکت بر اساس پاسخ علائم (فلکشن یا اکستنشن)"),
          L("Manual therapy only as an adjunct to exercise", "درمان دستی فقط به‌عنوان مکمل تمرین"),
        ],
        progressWhen: [L("Can walk and sit for normal periods", "توانایی راه رفتن و نشستن به مدت معمول")],
      },
      {
        id: "strength",
        name: L("Graded exercise and conditioning", "تمرین تدریجی و آمادگی جسمانی"),
        typical: L("Usually 4–8 weeks", "معمولاً ۴ تا ۸ هفته"),
        goals: [L("Trunk endurance and confidence in movement", "استقامت تنه و اعتماد به حرکت")],
        exercises: ["ex_curl_up", "ex_bird_dog", "ex_side_plank_knees", "ex_dead_bug", "ex_glute_bridge", "ex_hip_hinge"],
        other: [L("Graded activity toward patient-chosen goals", "فعالیت تدریجی به سمت اهدافی که بیمار انتخاب کرده")],
        progressWhen: [L("Improved ODI or PSFS", "بهبود ODI یا PSFS")],
      },
      {
        id: "return",
        name: L("Return to full activity and self-management", "بازگشت به فعالیت کامل و خودمدیریتی"),
        typical: L("Usually from week 6", "معمولاً از هفته ۶"),
        goals: [L("Work, lifting and sport demands", "نیازهای کار، بلند کردن بار و ورزش"), L("Flare-up plan", "برنامه مدیریت عود")],
        exercises: ["ex_side_plank", "ex_split_squat", "ex_single_leg_bridge", "ex_walking_program"],
        other: [L("Regular physical activity of the patient's choice", "فعالیت بدنی منظم به انتخاب بیمار")],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, ODI, STARTBACK],
    watchFor: [
      L("Saddle anaesthesia, bladder or bowel change: emergency referral", "بی‌حسی ناحیه زین، تغییر کنترل ادرار یا مدفوع: ارجاع اورژانسی"),
      L("Progressive neurological deficit, unexplained weight loss, fever or history of cancer", "نقص عصبی پیشرونده، کاهش وزن بی‌دلیل، تب یا سابقه سرطان"),
    ],
    references: [
      "NICE. Low back pain and sciatica in over 16s: assessment and management (NG59). National Institute for Health and Care Excellence; 2016 (updated 2020).",
      "George SZ, et al. Interventions for the Management of Acute and Chronic Low Back Pain: Revision 2021. J Orthop Sports Phys Ther. 2021;51(11):CPG1–CPG60.",
      "Hill JC, et al. Comparison of stratified primary care management for low back pain with current best practice (STarT Back): a randomised controlled trial. Lancet. 2011;378(9802):1560–1571.",
    ],
  },
  {
    id: "lumbar_radiculopathy",
    region: "low-back",
    hypotheses: ["lb_radiculopathy"],
    title: L("Lumbar radiculopathy (sciatica)", "رادیکولوپاتی کمری (سیاتیک)"),
    summary: L(
      "Most improve without surgery over weeks to months. Advice to stay active, exercise guided by symptom response and neural mobility, with close neurological monitoring.",
      "بیشتر بیماران طی چند هفته تا چند ماه بدون جراحی بهتر می‌شوند. توصیه به فعال ماندن، تمرین بر اساس پاسخ علائم و تحرک عصبی، همراه با پایش دقیق عصبی."
    ),
    principles: [
      L("Prefer movements that centralise or ease leg symptoms.", "حرکاتی ترجیح داده شوند که علائم پا را متمرکز یا کم می‌کنند."),
      L("Re-check strength, sensation and reflexes at each visit.", "قدرت، حس و رفلکس‌ها در هر جلسه دوباره بررسی شوند."),
    ],
    phases: [
      {
        id: "settle",
        name: L("Settle leg symptoms", "آرام کردن علائم پا"),
        typical: L("Usually 2–6 weeks", "معمولاً ۲ تا ۶ هفته"),
        goals: [L("Centralise or reduce leg pain", "متمرکز یا کم کردن درد پا"), L("Stay active", "فعال ماندن")],
        exercises: ["ex_prone_press_up", "ex_knee_to_chest", "ex_sciatic_slider", "ex_walking_program"],
        other: [L("Positions of relief; short frequent walks", "وضعیت‌های تسکین‌دهنده؛ پیاده‌روی‌های کوتاه و مکرر")],
        progressWhen: [L("Leg pain less than back pain, or clearly reducing", "درد پا کمتر از درد کمر یا رو به کاهش واضح"), L("Stable neurological examination", "معاینه عصبی پایدار")],
      },
      {
        id: "strength",
        name: L("Graded strengthening", "تقویت تدریجی"),
        typical: L("Usually 4–8 weeks", "معمولاً ۴ تا ۸ هفته"),
        goals: [L("Trunk and lower-limb strength", "قدرت تنه و اندام تحتانی")],
        exercises: ["ex_bird_dog", "ex_dead_bug", "ex_glute_bridge", "ex_side_plank_knees", "ex_hip_hinge"],
        other: [],
        progressWhen: [L("Leg symptoms minimal with daily activity", "علائم پا در فعالیت روزانه ناچیز")],
      },
      {
        id: "return",
        name: L("Return to full activity", "بازگشت به فعالیت کامل"),
        typical: L("Usually from week 8", "معمولاً از هفته ۸"),
        goals: [L("Work and sport demands", "نیازهای کار و ورزش")],
        exercises: ["ex_side_plank", "ex_split_squat", "ex_single_leg_bridge"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, ODI, PSFS],
    watchFor: [
      L("Progressive weakness (for example foot drop): urgent medical review", "ضعف پیشرونده (مثلاً افتادگی پا): ارجاع فوری پزشکی"),
      L("Saddle anaesthesia, bladder or bowel change: emergency referral", "بی‌حسی ناحیه زین، تغییر کنترل ادرار یا مدفوع: ارجاع اورژانسی"),
      L("Severe pain not settling after 6–12 weeks: specialist opinion", "درد شدید که پس از ۶ تا ۱۲ هفته آرام نشود: نظر متخصص"),
    ],
    references: [
      "NICE. Low back pain and sciatica in over 16s: assessment and management (NG59). National Institute for Health and Care Excellence; 2016 (updated 2020).",
      "George SZ, et al. Interventions for the Management of Acute and Chronic Low Back Pain: Revision 2021. J Orthop Sports Phys Ther. 2021;51(11):CPG1–CPG60.",
    ],
  },
  {
    id: "lumbar_stenosis",
    region: "low-back",
    hypotheses: ["lb_stenosis"],
    title: L("Lumbar spinal stenosis", "تنگی کانال نخاعی کمری"),
    summary: L(
      "Education, flexion-biased exercise, walking or cycling conditioning and manual therapy; non-operative care can give outcomes similar to surgery for many patients.",
      "آموزش، تمرین با گرایش فلکشن، آمادگی با پیاده‌روی یا دوچرخه و درمان دستی؛ درمان غیرجراحی برای بسیاری از بیماران نتایجی نزدیک به جراحی دارد."
    ),
    principles: [
      L("Flexion usually eases symptoms; use it to build walking tolerance.", "فلکشن معمولاً علائم را کم می‌کند؛ از آن برای افزایش تحمل راه رفتن استفاده کنید."),
      L("Interval walking with rests, progressing distance.", "پیاده‌روی تناوبی با استراحت و افزایش تدریجی مسافت."),
    ],
    phases: [
      {
        id: "start",
        name: L("Education and flexion-based mobility", "آموزش و تحرک مبتنی بر فلکشن"),
        typical: L("Usually 2–4 weeks", "معمولاً ۲ تا ۴ هفته"),
        goals: [L("Understand symptom triggers and relief", "شناخت عوامل تشدید و تسکین علائم")],
        exercises: ["ex_knee_to_chest", "ex_pelvic_tilt", "ex_cat_camel", "ex_walking_program"],
        other: [L("Stationary cycling or walking with a trolley for conditioning", "دوچرخه ثابت یا پیاده‌روی با چرخ خرید برای آمادگی"), L("Manual therapy as an adjunct", "درمان دستی به‌عنوان مکمل")],
        progressWhen: [L("Walking time improving", "افزایش زمان راه رفتن")],
      },
      {
        id: "strength",
        name: L("Strength and walking tolerance", "تقویت و تحمل راه رفتن"),
        typical: L("Usually 6–8 weeks", "معمولاً ۶ تا ۸ هفته"),
        goals: [L("Hip and trunk strength", "قدرت لگن و تنه"), L("Longer walking distance", "مسافت راه رفتن بیشتر")],
        exercises: ["ex_curl_up", "ex_glute_bridge", "ex_sit_to_stand", "ex_ankle_balance"],
        other: [],
        progressWhen: [L("Walking distance meets daily needs", "مسافت راه رفتن پاسخگوی نیاز روزانه")],
      },
      {
        id: "maintain",
        name: L("Self-management", "خودمدیریتی"),
        typical: L("Ongoing", "ادامه‌دار"),
        goals: [L("Maintain activity and strength", "حفظ فعالیت و قدرت")],
        exercises: ["ex_walking_program", "ex_bird_dog", "ex_step_up"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, ODI, PSFS],
    watchFor: [
      L("Progressive neurological deficit or cauda equina signs", "نقص عصبی پیشرونده یا علائم سندرم دم اسب"),
      L("Calf pain on walking relieved by standing still (exclude vascular claudication)", "درد ساق با راه رفتن که با ایستادن آرام می‌شود (رد لنگش عروقی)"),
    ],
    references: [
      "Delitto A, et al. Surgery Versus Nonsurgical Treatment of Lumbar Spinal Stenosis: A Randomized Trial. Ann Intern Med. 2015;162(7):465–473.",
      "Schneider MJ, et al. Comparative Clinical Effectiveness of Nonsurgical Treatment Methods in Patients With Lumbar Spinal Stenosis: A Randomized Clinical Trial. JAMA Netw Open. 2019;2(1):e186828.",
    ],
  },
];
