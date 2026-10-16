import { HOOS, KOOS, LEFS, NPRS, OARSI_TESTS, PSFS, SHOULDER_ROM, SPADI } from "@/lib/clinical/protocols/outcomes";
import { L, type OutcomeMeasure, type Protocol } from "@/lib/clinical/protocols/types";

/*
 * Rehabilitation after surgery. Unlike the condition protocols, these start
 * from the operation, not from a ranked hypothesis, and the surgeon's own
 * protocol and restrictions (weight bearing, range limits, sling, hip
 * precautions) always take precedence. Week windows are typical for an
 * uncomplicated course; progression is by criteria.
 */

const SURGEON_FIRST = L(
  "The operating surgeon's protocol and restrictions (weight bearing, range-of-motion limits, sling or brace, precautions) take precedence over every phase below.",
  "پروتکل و محدودیت‌های جراح (تحمل وزن، محدودیت دامنه حرکتی، آتل یا بریس، احتیاط‌ها) بر همه فازهای زیر مقدم است."
);

const DVT_INFECTION = L(
  "Calf pain or swelling, chest pain or shortness of breath, or wound redness, warmth, discharge or fever: stop and refer urgently.",
  "درد یا تورم ساق، درد قفسه سینه یا تنگی نفس، یا قرمزی، گرمی، ترشح زخم یا تب: تمرین را متوقف و فوری ارجاع دهید."
);

const OMAS: OutcomeMeasure = {
  name: "OMAS",
  detail: L(
    "Olerud–Molander Ankle Score 0–100 at baseline and every 4–6 weeks.",
    "امتیاز مچ پای اولرود–مولاندر (OMAS) ۰ تا ۱۰۰، در شروع و هر ۴ تا ۶ هفته."
  ),
};

