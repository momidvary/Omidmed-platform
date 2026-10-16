import { AKPS, HOP_LSI, KOOS, NPRS, OARSI_TESTS, PSFS, STRENGTH_LSI, VISA_P } from "@/lib/clinical/protocols/outcomes";
import { L, type Protocol } from "@/lib/clinical/protocols/types";

const PAIN_MONITOR = L(
  "Pain during exercise of 3/10 or less that settles by the next morning",
  "درد حین تمرین ۳ از ۱۰ یا کمتر که تا صبح روز بعد برطرف شود"
);

export const kneeProtocols: Protocol[] = [
  {
    id: "pfp",
    region: "knee",
    hypotheses: ["k_pfp"],
    title: L("Patellofemoral pain", "درد پاتلوفمورال"),
    summary: L(
      "Exercise therapy combining hip and knee strengthening, education on load management and, in the short term, adjuncts such as taping or foot orthoses.",
      "تمرین‌درمانی ترکیبی تقویت لگن و زانو، آموزش مدیریت بار و در کوتاه‌مدت روش‌های کمکی مثل تیپینگ یا کفی."
    ),
    principles: [
      L("Combined hip- and knee-targeted exercise is preferred to knee-only exercise.", "تمرین ترکیبی لگن و زانو بر تمرین فقط زانو ترجیح دارد."),
      L("Do not use isolated patellofemoral, knee or lumbar mobilisation, or electrophysical agents (2018 international consensus).", "از موبیلیزاسیون ایزوله پاتلوفمورال، زانو یا کمر و مدالیته‌های الکتروفیزیکی استفاده نشود (اجماع بین‌المللی ۲۰۱۸)."),
      L("Adjust, rather than stop, painful activities (stairs, squats, running volume).", "فعالیت‌های دردناک (پله، اسکوات، حجم دویدن) تنظیم شود، نه اینکه کاملاً کنار گذاشته شود."),
      L("Use a pain-monitoring rule and progress load gradually over at least 6 weeks.", "با قانون پایش درد، بار را دست‌کم طی ۶ هفته به تدریج افزایش دهید."),
    ],
    phases: [
      {
        id: "settle",
        name: L("Settle symptoms and start loading", "آرام کردن علائم و شروع بارگذاری"),
        typical: L("Usually 2–4 weeks", "معمولاً ۲ تا ۴ هفته"),
        goals: [
          L("Explain the condition and the role of load", "توضیح ماهیت عارضه و نقش بار"),
          L("Reduce provocative load while keeping the patient active", "کاهش بار تحریک‌کننده در کنار فعال ماندن بیمار"),
          L("Start pain-free hip and quadriceps activation", "شروع فعال‌سازی بدون درد لگن و چهارسر"),
        ],
        exercises: ["ex_quad_sets", "ex_slr", "ex_glute_med_bridge", "ex_glute_med_sidelying", "ex_glute_bridge", "ex_wall_sit"],
        other: [
          L("Short-term patellar taping or prefabricated foot orthoses if they reduce pain", "در صورت کاهش درد، تیپینگ کشکک یا کفی پیش‌ساخته در کوتاه‌مدت"),
          L("Temporary reduction of running volume or deep-squat tasks", "کاهش موقت حجم دویدن یا فعالیت‌های اسکوات عمیق"),
        ],
        progressWhen: [
          PAIN_MONITOR,
          L("Wall sit or bridge holds of 30–45 s without increased symptoms", "نگه‌داشتن وال سیت یا پل باسن ۳۰ تا ۴۵ ثانیه بدون افزایش علائم"),
        ],
      },
      {
        id: "strength",
        name: L("Progressive strengthening", "تقویت پیشرونده"),
        typical: L("Usually 4–8 weeks", "معمولاً ۴ تا ۸ هفته"),
        goals: [
          L("Build quadriceps and hip abductor / extensor strength", "افزایش قدرت چهارسر و دورکننده‌ها و بازکننده‌های لگن"),
          L("Improve control of the knee in single-leg tasks", "بهبود کنترل زانو در فعالیت‌های تک‌پا"),
        ],
        exercises: ["ex_sit_to_stand", "ex_step_up", "ex_step_down", "ex_split_squat", "ex_side_plank_knees", "ex_monster_walk"],
        other: [
          L("Gradually reintroduce stairs and running with a load diary", "بازگشت تدریجی به پله و دویدن همراه با دفترچه ثبت بار"),
        ],
        progressWhen: [
          PAIN_MONITOR,
          L("Controlled step-down without the knee falling inward", "پایین آمدن کنترل‌شده از پله بدون جمع شدن زانو به داخل"),
          L("Clear improvement in AKPS or PSFS", "بهبود واضح در AKPS یا PSFS"),
        ],
      },
      {
        id: "return",
        name: L("Return to full activity", "بازگشت به فعالیت کامل"),
        typical: L("Usually from week 8 onward", "معمولاً از هفته ۸ به بعد"),
        goals: [
          L("Return to sport or work demands", "بازگشت به نیازهای ورزش یا کار"),
          L("Self-management and a long-term maintenance program", "خودمدیریتی و برنامه نگهدارنده بلندمدت"),
        ],
        exercises: ["ex_single_leg_squat", "ex_balance_reach", "ex_hop_progression"],
        other: [
          L("Graded running or sport-specific program", "برنامه تدریجی دویدن یا تمرین ویژه ورزش"),
          L("Agree a plan for flare-ups", "توافق درباره برنامه مدیریت عود"),
        ],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, AKPS, PSFS],
    watchFor: [
      L("Effusion, locking or giving way (consider intra-articular pathology)", "افیوژن، قفل شدن یا خالی کردن زانو (احتمال ضایعه داخل مفصلی)"),
      L("No improvement after 6–8 weeks of adherent exercise", "عدم بهبود پس از ۶ تا ۸ هفته تمرین منظم"),
    ],
    references: [
      "Willy RW, et al. Patellofemoral Pain: Clinical Practice Guidelines Linked to the International Classification of Functioning, Disability and Health From the Academy of Orthopaedic Physical Therapy of the American Physical Therapy Association. J Orthop Sports Phys Ther. 2019;49(9):CPG1–CPG95.",
      "Collins NJ, et al. 2018 Consensus statement on exercise therapy and physical interventions (orthoses, taping and manual therapy) to treat patellofemoral pain: recommendations from the 5th International Patellofemoral Pain Research Retreat, Gold Coast, Australia, 2017. Br J Sports Med. 2018;52(18):1170–1178.",
      "Crossley KM, et al. 2016 Patellofemoral pain consensus statement from the 4th International Patellofemoral Pain Research Retreat, Manchester. Part 2: recommended physical interventions. Br J Sports Med. 2016;50(14):844–852.",
    ],
  },
  {
    id: "knee_oa",
    region: "knee",
    hypotheses: ["k_oa"],
    title: L("Knee osteoarthritis", "آرتروز زانو"),
    summary: L(
      "First-line care is education, structured exercise and weight management where relevant; exercise is effective at all stages of severity.",
      "درمان خط اول، آموزش، تمرین ساختاریافته و در صورت لزوم مدیریت وزن است؛ تمرین در همه مراحل شدت مؤثر است."
    ),
    principles: [
      L("Exercise and education are core treatments for everyone with knee OA.", "تمرین و آموزش، درمان اصلی برای همه بیماران آرتروز زانو است."),
      L("Warn that joint pain may increase when exercise starts; it is acceptable if it settles within 24 hours, and long-term adherence improves pain and function (NICE NG226).", "توضیح دهید که درد مفصل ممکن است در شروع تمرین بیشتر شود؛ اگر ظرف ۲۴ ساعت فروکش کند قابل قبول است و ادامه بلندمدت تمرین درد و عملکرد را بهتر می‌کند (NICE NG226)."),
      L("Combine strengthening, neuromuscular control and aerobic activity.", "تقویت، کنترل عصبی‌عضلانی و فعالیت هوازی با هم ترکیب شود."),
      L("With overweight, any weight loss helps; about 10% of body weight helps more than 5%.", "در اضافه‌وزن، هر مقدار کاهش وزن مفید است؛ کاهش حدود ۱۰٪ وزن بدن از ۵٪ مؤثرتر است."),
      L("Manual therapy only alongside exercise, never on its own.", "درمان دستی فقط همراه تمرین، نه به‌تنهایی."),
    ],
    phases: [
      {
        id: "start",
        name: L("Education and starting exercise", "آموزش و شروع تمرین"),
        typical: L("Usually 2–3 weeks", "معمولاً ۲ تا ۳ هفته"),
        goals: [
          L("Address beliefs about 'wear and tear' and rest", "اصلاح باورها درباره «ساییدگی» و استراحت"),
          L("Establish a regular, tolerable routine", "ایجاد برنامه منظم و قابل تحمل"),
        ],
        exercises: ["ex_quad_sets", "ex_heel_slides", "ex_slr", "ex_short_arc_quad", "ex_sit_to_stand", "ex_walking_program"],
        other: [
          L("Weight management support with an agreed goal where body mass is a factor", "حمایت برای مدیریت وزن با هدف توافق‌شده، در صورت نقش وزن بدن"),
          L("Walking aid on the opposite side if needed", "در صورت نیاز، وسیله کمکی راه رفتن در دست مقابل"),
        ],
        progressWhen: [
          L("Exercise pain settles within 24 hours", "درد ناشی از تمرین ظرف ۲۴ ساعت فروکش می‌کند"),
          L("Completes the program at least twice a week", "انجام برنامه دست‌کم دو بار در هفته"),
        ],
      },
      {
        id: "strength",
        name: L("Strength and neuromuscular control", "تقویت و کنترل عصبی‌عضلانی"),
        typical: L("Usually 6–8 weeks (twice weekly)", "معمولاً ۶ تا ۸ هفته (دو بار در هفته)"),
        goals: [
          L("Increase quadriceps and hip strength", "افزایش قدرت چهارسر و لگن"),
          L("Improve alignment and control in functional tasks", "بهبود راستا و کنترل در فعالیت‌های عملکردی"),
        ],
        exercises: ["ex_wall_sit", "ex_step_up", "ex_step_down", "ex_glute_med_sidelying", "ex_glute_bridge", "ex_ankle_balance"],
        other: [
          L("Supervised group exercise (for example GLA:D-style) if available", "در صورت امکان، تمرین گروهی تحت نظارت (مشابه برنامه GLA:D)"),
        ],
        progressWhen: [
          L("Improved 30-s chair stand and walking test", "بهبود آزمون بلند شدن از صندلی و راه رفتن"),
          L("Confident with daily tasks such as stairs", "اطمینان در فعالیت‌های روزانه مثل پله"),
        ],
      },
      {
        id: "maintain",
        name: L("Long-term self-management", "خودمدیریتی بلندمدت"),
        typical: L("Ongoing", "ادامه‌دار"),
        goals: [
          L("Keep exercising independently and stay active", "ادامه تمرین مستقل و فعال ماندن"),
          L("Manage flare-ups without stopping activity", "مدیریت عودها بدون کنار گذاشتن فعالیت"),
        ],
        exercises: ["ex_split_squat", "ex_balance_reach", "ex_walking_program"],
        other: [L("Community exercise or cycling / swimming", "ورزش در اجتماع یا دوچرخه‌سواری / شنا")],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, KOOS, OARSI_TESTS],
    watchFor: [
      L("Hot, swollen joint or systemic symptoms", "مفصل داغ و متورم یا علائم سیستمیک"),
      L("Rapid loss of function or night pain at rest", "افت سریع عملکرد یا درد شبانه در حال استراحت"),
    ],
    references: [
      "NICE. Osteoarthritis in over 16s: diagnosis and management (NG226). National Institute for Health and Care Excellence; 2022.",
      "Bannuru RR, et al. OARSI guidelines for the non-surgical management of knee, hip, and polyarticular osteoarthritis. Osteoarthritis Cartilage. 2019;27(11):1578–1589.",
      "Kolasinski SL, et al. 2019 American College of Rheumatology/Arthritis Foundation Guideline for the Management of Osteoarthritis of the Hand, Hip, and Knee. Arthritis Care Res. 2020;72(2):149–162.",
      "Skou ST, Roos EM. Good Life with osteoArthritis in Denmark (GLA:D™): evidence-based education and supervised neuromuscular exercise delivered by certified physiotherapists nationwide. BMC Musculoskelet Disord. 2017;18:72.",
    ],
  },
  {
    id: "meniscus",
    region: "knee",
    hypotheses: ["k_meniscus"],
    title: L("Meniscal lesion (non-operative)", "ضایعه منیسک (درمان غیرجراحی)"),
    summary: L(
      "For degenerative lesions, non-operative care including supervised exercise therapy plus a home program is the first approach (2024 EU-US meniscus consensus); surgery is considered only if symptoms persist despite it. A truly locked knee needs orthopaedic review.",
      "برای ضایعات دژنراتیو، درمان غیرجراحی شامل تمرین‌درمانی تحت نظارت همراه برنامه خانگی، رویکرد اول است (اجماع منیسک اروپا-آمریکا ۲۰۲۴)؛ جراحی فقط در صورت ماندگاری علائم با وجود این درمان بررسی می‌شود. زانوی واقعاً قفل‌شده نیاز به ارزیابی ارتوپدی دارد."
    ),
    principles: [
      L("Restore range, reduce effusion, then build strength and control.", "ابتدا دامنه حرکتی و کاهش افیوژن، سپس قدرت و کنترل."),
      L("Avoid deep loaded flexion with twisting early on.", "در ابتدا از خم شدن عمیق همراه با چرخش و بار خودداری شود."),
      L("Give non-operative care a fair trial, typically at least 3 months, before a surgical opinion for persistent symptoms.", "پیش از نظر جراحی برای علائم ماندگار، درمان غیرجراحی به اندازه کافی امتحان شود؛ معمولاً دست‌کم ۳ ماه."),
    ],
    phases: [
      {
        id: "calm",
        name: L("Calm the joint and restore range", "آرام کردن مفصل و بازگرداندن دامنه"),
        typical: L("Usually 1–3 weeks", "معمولاً ۱ تا ۳ هفته"),
        goals: [
          L("Reduce effusion and pain", "کاهش افیوژن و درد"),
          L("Full extension and comfortable flexion", "اکستنشن کامل و فلکشن راحت"),
        ],
        exercises: ["ex_quad_sets", "ex_heel_prop", "ex_heel_slides", "ex_slr", "ex_ankle_pumps"],
        other: [L("Activity modification; avoid deep squatting and pivoting", "تعدیل فعالیت؛ پرهیز از اسکوات عمیق و چرخش روی پا")],
        progressWhen: [
          L("Minimal effusion", "افیوژن ناچیز"),
          L("Full active extension without lag", "اکستنشن فعال کامل بدون تأخیر (لگ)"),
        ],
      },
      {
        id: "strength",
        name: L("Strength and neuromuscular control", "تقویت و کنترل عصبی‌عضلانی"),
        typical: L("Usually 6–12 weeks", "معمولاً ۶ تا ۱۲ هفته"),
        goals: [L("Restore quadriceps and hip strength", "بازگرداندن قدرت چهارسر و لگن"), L("Single-leg stability", "ثبات تک‌پا")],
        exercises: ["ex_terminal_knee_ext", "ex_sit_to_stand", "ex_step_up", "ex_wall_sit", "ex_ankle_balance", "ex_glute_med_sidelying"],
        other: [L("Gradual return to walking volume and stairs", "بازگشت تدریجی به حجم راه رفتن و پله")],
        progressWhen: [
          L("No effusion after sessions", "عدم افیوژن پس از جلسات"),
          L("Single-leg squat to 45° with good control", "اسکوات تک‌پا تا ۴۵ درجه با کنترل خوب"),
        ],
      },
      {
        id: "return",
        name: L("Return to sport or full activity", "بازگشت به ورزش یا فعالیت کامل"),
        typical: L("Usually from week 8–12", "معمولاً از هفته ۸ تا ۱۲"),
        goals: [L("Tolerate pivoting and impact as required", "تحمل چرخش و ضربه به میزان لازم")],
        exercises: ["ex_split_squat", "ex_single_leg_squat", "ex_balance_reach", "ex_hop_progression"],
        other: [L("Sport-specific drills with gradual exposure", "تمرین‌های ویژه ورزش با مواجهه تدریجی")],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, KOOS, PSFS],
    watchFor: [
      L("True mechanical locking (knee cannot fully straighten): orthopaedic review", "قفل مکانیکی واقعی (زانو کامل صاف نمی‌شود): ارجاع ارتوپدی"),
      L("Recurrent effusion with each progression", "افیوژن مکرر با هر مرحله پیشرفت"),
    ],
    references: [
      "Logerstedt DS, et al. Knee Pain and Mobility Impairments: Meniscal and Articular Cartilage Lesions Revision 2018. J Orthop Sports Phys Ther. 2018;48(2):A1–A50.",
      "Prill R, et al. The formal EU-US Meniscus Rehabilitation 2024 Consensus: an ESSKA-AOSSM-AASPT initiative. Part II — Prevention, non-operative treatment and return to sport. Knee Surg Sports Traumatol Arthrosc. 2025. doi:10.1002/ksa.12689.",
      "Noorduyn JCA, et al. Effect of physical therapy vs arthroscopic partial meniscectomy in people with degenerative meniscal tears: five-year follow-up of the ESCAPE randomized clinical trial. JAMA Netw Open. 2022;5(7):e2220394.",
      "Kise NJ, et al. Exercise therapy versus arthroscopic partial meniscectomy for degenerative meniscal tear in middle aged patients: randomised controlled superiority trial with two year follow-up. BMJ. 2016;354:i3740.",
    ],
  },
  {
    id: "acl",
    region: "knee",
    hypotheses: ["k_acl"],
    title: L("ACL injury (rehabilitation)", "آسیب ACL (توان‌بخشی)"),
    summary: L(
      "Criteria-based rehabilitation for ACL injury, whether managed with exercise alone or before and after reconstruction. The surgeon's protocol takes priority after surgery.",
      "توان‌بخشی معیارمحور برای آسیب ACL، چه درمان فقط با تمرین باشد چه پیش و پس از بازسازی. پس از جراحی، پروتکل جراح در اولویت است."
    ),
    principles: [
      L("Progress by criteria, not by time alone.", "پیشرفت بر اساس معیار، نه فقط زمان."),
      L("Return to pivoting sport after passing strength and hop criteria, and not before about 9 months after reconstruction.", "بازگشت به ورزش‌های چرخشی پس از گذراندن معیارهای قدرت و پرش و نه زودتر از حدود ۹ ماه پس از بازسازی."),
      L("Shared decision on surgery versus rehabilitation alone, with orthopaedic input; rehabilitation with optional delayed reconstruction is a valid first option for many (KANON trial).", "تصمیم مشترک درباره جراحی یا توان‌بخشی تنها، با نظر ارتوپد؛ برای بسیاری، توان‌بخشی با امکان بازسازی تأخیری گزینه اول معتبری است (کارآزمایی KANON)."),
      L("Return to running only after controlled jumping and landing are mastered (commonly around 12 weeks after reconstruction, range 8–16).", "بازگشت به دویدن فقط پس از تسلط بر پرش و فرود کنترل‌شده (معمولاً حدود ۱۲ هفته پس از بازسازی، بین ۸ تا ۱۶ هفته)."),
    ],
    phases: [
      {
        id: "early",
        name: L("Early: swelling, extension and quadriceps", "مرحله اولیه: ورم، اکستنشن و چهارسر"),
        typical: L("Usually 2–6 weeks", "معمولاً ۲ تا ۶ هفته"),
        goals: [
          L("Full extension and reduced effusion", "اکستنشن کامل و کاهش افیوژن"),
          L("Normal gait and quadriceps activation", "راه رفتن طبیعی و فعال‌سازی چهارسر"),
        ],
        exercises: ["ex_quad_sets", "ex_heel_prop", "ex_heel_slides", "ex_slr", "ex_ankle_pumps", "ex_terminal_knee_ext"],
        other: [L("Follow the surgeon's restrictions after reconstruction", "پس از بازسازی، محدودیت‌های جراح رعایت شود")],
        progressWhen: [
          L("Full extension and at least 120° flexion", "اکستنشن کامل و فلکشن دست‌کم ۱۲۰ درجه"),
          L("Straight leg raise without extension lag", "بالا آوردن پای صاف بدون تأخیر اکستنشن"),
          L("Minimal effusion", "افیوژن ناچیز"),
        ],
      },
      {
        id: "strength",
        name: L("Strength and neuromuscular control", "تقویت و کنترل عصبی‌عضلانی"),
        typical: L("Usually 2–4 months", "معمولاً ۲ تا ۴ ماه"),
        goals: [
          L("Build quadriceps and hamstring strength", "افزایش قدرت چهارسر و همسترینگ"),
          L("Single-leg control and balance", "کنترل و تعادل تک‌پا"),
        ],
        exercises: ["ex_sit_to_stand", "ex_wall_sit", "ex_step_up", "ex_step_down", "ex_split_squat", "ex_ankle_balance", "ex_balance_reach"],
        other: [L("Begin running only when strength and hop criteria allow", "شروع دویدن فقط وقتی معیارهای قدرت و پرش اجازه دهند")],
        progressWhen: [
          L("Quadriceps strength at least 70–80% of the other side", "قدرت چهارسر دست‌کم ۷۰ تا ۸۰٪ سمت مقابل"),
          L("Pain-free jogging without effusion", "دویدن آرام بدون درد و بدون افیوژن"),
        ],
      },
      {
        id: "return",
        name: L("Plyometrics and return to sport", "پلایومتریک و بازگشت به ورزش"),
        typical: L("Usually from month 4–6; pivoting sport after passing criteria", "معمولاً از ماه ۴ تا ۶؛ ورزش‌های چرخشی پس از گذراندن معیارها"),
        goals: [
          L("Hop and change-of-direction capacity", "توانایی پرش و تغییر جهت"),
          L("Psychological readiness (for example ACL-RSI)", "آمادگی روانی (مثلاً پرسشنامه ACL-RSI)"),
          L("Quadriceps and hamstring strength symmetry close to 100% before high-demand pivoting sport", "تقارن قدرت چهارسر و همسترینگ نزدیک به ۱۰۰٪ پیش از ورزش‌های چرخشی پرتقاضا"),
        ],
        exercises: ["ex_single_leg_squat", "ex_hop_progression", "ex_copenhagen_short"],
        other: [
          L("Sport-specific drills and an ongoing injury-prevention program", "تمرین‌های ویژه ورزش و برنامه پیشگیری از آسیب ادامه‌دار"),
        ],
        progressWhen: [],
      },
    ],
    outcomes: [KOOS, STRENGTH_LSI, HOP_LSI],
    watchFor: [
      L("Recurrent giving way during rehabilitation", "خالی کردن مکرر زانو در طول توان‌بخشی"),
      L("Persistent effusion or loss of extension", "افیوژن پایدار یا از دست رفتن اکستنشن"),
      L("Calf pain or swelling after surgery (exclude DVT)", "درد یا ورم ساق پس از جراحی (رد ترومبوز ورید عمقی)"),
    ],
    references: [
      "Kotsifaki R, et al. Aspetar clinical practice guideline on rehabilitation after anterior cruciate ligament reconstruction. Br J Sports Med. 2023;57(9):500–514.",
      "Frobell RB, et al. A randomized trial of treatment for acute anterior cruciate ligament tears. N Engl J Med. 2010;363(4):331–342.",
      "van Melick N, et al. Evidence-based clinical practice update: practice guidelines for anterior cruciate ligament rehabilitation based on a systematic review and multidisciplinary consensus. Br J Sports Med. 2016;50(24):1506–1515.",
      "Grindem H, et al. Simple decision rules can reduce reinjury risk by 84% after ACL reconstruction: the Delaware-Oslo ACL cohort study. Br J Sports Med. 2016;50(13):804–808.",
    ],
  },
  {
    id: "mcl",
    region: "knee",
    hypotheses: ["k_mcl"],
    title: L("Medial collateral ligament sprain", "پیچ‌خوردگی رباط جانبی داخلی (MCL)"),
    summary: L(
      "Isolated MCL sprains usually heal with early protected motion and progressive loading; grade III or combined injuries need medical review.",
      "پیچ‌خوردگی‌های ایزوله MCL معمولاً با حرکت محافظت‌شده زودهنگام و بارگذاری تدریجی بهبود می‌یابند؛ درجه ۳ یا آسیب‌های همراه نیاز به ارزیابی پزشکی دارند."
    ),
    principles: [
      L("Early motion within comfort; protect from valgus stress.", "حرکت زودهنگام در محدوده راحت؛ محافظت در برابر فشار والگوس."),
      L("A hinged brace may be used for higher-grade sprains.", "برای پیچ‌خوردگی‌های شدیدتر ممکن است بریس مفصل‌دار استفاده شود."),
    ],
    phases: [
      {
        id: "protect",
        name: L("Protected motion", "حرکت محافظت‌شده"),
        typical: L("Usually 1–2 weeks", "معمولاً ۱ تا ۲ هفته"),
        goals: [L("Control pain and swelling", "کنترل درد و ورم"), L("Restore range of motion", "بازگرداندن دامنه حرکتی")],
        exercises: ["ex_quad_sets", "ex_heel_slides", "ex_slr", "ex_ankle_pumps"],
        other: [L("Weight bearing as tolerated; brace if prescribed", "تحمل وزن در حد تحمل؛ بریس در صورت تجویز")],
        progressWhen: [L("Normal gait", "راه رفتن طبیعی"), L("Near-full range of motion", "دامنه حرکتی تقریباً کامل")],
      },
      {
        id: "strength",
        name: L("Strength and control", "تقویت و کنترل"),
        typical: L("Usually 2–6 weeks", "معمولاً ۲ تا ۶ هفته"),
        goals: [L("Restore strength and balance", "بازگرداندن قدرت و تعادل")],
        exercises: ["ex_sit_to_stand", "ex_step_up", "ex_wall_sit", "ex_split_squat", "ex_ankle_balance", "ex_monster_walk"],
        other: [],
        progressWhen: [L("No pain on valgus stress test", "عدم درد در تست استرس والگوس"), L("Pain-free jogging", "دویدن آرام بدون درد")],
      },
      {
        id: "return",
        name: L("Return to sport", "بازگشت به ورزش"),
        typical: L("Often 3–8 weeks after injury, by grade", "اغلب ۳ تا ۸ هفته پس از آسیب، بسته به درجه"),
        goals: [L("Cutting and pivoting without symptoms", "تغییر جهت و چرخش بدون علامت")],
        exercises: ["ex_single_leg_squat", "ex_balance_reach", "ex_hop_progression", "ex_copenhagen_short"],
        other: [L("Sport-specific drills", "تمرین‌های ویژه ورزش")],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, KOOS, HOP_LSI],
    watchFor: [L("Gross valgus laxity or suspected combined ACL injury", "شلی شدید والگوس یا احتمال آسیب همزمان ACL")],
    references: [
      "Logerstedt DS, et al. Knee Stability and Movement Coordination Impairments: Knee Ligament Sprain Revision 2017. J Orthop Sports Phys Ther. 2017;47(11):A1–A47.",
    ],
  },
  {
    id: "patellar_tendinopathy",
    region: "knee",
    hypotheses: ["k_patellar_tendinopathy"],
    title: L("Patellar tendinopathy", "تاندینوپاتی کشکک"),
    summary: L(
      "Progressive tendon loading — isometric, then heavy slow resistance, energy storage and return to jumping — guided by pain monitoring.",
      "بارگذاری پیشرونده تاندون — ایزومتریک، سپس مقاومتی سنگین و آهسته، ذخیره انرژی و بازگشت به پرش — با راهنمایی پایش درد."
    ),
    principles: [
      L("Tendons respond to load; complete rest is not recommended.", "تاندون به بار پاسخ می‌دهد؛ استراحت کامل توصیه نمی‌شود."),
      L("Monitor pain on a provocation test (for example single-leg decline squat) the next day.", "درد را روز بعد با یک تست تحریکی (مثل اسکوات تک‌پا روی سطح شیبدار) پایش کنید."),
      L("Reduce jumping volume temporarily rather than stopping sport entirely.", "حجم پرش را موقتاً کم کنید به‌جای کنار گذاشتن کامل ورزش."),
      L("Progressive tendon loading kept at pain of 3/10 or less was at least as effective as, and less painful than, eccentric decline squats (Breda 2021).", "بارگذاری پیشرونده تاندون با درد ۳ از ۱۰ یا کمتر دست‌کم به اندازه اسکوات اکسنتریک روی سطح شیبدار مؤثر و کم‌دردتر بود (Breda، ۲۰۲۱)."),
    ],
    phases: [
      {
        id: "isometric",
        name: L("Isometric loading for pain relief", "بارگذاری ایزومتریک برای کاهش درد"),
        typical: L("Usually 1–3 weeks", "معمولاً ۱ تا ۳ هفته"),
        goals: [L("Reduce pain", "کاهش درد"), L("Start quadriceps loading", "شروع بارگذاری چهارسر")],
        exercises: ["ex_spanish_squat", "ex_wall_sit", "ex_quad_sets"],
        other: [L("Reduce jumping and sprinting volume temporarily", "کاهش موقت حجم پرش و دوی سرعت")],
        progressWhen: [L("Pain of 3/10 or less on the provocation test", "درد ۳ از ۱۰ یا کمتر در تست تحریکی")],
      },
      {
        id: "isotonic",
        name: L("Heavy slow resistance", "مقاومتی سنگین و آهسته"),
        typical: L("Usually 6–12 weeks", "معمولاً ۶ تا ۱۲ هفته"),
        goals: [L("Build strength and tendon capacity", "افزایش قدرت و ظرفیت تاندون")],
        exercises: ["ex_sit_to_stand", "ex_split_squat", "ex_step_up", "ex_single_leg_squat", "ex_glute_bridge"],
        other: [L("Slow tempo (about 3 s each way), every second day", "ریتم آهسته (حدود ۳ ثانیه در هر جهت)، یک روز در میان")],
        progressWhen: [
          L("Single-leg loading with minimal pain", "بارگذاری تک‌پا با درد ناچیز"),
          L("Improving VISA-P", "بهبود VISA-P"),
        ],
      },
      {
        id: "energy",
        name: L("Energy storage and return to jumping", "ذخیره انرژی و بازگشت به پرش"),
        typical: L("Usually from week 8–12", "معمولاً از هفته ۸ تا ۱۲"),
        goals: [L("Tolerate jumping and landing", "تحمل پرش و فرود"), L("Return to training and competition", "بازگشت به تمرین و مسابقه")],
        exercises: ["ex_hop_progression", "ex_balance_reach"],
        other: [L("Graded jumping volume, then sport-specific drills", "حجم پرش تدریجی و سپس تمرین‌های ویژه ورزش")],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, VISA_P, PSFS],
    watchFor: [L("Pain at rest or at night, or sudden loss of knee extension strength", "درد در حال استراحت یا شبانه، یا افت ناگهانی قدرت باز کردن زانو")],
    references: [
      "Breda SJ, et al. Effectiveness of progressive tendon-loading exercise therapy in patients with patellar tendinopathy: a randomised clinical trial. Br J Sports Med. 2021;55(9):501–509.",
      "Malliaras P, et al. Patellar Tendinopathy: Clinical Diagnosis, Load Management, and Advice for Challenging Case Presentations. J Orthop Sports Phys Ther. 2015;45(11):887–898.",
    ],
  },
];