export const postOpProtocols: Protocol[] = [
  {
    id: "tka",
    region: "knee",
    hypotheses: [],
    postOp: { procedure: L("Total knee arthroplasty (knee replacement)", "تعویض کامل مفصل زانو (TKA)") },
    title: L("After total knee replacement", "پس از تعویض مفصل زانو"),
    summary: L(
      "Early mobility, swelling control and quadriceps activation, then progressive, higher-intensity strengthening and balance training to restore function.",
      "حرکت زودهنگام، کنترل تورم و فعال‌سازی عضله چهارسر، سپس تقویت پیشرونده با شدت بالاتر و تمرین تعادل برای بازگشت عملکرد."
    ),
    principles: [
      SURGEON_FIRST,
      L(
        "Start mobility within the first day if the surgeon allows; continuous passive motion is not recommended routinely.",
        "در صورت اجازه جراح، حرکت از روز اول شروع شود؛ استفاده روتین از دستگاه حرکت غیرفعال مداوم (CPM) توصیه نمی‌شود."
      ),
      L(
        "Quadriceps strength is the main limiter: add neuromuscular electrical stimulation if available, and progress to high-intensity strengthening.",
        "قدرت چهارسر محدودکننده اصلی است: در صورت دسترسی تحریک الکتریکی عصبی‌عضلانی (NMES) اضافه کنید و به سمت تقویت با شدت بالا پیش بروید."
      ),
      L(
        "Include balance and motor-control training, not strengthening alone.",
        "تمرین تعادل و کنترل حرکتی را هم بگنجانید، نه فقط تقویت."
      ),
    ],
    phases: [
      {
        id: "early",
        name: L("Early recovery", "بهبود اولیه"),
        typical: L("About weeks 0–2 after surgery", "حدود هفته ۰ تا ۲ پس از جراحی"),
        weeks: { from: 0, to: 2 },
        goals: [
          L("Full knee extension and flexion towards 90°", "صاف شدن کامل زانو و خم شدن تا حدود ۹۰ درجه"),
          L("Active quadriceps contraction without extension lag", "انقباض فعال چهارسر بدون تأخیر در صاف کردن زانو"),
          L("Safe transfers and walking with the prescribed aid", "جابه‌جایی و راه رفتن ایمن با وسیله کمکی تجویزشده"),
        ],
        exercises: ["ex_ankle_pumps", "ex_quad_sets", "ex_heel_prop", "ex_heel_slides", "ex_seated_knee_flexion", "ex_gluteal_sets", "ex_slr"],
        other: [
          L("Swelling control: elevation, cold, compression as advised", "کنترل تورم: بالا نگه داشتن پا، سرما و فشار طبق توصیه"),
          L("Gait training with the walking aid and weight bearing the surgeon allows", "آموزش راه رفتن با وسیله کمکی و تحمل وزنی که جراح اجازه داده"),
          L("Quadriceps NMES where available", "تحریک الکتریکی چهارسر در صورت دسترسی"),
        ],
        progressWhen: [
          L("Wound healing without signs of infection", "ترمیم زخم بدون علامت عفونت"),
          L("Extension within 5° of straight and flexion about 90°", "صاف شدن زانو با کمتر از ۵ درجه کمبود و خم شدن حدود ۹۰ درجه"),
          L("Straight-leg raise without lag", "بالا بردن مستقیم پا بدون تأخیر صاف شدن زانو"),
          L("Safe walking with the aid at home", "راه رفتن ایمن با وسیله کمکی در خانه"),
        ],
      },
      {
        id: "strength",
        name: L("Strength and gait", "قدرت و راه رفتن"),
        typical: L("About weeks 2–6", "حدود هفته ۲ تا ۶"),
        weeks: { from: 2, to: 6 },
        goals: [
          L("Flexion of 110° or more with full extension", "خم شدن ۱۱۰ درجه یا بیشتر با صاف شدن کامل"),
          L("Walking without an aid and without a limp", "راه رفتن بدون وسیله کمکی و بدون لنگیدن"),
          L("Stairs reciprocally with a rail", "بالا و پایین رفتن پله یک‌درمیان با نرده"),
        ],
        exercises: ["ex_short_arc_quad", "ex_terminal_knee_ext", "ex_sit_to_stand", "ex_glute_bridge", "ex_glute_med_sidelying", "ex_calf_raise", "ex_ankle_balance"],
        other: [
          L("Stationary bike once flexion allows a full revolution", "دوچرخه ثابت وقتی خم شدن زانو اجازه یک دور کامل بدهد"),
          L("Wean the walking aid as gait normalises", "کنار گذاشتن تدریجی وسیله کمکی با طبیعی شدن راه رفتن"),
        ],
        progressWhen: [
          L("Flexion 110° or more and full extension", "خم شدن ۱۱۰ درجه یا بیشتر و صاف شدن کامل"),
          L("Walking without an aid and without a limp", "راه رفتن بدون وسیله کمکی و بدون لنگیدن"),
          L("Swelling settles after exercise by the next day", "تورم پس از تمرین تا روز بعد فروکش کند"),
        ],
      },
      {
        id: "function",
        name: L("Function and high-intensity strengthening", "عملکرد و تقویت با شدت بالا"),
        typical: L("From about week 6 to 3 months and beyond", "از حدود هفته ۶ تا ۳ ماه و بعد از آن"),
        weeks: { from: 6, to: null },
        goals: [
          L("Quadriceps strength close to the other side", "قدرت چهارسر نزدیک به سمت مقابل"),
          L("Return to the patient's chosen activities", "بازگشت به فعالیت‌های مورد نظر بیمار"),
        ],
        exercises: ["ex_step_up", "ex_step_down", "ex_wall_sit", "ex_split_squat", "ex_monster_walk"],
        other: [
          L("Progress load towards high intensity (about 8 repetitions to fatigue)", "افزایش بار به سمت شدت بالا (حدود ۸ تکرار تا خستگی)"),
          L("Walking programme and plan for long-term activity", "برنامه پیاده‌روی و برنامه فعالیت بلندمدت"),
        ],
        progressWhen: [],
      },
    ],
    outcomes: [KOOS, OARSI_TESTS, NPRS],
    watchFor: [
      DVT_INFECTION,
      L(
        "Flexion below about 90° by 6 weeks despite exercise: contact the surgeon (stiffness may need medical review).",
        "خم شدن کمتر از حدود ۹۰ درجه تا هفته ۶ با وجود تمرین: با جراح تماس بگیرید (خشکی ممکن است بررسی پزشکی لازم داشته باشد)."
      ),
      L(
        "New instability, a fall onto the knee or increasing rest pain: refer to the surgeon.",
        "بی‌ثباتی جدید، زمین خوردن روی زانو یا درد رو به افزایش در استراحت: به جراح ارجاع دهید."
      ),
    ],
    references: [
      "Jette DU et al. Physical therapist management of total knee arthroplasty (APTA clinical practice guideline). Phys Ther 2020",
      "NICE NG157. Joint replacement (primary): hip, knee and shoulder. 2020",
      "Dobson F et al. OARSI recommended performance-based tests of physical function. Osteoarthritis Cartilage 2013",
    ],
  },
  {
    id: "tha",
    region: "hip",
    hypotheses: [],
    postOp: { procedure: L("Total hip arthroplasty (hip replacement)", "تعویض کامل مفصل لگن (THA)") },
    title: L("After total hip replacement", "پس از تعویض مفصل لگن"),
    summary: L(
      "Early walking and transfers within the surgeon's precautions, then progressive hip abductor and extensor strengthening, balance and return to activity.",
      "راه رفتن و جابه‌جایی زودهنگام در محدوده احتیاط‌های جراح، سپس تقویت پیشرونده ابداکتورها و اکستانسورهای لگن، تعادل و بازگشت به فعالیت."
    ),
    principles: [
      SURGEON_FIRST,
      L(
        "Hip precautions depend on the surgical approach and the surgeon; apply only those the surgeon has set.",
        "احتیاط‌های لگن به روش جراحی و نظر جراح بستگی دارد؛ فقط احتیاط‌هایی را رعایت کنید که جراح تعیین کرده است."
      ),
      L(
        "Hip abductor strength drives gait quality; progress resistance as precautions and pain allow.",
        "قدرت ابداکتورهای لگن کیفیت راه رفتن را تعیین می‌کند؛ مقاومت را به اندازه‌ای که احتیاط‌ها و درد اجازه می‌دهد افزایش دهید."
      ),
    ],
    phases: [
      {
        id: "early",
        name: L("Early recovery", "بهبود اولیه"),
        typical: L("About weeks 0–2 after surgery", "حدود هفته ۰ تا ۲ پس از جراحی"),
        weeks: { from: 0, to: 2 },
        goals: [
          L("Safe bed, chair and toilet transfers within precautions", "جابه‌جایی ایمن تخت، صندلی و توالت در محدوده احتیاط‌ها"),
          L("Walking with the prescribed aid", "راه رفتن با وسیله کمکی تجویزشده"),
        ],
        exercises: ["ex_ankle_pumps", "ex_quad_sets", "ex_gluteal_sets", "ex_heel_slides"],
        other: [
          L("Teach the surgeon's precautions for dressing, sitting and sleeping", "آموزش احتیاط‌های جراح برای لباس پوشیدن، نشستن و خوابیدن"),
          L("Gait and stair training with the aid", "آموزش راه رفتن و پله با وسیله کمکی"),
        ],
        progressWhen: [
          L("Wound healing without signs of infection", "ترمیم زخم بدون علامت عفونت"),
          L("Independent, safe transfers and walking with the aid", "جابه‌جایی و راه رفتن مستقل و ایمن با وسیله کمکی"),
        ],
      },
      {
        id: "strength",
        name: L("Strength and gait", "قدرت و راه رفتن"),
        typical: L("About weeks 2–6", "حدود هفته ۲ تا ۶"),
        weeks: { from: 2, to: 6 },
        goals: [
          L("Walking without an aid and without a Trendelenburg limp", "راه رفتن بدون وسیله کمکی و بدون لنگش ترندلنبورگ"),
          L("Sit to stand from a standard chair without the arms", "برخاستن از صندلی معمولی بدون کمک دست"),
        ],
        exercises: ["ex_glute_bridge", "ex_glute_med_sidelying", "ex_sit_to_stand", "ex_calf_raise", "ex_ankle_balance"],
        other: [
          L("Wean the walking aid as gait normalises", "کنار گذاشتن تدریجی وسیله کمکی با طبیعی شدن راه رفتن"),
          L("Graded walking programme", "برنامه پیاده‌روی تدریجی"),
        ],
        progressWhen: [
          L("Walking without an aid and without a limp", "راه رفتن بدون وسیله کمکی و بدون لنگیدن"),
          L("Single-leg stance about 10 seconds on the operated side", "ایستادن روی پای عمل‌شده حدود ۱۰ ثانیه"),
        ],
      },
      {
        id: "function",
        name: L("Function and strengthening", "عملکرد و تقویت"),
        typical: L("From about week 6 to 3 months and beyond", "از حدود هفته ۶ تا ۳ ماه و بعد از آن"),
        weeks: { from: 6, to: null },
        goals: [
          L("Hip strength and balance for the patient's chosen activities", "قدرت و تعادل لگن برای فعالیت‌های مورد نظر بیمار"),
        ],
        exercises: ["ex_step_up", "ex_glute_med_bridge", "ex_monster_walk", "ex_hip_hinge", "ex_walking_program"],
        other: [
          L("Progress load and walking distance; plan long-term activity", "افزایش بار و مسافت پیاده‌روی؛ برنامه فعالیت بلندمدت"),
        ],
        progressWhen: [],
      },
    ],
    outcomes: [HOOS, OARSI_TESTS, LEFS],
    watchFor: [
      DVT_INFECTION,
      L(
        "Sudden hip pain with a shortened or rotated leg or inability to bear weight (possible dislocation): emergency referral.",
        "درد ناگهانی لگن با کوتاه یا چرخیده شدن پا یا ناتوانی در تحمل وزن (احتمال دررفتگی): ارجاع اورژانسی."
      ),
      L(
        "New numbness, foot drop or thigh pain on weight bearing: refer to the surgeon.",
        "بی‌حسی جدید، افتادگی پا یا درد ران هنگام تحمل وزن: به جراح ارجاع دهید."
      ),
    ],
    references: [
      "NICE NG157. Joint replacement (primary): hip, knee and shoulder. 2020",
      "Smith TO et al. Assistive devices, hip precautions, environmental modifications and training to prevent dislocation and improve function after hip arthroplasty. Cochrane Database Syst Rev 2016",
      "Di Monaco M, Castiglioni C. Which type of exercise therapy is effective after hip arthroplasty? A systematic review of randomized controlled trials. Eur J Phys Rehabil Med 2013",
    ],
  },
  {
    id: "rc_repair",
    region: "shoulder",
    hypotheses: [],
    postOp: { procedure: L("Rotator cuff repair", "ترمیم جراحی روتاتور کاف") },
    title: L("After rotator cuff repair", "پس از ترمیم روتاتور کاف"),
    summary: L(
      "Protect the repair while restoring passive range, then active range, then progressive cuff and scapular strengthening; timing depends on tear size and the surgeon.",
      "محافظت از ترمیم همراه با بازگرداندن دامنه حرکتی غیرفعال، سپس دامنه فعال و بعد تقویت پیشرونده روتاتور کاف و کتف؛ زمان‌بندی به اندازه پارگی و نظر جراح بستگی دارد."
    ),
    principles: [
      SURGEON_FIRST,
      L(
        "Sling time and the start of active motion depend on tear size and tissue quality; larger repairs usually progress more slowly.",
        "مدت استفاده از آتل و زمان شروع حرکت فعال به اندازه پارگی و کیفیت بافت بستگی دارد؛ ترمیم‌های بزرگ‌تر معمولاً کندتر پیش می‌روند."
      ),
      L(
        "Early versus delayed passive motion gives similar long-term results; early motion may restore range sooner, so follow the surgeon's choice.",
        "حرکت غیرفعال زودهنگام و تأخیری در درازمدت نتایج مشابهی دارند؛ حرکت زودهنگام ممکن است دامنه را زودتر برگرداند، پس طبق انتخاب جراح عمل کنید."
      ),
      L("No resisted cuff loading before the surgeon allows it (usually about 12 weeks).", "تا اجازه جراح (معمولاً حدود ۱۲ هفته) هیچ تمرین مقاومتی برای روتاتور کاف انجام نشود."),
    ],
    phases: [
      {
        id: "protect",
        name: L("Protection and passive range", "محافظت و دامنه غیرفعال"),
        typical: L("About weeks 0–6 after surgery", "حدود هفته ۰ تا ۶ پس از جراحی"),
        weeks: { from: 0, to: 6 },
        goals: [
          L("Protect the repair; sling as the surgeon advises", "محافظت از ترمیم؛ آتل طبق توصیه جراح"),
          L("Passive elevation and external rotation within the surgeon's limits", "بالا بردن و چرخش خارجی غیرفعال در محدوده تعیین‌شده جراح"),
          L("Keep elbow, wrist and hand moving", "حفظ حرکت آرنج، مچ و دست"),
        ],
        exercises: ["ex_pendulum", "ex_scap_retraction"],
        other: [
          L("Passive range of motion by the therapist within limits", "حرکت غیرفعال توسط درمانگر در محدوده مجاز"),
          L("Sleep and sling positioning, pain and cold management", "آموزش وضعیت خواب و آتل، کنترل درد و سرما"),
        ],
        progressWhen: [
          L("Surgeon allows active motion", "جراح اجازه حرکت فعال بدهد"),
          L("Passive elevation about 120° or more without severe pain", "بالا بردن غیرفعال حدود ۱۲۰ درجه یا بیشتر بدون درد شدید"),
        ],
      },
      {
        id: "active",
        name: L("Active range", "دامنه حرکتی فعال"),
        typical: L("About weeks 6–12", "حدود هفته ۶ تا ۱۲"),
        weeks: { from: 6, to: 12 },
        goals: [
          L("Active elevation without shrugging", "بالا بردن فعال دست بدون بالا آوردن شانه"),
          L("Scapular control through range", "کنترل کتف در طول دامنه"),
        ],
        exercises: ["ex_shoulder_flexion_aaro", "ex_scap_control", "ex_ext_rotation"],
        other: [
          L("Progress from assisted to active movement, gravity-minimised first", "پیشروی از حرکت کمکی به فعال، ابتدا با کمترین اثر جاذبه"),
          L("Light daily activities below shoulder height", "فعالیت‌های سبک روزمره زیر سطح شانه"),
        ],
        progressWhen: [
          L("Surgeon allows strengthening", "جراح اجازه تقویت بدهد"),
          L("Active elevation near the other side without substitution", "بالا بردن فعال نزدیک به سمت دیگر بدون حرکت جبرانی"),
        ],
      },
      {
        id: "strength",
        name: L("Strengthening and return to activity", "تقویت و بازگشت به فعالیت"),
        typical: L("From about week 12 to 6 months and beyond", "از حدود هفته ۱۲ تا ۶ ماه و بعد از آن"),
        weeks: { from: 12, to: null },
        goals: [
          L("Progressive cuff and scapular strength", "قدرت پیشرونده روتاتور کاف و کتف"),
          L("Return to work, sport or overhead tasks as the surgeon allows", "بازگشت به کار، ورزش یا فعالیت بالای سر طبق اجازه جراح"),
        ],
        exercises: ["ex_er_band", "ex_ir_band", "ex_row_band", "ex_sidelying_er", "ex_wall_pushup_plus", "ex_prone_t"],
        other: [
          L("Progress load gradually; heavy or overhead work usually from 4–6 months", "افزایش تدریجی بار؛ کار سنگین یا بالای سر معمولاً از ۴ تا ۶ ماه"),
        ],
        progressWhen: [],
      },
    ],
    outcomes: [SPADI, SHOULDER_ROM, NPRS],
    watchFor: [
      L(
        "A sudden pop or new loss of active elevation (possible re-tear): refer to the surgeon.",
        "صدای ناگهانی یا از دست رفتن جدید بالا بردن فعال (احتمال پارگی مجدد): به جراح ارجاع دهید."
      ),
      DVT_INFECTION,
      L(
        "Range not improving by 12 weeks, or new arm numbness or weakness: refer for review.",
        "بهبود نیافتن دامنه تا هفته ۱۲، یا بی‌حسی و ضعف جدید دست: برای بررسی ارجاع دهید."
      ),
    ],
    references: [
      "Thigpen CA et al. The American Society of Shoulder and Elbow Therapists' consensus statement on rehabilitation following arthroscopic rotator cuff repair. J Shoulder Elbow Surg 2016",
      "Houck DA et al. Early versus delayed motion after rotator cuff repair: a systematic review of overlapping meta-analyses. Am J Sports Med 2017",
    ],
  },
  {
    id: "ankle_fracture",
    region: "ankle-foot",
    hypotheses: [],
    postOp: { procedure: L("Ankle fracture (fixed or in a cast/boot)", "شکستگی مچ پا (پس از جراحی یا گچ/بوت)") },
    title: L("After ankle fracture", "پس از شکستگی مچ پا"),
    summary: L(
      "Weight bearing as the surgeon allows, early ankle movement once out of the cast or boot, then calf strength, balance and return to walking and activity.",
      "تحمل وزن طبق اجازه جراح، حرکت زودهنگام مچ پس از خارج شدن از گچ یا بوت، سپس قدرت ساق، تعادل و بازگشت به راه رفتن و فعالیت."
    ),
    principles: [
      SURGEON_FIRST,
      L(
        "After stable fixation, earlier weight bearing in a boot is usually safe when the surgeon allows it.",
        "پس از فیکساسیون پایدار، تحمل وزن زودتر با بوت معمولاً در صورت اجازه جراح ایمن است."
      ),
      L("Calf strength and balance are the usual long-term deficits; train them deliberately.", "قدرت ساق و تعادل معمولاً کمبودهای درازمدت هستند؛ آن‌ها را هدفمند تمرین دهید."),
    ],
    phases: [
      {
        id: "protect",
        name: L("Protection", "محافظت"),
        typical: L("About weeks 0–6 (cast or boot)", "حدود هفته ۰ تا ۶ (گچ یا بوت)"),
        weeks: { from: 0, to: 6 },
        goals: [
          L("Weight bearing and walking as the surgeon allows", "تحمل وزن و راه رفتن طبق اجازه جراح"),
          L("Keep hip, knee and toes strong and moving", "حفظ قدرت و حرکت لگن، زانو و انگشتان"),
        ],
        exercises: ["ex_quad_sets", "ex_slr", "ex_glute_bridge"],
        other: [
          L("Elevation and toe movement for swelling", "بالا نگه داشتن پا و حرکت انگشتان برای تورم"),
          L("Gait training with the aid and boot", "آموزش راه رفتن با وسیله کمکی و بوت"),
        ],
        progressWhen: [
          L("Surgeon allows ankle movement out of the cast or boot", "جراح اجازه حرکت مچ بیرون از گچ یا بوت بدهد"),
          L("Wound healed without signs of infection", "زخم بدون علامت عفونت ترمیم شده باشد"),
        ],
      },
      {
        id: "mobility",
        name: L("Movement and strength", "حرکت و قدرت"),
        typical: L("About weeks 6–12", "حدود هفته ۶ تا ۱۲"),
        weeks: { from: 6, to: 12 },
        goals: [
          L("Ankle dorsiflexion close to the other side", "دورسی‌فلکشن مچ نزدیک به سمت مقابل"),
          L("Walking without the boot and aid, without a limp", "راه رفتن بدون بوت و وسیله کمکی و بدون لنگیدن"),
        ],
        exercises: ["ex_ankle_pumps", "ex_ankle_alphabet", "ex_ankle_band_4way", "ex_soleus_raise", "ex_calf_raise", "ex_ankle_balance"],
        other: [
          L("Graded walking; swelling may persist for months", "پیاده‌روی تدریجی؛ تورم ممکن است ماه‌ها باقی بماند"),
        ],
        progressWhen: [
          L("Walking without an aid and without a limp", "راه رفتن بدون وسیله کمکی و بدون لنگیدن"),
          L("Single-leg heel raises on the operated side, at least 10", "حداقل ۱۰ بار بالا رفتن روی پنجه تک‌پا روی پای آسیب‌دیده"),
        ],
      },
      {
        id: "function",
        name: L("Function and return to activity", "عملکرد و بازگشت به فعالیت"),
        typical: L("From about week 12", "از حدود هفته ۱۲"),
        weeks: { from: 12, to: null },
        goals: [
          L("Calf endurance and balance for the patient's activities", "استقامت ساق و تعادل برای فعالیت‌های بیمار"),
        ],
        exercises: ["ex_balance_reach", "ex_step_up", "ex_step_down", "ex_walking_program"],
        other: [
          L("Return to running or sport only when the surgeon allows and strength allows", "بازگشت به دویدن یا ورزش فقط با اجازه جراح و کافی بودن قدرت"),
        ],
        progressWhen: [],
      },
    ],
    outcomes: [OMAS, LEFS, PSFS],
    watchFor: [
      DVT_INFECTION,
      L(
        "Pain, colour or temperature change out of proportion to the injury (possible complex regional pain syndrome): refer for review.",
        "درد، تغییر رنگ یا دمای نامتناسب با آسیب (احتمال سندرم درد منطقه‌ای پیچیده): برای بررسی ارجاع دهید."
      ),
      L(
        "New deformity or increasing pain on weight bearing (possible loss of fixation): refer to the surgeon.",
        "تغییر شکل جدید یا درد رو به افزایش هنگام تحمل وزن (احتمال از دست رفتن فیکساسیون): به جراح ارجاع دهید."
      ),
    ],
    references: [
      "Lin CWC et al. Rehabilitation for ankle fractures in adults. Cochrane Database Syst Rev 2012",
      "Bretherton CP et al. Early versus delayed weight-bearing following operatively treated ankle fracture (WAX): a non-inferiority randomised controlled trial. Lancet 2024",
    ],
  },
];

/** The phase whose usual window contains this many weeks since surgery. */
export function phaseForWeeks(protocol: Protocol, weeks: number): string | null {
  if (!protocol.postOp || !Number.isFinite(weeks) || weeks < 0) return null;
  const phase = protocol.phases.find(
    (candidate) =>
      candidate.weeks && weeks >= candidate.weeks.from && (candidate.weeks.to === null || weeks < candidate.weeks.to)
  );
  return phase?.id ?? null;
}

/** Whole weeks between an ISO surgery date and an ISO day. */
export function weeksSince(surgeryDate: string, today: string): number | null {
  const from = Date.parse(`${surgeryDate}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.floor((to - from) / (7 * 86_400_000));
}
