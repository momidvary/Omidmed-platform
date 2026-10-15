import { FAAM, HEEL_RAISE, HIT6, LEFS, NDI, NPRS, PSFS, SHOULDER_ROM, SPADI, VISA_A } from "@/lib/clinical/protocols/outcomes";
import { L, type Protocol } from "@/lib/clinical/protocols/types";

export const neckProtocols: Protocol[] = [
  {
    id: "neck_mechanical",
    region: "neck",
    hypotheses: ["n_mechanical", "n_wad"],
    title: L("Neck pain with mobility deficits / whiplash", "گردن‌درد با محدودیت حرکتی / ویپلش"),
    summary: L(
      "Advice to stay active, cervical and thoracic manual therapy combined with exercise (deep neck flexor, scapular and general strengthening). After whiplash, reassurance and early return to normal activity.",
      "توصیه به فعال ماندن، درمان دستی گردن و پشتی همراه با تمرین (عضلات عمقی گردن، کتف و تقویت عمومی). پس از ویپلش، اطمینان‌بخشی و بازگشت زودهنگام به فعالیت عادی."
    ),
    principles: [
      L("Manual therapy works best combined with exercise.", "درمان دستی همراه با تمرین بهترین اثر را دارد."),
      L("After whiplash, avoid collars and prolonged rest; normalise movement early.", "پس از ویپلش، از گردن‌بند و استراحت طولانی پرهیز و حرکت را زود عادی کنید."),
    ],
    phases: [
      {
        id: "settle",
        name: L("Settle and restore movement", "آرام کردن و بازگرداندن حرکت"),
        typical: L("Usually 1–3 weeks", "معمولاً ۱ تا ۳ هفته"),
        goals: [L("Reduce pain", "کاهش درد"), L("Restore comfortable range", "بازگرداندن دامنه راحت")],
        exercises: ["ex_cervical_rotation", "ex_dnf", "ex_neck_isometrics", "ex_scap_retraction"],
        other: [L("Thoracic and cervical mobilisation or manipulation if appropriate", "موبیلیزاسیون یا مانیپولاسیون پشتی و گردنی در صورت مناسب بودن"), L("Desk and sleep position advice", "توصیه درباره وضعیت پشت میز و خواب")],
        progressWhen: [L("Rotation range improving with little pain", "بهبود دامنه چرخش با درد کم")],
      },
      {
        id: "strength",
        name: L("Neck and scapular strength", "تقویت گردن و کتف"),
        typical: L("Usually 4–8 weeks", "معمولاً ۴ تا ۸ هفته"),
        goals: [L("Deep neck flexor endurance", "استقامت عضلات عمقی گردن"), L("Scapular strength", "قدرت عضلات کتف")],
        exercises: ["ex_dnf_head_lift", "ex_row_band", "ex_prone_t", "ex_wall_pushup_plus", "ex_upper_trap_stretch"],
        other: [],
        progressWhen: [L("Improving NDI and daily function", "بهبود NDI و عملکرد روزانه")],
      },
      {
        id: "maintain",
        name: L("Self-management", "خودمدیریتی"),
        typical: L("Ongoing", "ادامه‌دار"),
        goals: [L("Independent exercise and regular activity", "تمرین مستقل و فعالیت منظم")],
        exercises: ["ex_row_band", "ex_scap_control", "ex_walking_program"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, NDI, PSFS],
    watchFor: [
      L("Dizziness, diplopia, dysarthria, dysphagia or drop attacks (vascular screening)", "سرگیجه، دوبینی، اختلال گفتار یا بلع، یا افتادن ناگهانی (غربالگری عروقی)"),
      L("Signs of myelopathy (clumsy hands, gait change)", "علائم میلوپاتی (بی‌دست‌وپایی دست‌ها، تغییر راه رفتن)"),
      L("After trauma: Canadian C-spine rule before treatment", "پس از ضربه: قانون کانادایی ستون گردنی پیش از درمان"),
    ],
    references: [
      "Blanpied PR, et al. Neck Pain: Revision 2017. Clinical Practice Guidelines Linked to the International Classification of Functioning, Disability and Health From the Orthopaedic Section of the American Physical Therapy Association. J Orthop Sports Phys Ther. 2017;47(7):A1–A83.",
    ],
  },
  {
    id: "cervical_radiculopathy",
    region: "neck",
    hypotheses: ["n_radiculopathy"],
    title: L("Cervical radiculopathy", "رادیکولوپاتی گردنی"),
    summary: L(
      "Mobilising and stabilising exercise, manual therapy and neural mobilisation, with intermittent traction as an option, and close neurological monitoring.",
      "تمرین تحرکی و ثبات‌دهنده، درمان دستی و موبیلیزاسیون عصبی، با کشش متناوب به‌عنوان گزینه، همراه با پایش دقیق عصبی."
    ),
    principles: [
      L("Choose positions and movements that ease arm symptoms.", "وضعیت‌ها و حرکاتی انتخاب شوند که علائم دست را کم می‌کنند."),
      L("Neural sliders should be gentle and symptom-free.", "لغزاندن عصب باید ملایم و بدون علامت باشد."),
    ],
    phases: [
      {
        id: "settle",
        name: L("Settle arm symptoms", "آرام کردن علائم دست"),
        typical: L("Usually 2–4 weeks", "معمولاً ۲ تا ۴ هفته"),
        goals: [L("Reduce arm pain and paraesthesia", "کاهش درد و گزگز دست")],
        exercises: ["ex_dnf", "ex_scap_retraction", "ex_median_nerve_slider", "ex_cervical_rotation"],
        other: [L("Intermittent cervical traction may be considered", "کشش متناوب گردن قابل بررسی است"), L("Thoracic mobilisation", "موبیلیزاسیون پشتی")],
        progressWhen: [L("Arm symptoms reducing; neurological examination stable", "کاهش علائم دست؛ معاینه عصبی پایدار")],
      },
      {
        id: "strength",
        name: L("Strength and endurance", "تقویت و استقامت"),
        typical: L("Usually 4–8 weeks", "معمولاً ۴ تا ۸ هفته"),
        goals: [L("Neck and scapular strength", "قدرت گردن و کتف")],
        exercises: ["ex_dnf_head_lift", "ex_row_band", "ex_prone_t", "ex_wall_pushup_plus"],
        other: [],
        progressWhen: [L("Arm symptoms minimal with daily tasks", "علائم دست در کارهای روزانه ناچیز")],
      },
      {
        id: "maintain",
        name: L("Return to full activity", "بازگشت به فعالیت کامل"),
        typical: L("Usually from week 8", "معمولاً از هفته ۸"),
        goals: [L("Work and leisure demands", "نیازهای کار و اوقات فراغت")],
        exercises: ["ex_row_band", "ex_scap_control"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, NDI, PSFS],
    watchFor: [
      L("Progressive weakness or signs of myelopathy: urgent medical review", "ضعف پیشرونده یا علائم میلوپاتی: ارجاع فوری پزشکی"),
    ],
    references: [
      "Blanpied PR, et al. Neck Pain: Revision 2017. J Orthop Sports Phys Ther. 2017;47(7):A1–A83.",
    ],
  },
  {
    id: "cervicogenic_headache",
    region: "neck",
    hypotheses: ["n_cgh"],
    title: L("Cervicogenic headache", "سردرد با منشأ گردنی"),
    summary: L(
      "Combined cervical manual therapy and low-load exercise for the deep neck flexors and scapular muscles reduces headache frequency and intensity.",
      "ترکیب درمان دستی گردن و تمرین کم‌بار عضلات عمقی گردن و کتف، تعداد و شدت سردرد را کاهش می‌دهد."
    ),
    principles: [L("Low-load, high-precision motor control training.", "تمرین کنترل حرکتی کم‌بار و دقیق.")],
    phases: [
      {
        id: "start",
        name: L("Manual therapy and motor control", "درمان دستی و کنترل حرکتی"),
        typical: L("Usually 2–4 weeks", "معمولاً ۲ تا ۴ هفته"),
        goals: [L("Reduce headache frequency", "کاهش تعداد سردرد"), L("Deep neck flexor control", "کنترل عضلات عمقی گردن")],
        exercises: ["ex_dnf", "ex_cervical_rotation", "ex_scap_retraction"],
        other: [L("Upper cervical mobilisation", "موبیلیزاسیون گردن فوقانی"), L("Headache diary", "دفترچه ثبت سردرد")],
        progressWhen: [L("Fewer headache days", "کاهش تعداد روزهای سردرد")],
      },
      {
        id: "strength",
        name: L("Endurance and postural load", "استقامت و تحمل وضعیتی"),
        typical: L("Usually 4–6 weeks", "معمولاً ۴ تا ۶ هفته"),
        goals: [L("Endurance for sustained postures", "استقامت در وضعیت‌های طولانی")],
        exercises: ["ex_dnf_head_lift", "ex_row_band", "ex_prone_t", "ex_upper_trap_stretch"],
        other: [],
        progressWhen: [L("Headache frequency at least halved", "دست‌کم نصف شدن تعداد سردردها")],
      },
      {
        id: "maintain",
        name: L("Self-management", "خودمدیریتی"),
        typical: L("Ongoing", "ادامه‌دار"),
        goals: [L("Maintain gains independently", "حفظ نتایج به‌صورت مستقل")],
        exercises: ["ex_dnf", "ex_row_band"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [HIT6, NDI, NPRS],
    watchFor: [
      L("New, sudden or worst-ever headache, neurological signs or headache with fever: urgent medical review", "سردرد جدید، ناگهانی یا بدترین سردرد عمر، علائم عصبی یا سردرد همراه تب: ارجاع فوری پزشکی"),
    ],
    references: [
      "Jull G, et al. A randomized controlled trial of exercise and manipulative therapy for cervicogenic headache. Spine. 2002;27(17):1835–1843.",
      "Blanpied PR, et al. Neck Pain: Revision 2017. J Orthop Sports Phys Ther. 2017;47(7):A1–A83.",
    ],
  },
];

export const shoulderProtocols: Protocol[] = [
  {
    id: "rcrsp",
    region: "shoulder",
    hypotheses: ["s_rcrsp"],
    title: L("Rotator cuff related shoulder pain", "درد شانه مرتبط با روتاتور کاف"),
    summary: L(
      "Progressive exercise for the rotator cuff and scapular muscles over at least 12 weeks is the core treatment; surgery offers no clear advantage over exercise for most.",
      "تمرین پیشرونده روتاتور کاف و عضلات کتف دست‌کم به مدت ۱۲ هفته درمان اصلی است؛ برای بیشتر بیماران جراحی برتری واضحی بر تمرین ندارد."
    ),
    principles: [
      L("Some pain during exercise is acceptable if it settles by the next day.", "کمی درد حین تمرین قابل قبول است اگر تا روز بعد برطرف شود."),
      L("Progress load and range gradually toward overhead tasks.", "بار و دامنه به تدریج به سمت فعالیت‌های بالای سر افزایش یابد."),
    ],
    phases: [
      {
        id: "settle",
        name: L("Settle and start loading", "آرام کردن و شروع بارگذاری"),
        typical: L("Usually 2–4 weeks", "معمولاً ۲ تا ۴ هفته"),
        goals: [L("Reduce pain", "کاهش درد"), L("Start rotator cuff loading below shoulder height", "شروع بارگذاری روتاتور کاف زیر سطح شانه")],
        exercises: ["ex_ext_rotation", "ex_scap_retraction", "ex_shoulder_flexion_aaro", "ex_pendulum"],
        other: [L("Modify provocative overhead activity", "تعدیل فعالیت‌های بالای سر که درد ایجاد می‌کنند")],
        progressWhen: [L("Pain-free isometric rotation", "چرخش ایزومتریک بدون درد")],
      },
      {
        id: "strength",
        name: L("Progressive strengthening", "تقویت پیشرونده"),
        typical: L("Usually 6–12 weeks", "معمولاً ۶ تا ۱۲ هفته"),
        goals: [L("Rotator cuff and scapular strength", "قدرت روتاتور کاف و کتف")],
        exercises: ["ex_er_band", "ex_ir_band", "ex_row_band", "ex_sidelying_er", "ex_wall_pushup_plus", "ex_scap_control"],
        other: [],
        progressWhen: [L("Strength and pain improving; SPADI improving", "بهبود قدرت و درد؛ بهبود SPADI")],
      },
      {
        id: "overhead",
        name: L("Overhead and functional loading", "بارگذاری بالای سر و عملکردی"),
        typical: L("Usually from week 8–12", "معمولاً از هفته ۸ تا ۱۲"),
        goals: [L("Return to work, sport and overhead tasks", "بازگشت به کار، ورزش و فعالیت‌های بالای سر")],
        exercises: ["ex_prone_t", "ex_sidelying_er", "ex_cross_body_stretch"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, SPADI, PSFS],
    watchFor: [
      L("Marked weakness after trauma (possible acute tear): early orthopaedic review", "ضعف واضح پس از ضربه (احتمال پارگی حاد): ارجاع زودهنگام ارتوپدی"),
      L("Neck-related arm symptoms", "علائم دست با منشأ گردنی"),
    ],
    references: [
      "Lewis J. Rotator cuff related shoulder pain: Assessment, management and uncertainties. Man Ther. 2016;23:57–68.",
      "Pieters L, et al. An Update of Systematic Reviews Examining the Effectiveness of Conservative Physical Therapy Interventions for Subacromial Shoulder Pain. J Orthop Sports Phys Ther. 2020;50(3):131–141.",
    ],
  },
  {
    id: "frozen_shoulder",
    region: "shoulder",
    hypotheses: ["s_frozen"],
    title: L("Frozen shoulder (adhesive capsulitis)", "شانه منجمد (کپسولیت چسبنده)"),
    summary: L(
      "Education about the natural course, stretching matched to irritability, and mobilisation; an intra-articular corticosteroid injection combined with exercise can help in the painful phase.",
      "آموزش درباره سیر طبیعی، کشش متناسب با تحریک‌پذیری و موبیلیزاسیون؛ در مرحله دردناک، تزریق کورتون داخل مفصلی همراه با تمرین می‌تواند کمک کند."
    ),
    principles: [
      L("Match stretching intensity to irritability: gentle in the painful phase.", "شدت کشش متناسب با تحریک‌پذیری: در مرحله دردناک ملایم."),
      L("Recovery usually takes months; set expectations early.", "بهبود معمولاً ماه‌ها طول می‌کشد؛ انتظارات از ابتدا روشن شود."),
    ],
    phases: [
      {
        id: "painful",
        name: L("Painful (high irritability)", "مرحله دردناک (تحریک‌پذیری بالا)"),
        typical: L("Often weeks to months", "اغلب چند هفته تا چند ماه"),
        goals: [L("Pain relief and sleep", "کاهش درد و خواب بهتر"), L("Maintain available range", "حفظ دامنه موجود")],
        exercises: ["ex_pendulum", "ex_shoulder_flexion_aaro", "ex_scap_retraction"],
        other: [L("Discuss injection with the medical team if pain is severe", "در صورت درد شدید، گفت‌وگو درباره تزریق با تیم پزشکی")],
        progressWhen: [L("Night pain easing", "کاهش درد شبانه")],
      },
      {
        id: "stiff",
        name: L("Stiffness (lower irritability)", "مرحله خشکی (تحریک‌پذیری کمتر)"),
        typical: L("Often several months", "اغلب چند ماه"),
        goals: [L("Increase range with longer, firmer stretches", "افزایش دامنه با کشش‌های طولانی‌تر و محکم‌تر")],
        exercises: ["ex_shoulder_flexion_aaro", "ex_cross_body_stretch", "ex_ext_rotation", "ex_er_band"],
        other: [L("Joint mobilisation", "موبیلیزاسیون مفصلی")],
        progressWhen: [L("External rotation and elevation clearly improving", "بهبود واضح چرخش خارجی و بالا بردن دست")],
      },
      {
        id: "recover",
        name: L("Recovery and strength", "بهبود و تقویت"),
        typical: L("Until function is restored", "تا بازگشت عملکرد"),
        goals: [L("Strength and full function", "قدرت و عملکرد کامل")],
        exercises: ["ex_row_band", "ex_sidelying_er", "ex_wall_pushup_plus", "ex_scap_control"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, SPADI, SHOULDER_ROM],
    watchFor: [L("Uncontrolled diabetes or thyroid disease (coordinate with the physician)", "دیابت یا بیماری تیروئید کنترل‌نشده (هماهنگی با پزشک)")],
    references: [
      "Kelley MJ, et al. Shoulder Pain and Mobility Deficits: Adhesive Capsulitis. J Orthop Sports Phys Ther. 2013;43(5):A1–A31.",
    ],
  },
];

export const ankleProtocols: Protocol[] = [
  {
    id: "lateral_ankle_sprain",
    region: "ankle-foot",
    hypotheses: ["a_lateral_sprain"],
    title: L("Lateral ankle sprain", "پیچ‌خوردگی خارجی مچ پا"),
    summary: L(
      "Functional treatment — early weight bearing with external support, then exercise therapy including balance — is preferred to immobilisation; exercise reduces recurrence.",
      "درمان عملکردی — تحمل وزن زودهنگام با محافظ خارجی و سپس تمرین‌درمانی شامل تعادل — بر بی‌حرکتی ترجیح دارد؛ تمرین احتمال عود را کم می‌کند."
    ),
    principles: [
      L("Use the Ottawa ankle rules before treatment after acute injury.", "پس از آسیب حاد، قوانین اتاوا پیش از درمان بررسی شود."),
      L("Brace or tape during return to sport reduces re-injury.", "استفاده از بریس یا تیپ هنگام بازگشت به ورزش احتمال آسیب مجدد را کم می‌کند."),
    ],
    phases: [
      {
        id: "protect",
        name: L("Protection and early motion", "محافظت و حرکت زودهنگام"),
        typical: L("Usually up to 1–2 weeks", "معمولاً تا ۱ تا ۲ هفته"),
        goals: [L("Control swelling", "کنترل ورم"), L("Restore motion and weight bearing", "بازگرداندن حرکت و تحمل وزن")],
        exercises: ["ex_ankle_pumps", "ex_ankle_alphabet", "ex_ankle_band_4way"],
        other: [L("Elevation, compression and a brace or tape as needed", "بالا نگه‌داشتن، بانداژ و بریس یا تیپ در صورت نیاز")],
        progressWhen: [L("Walking without a limp", "راه رفتن بدون لنگیدن")],
      },
      {
        id: "strength",
        name: L("Strength and balance", "تقویت و تعادل"),
        typical: L("Usually 2–6 weeks", "معمولاً ۲ تا ۶ هفته"),
        goals: [L("Calf and evertor strength", "قدرت ساق و اورتورها"), L("Single-leg balance", "تعادل تک‌پا")],
        exercises: ["ex_calf_raise", "ex_ankle_balance", "ex_balance_reach", "ex_soleus_raise"],
        other: [],
        progressWhen: [L("Single-leg balance 30 s similar to the other side", "تعادل تک‌پا ۳۰ ثانیه، مشابه سمت مقابل"), L("Pain-free single-leg heel raises", "بالا رفتن روی پنجه تک‌پا بدون درد")],
      },
      {
        id: "return",
        name: L("Return to sport", "بازگشت به ورزش"),
        typical: L("Often 3–8 weeks after injury", "اغلب ۳ تا ۸ هفته پس از آسیب"),
        goals: [L("Hopping, cutting and landing", "پرش، تغییر جهت و فرود")],
        exercises: ["ex_hop_progression", "ex_single_leg_squat"],
        other: [L("Brace or tape for sport for several months; continue balance training", "بریس یا تیپ در ورزش برای چند ماه؛ ادامه تمرین تعادل")],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, FAAM, LEFS],
    watchFor: [
      L("Positive Ottawa ankle rules: imaging before loading", "مثبت بودن قوانین اتاوا: تصویربرداری پیش از بارگذاری"),
      L("Pain with squeeze or external rotation test (syndesmosis)", "درد در تست فشار یا چرخش خارجی (سیندسموز)"),
    ],
    references: [
      "Vuurberg G, et al. Diagnosis, treatment and prevention of ankle sprains: update of an evidence-based clinical guideline. Br J Sports Med. 2018;52(15):956.",
      "Martin RL, et al. Ankle Stability and Movement Coordination Impairments: Lateral Ankle Ligament Sprains Revision 2021. J Orthop Sports Phys Ther. 2021;51(4):CPG1–CPG80.",
    ],
  },
  {
    id: "achilles_tendinopathy",
    region: "ankle-foot",
    hypotheses: ["a_achilles_tendinopathy"],
    title: L("Mid-portion Achilles tendinopathy", "تاندینوپاتی بخش میانی آشیل"),
    summary: L(
      "Progressive calf loading (eccentric or heavy slow resistance) for at least 12 weeks with a pain-monitoring model; activity can usually continue.",
      "بارگذاری پیشرونده ساق (اکسنتریک یا مقاومتی سنگین و آهسته) دست‌کم ۱۲ هفته با مدل پایش درد؛ معمولاً می‌توان فعالیت را ادامه داد."
    ),
    principles: [
      L("Pain up to 5/10 during exercise is acceptable if it settles by the next morning.", "درد تا ۵ از ۱۰ حین تمرین قابل قبول است اگر تا صبح روز بعد برطرف شود."),
      L("Train both straight-knee (gastrocnemius) and bent-knee (soleus) positions.", "تمرین در هر دو حالت زانوی صاف (دوقلو) و زانوی خم (نعلی)."),
    ],
    phases: [
      {
        id: "settle",
        name: L("Load management and isometric / easy loading", "مدیریت بار و بارگذاری ایزومتریک / سبک"),
        typical: L("Usually 1–3 weeks", "معمولاً ۱ تا ۳ هفته"),
        goals: [L("Settle reactive pain", "آرام کردن درد واکنشی"), L("Start calf loading", "شروع بارگذاری ساق")],
        exercises: ["ex_calf_raise", "ex_soleus_raise", "ex_ankle_band_4way"],
        other: [L("Reduce running volume and hills temporarily", "کاهش موقت حجم دویدن و سربالایی")],
        progressWhen: [L("Morning stiffness settling", "کاهش خشکی صبحگاهی")],
      },
      {
        id: "strength",
        name: L("Progressive heavy loading", "بارگذاری سنگین پیشرونده"),
        typical: L("Usually 8–12 weeks", "معمولاً ۸ تا ۱۲ هفته"),
        goals: [L("Calf strength and tendon capacity", "قدرت ساق و ظرفیت تاندون")],
        exercises: ["ex_eccentric_heel_drop", "ex_soleus_raise", "ex_calf_raise", "ex_single_leg_bridge"],
        other: [L("Add load in a backpack as tolerated", "افزودن وزنه در کوله در حد تحمل")],
        progressWhen: [L("Single-leg heel raises near symmetrical", "تعداد بالا رفتن روی پنجه تک‌پا تقریباً متقارن"), L("Improving VISA-A", "بهبود VISA-A")],
      },
      {
        id: "return",
        name: L("Plyometrics and return to running", "پلایومتریک و بازگشت به دویدن"),
        typical: L("Usually from week 8–12", "معمولاً از هفته ۸ تا ۱۲"),
        goals: [L("Hopping and running without flare-up", "پرش و دویدن بدون عود")],
        exercises: ["ex_hop_progression", "ex_balance_reach"],
        other: [L("Graded return-to-running program", "برنامه تدریجی بازگشت به دویدن")],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, VISA_A, HEEL_RAISE],
    watchFor: [L("Sudden pain with a snap and loss of push-off (possible rupture): urgent review", "درد ناگهانی همراه صدا و از دست رفتن قدرت هل دادن (احتمال پارگی): ارجاع فوری")],
    references: [
      "Martin RL, et al. Achilles Pain, Stiffness, and Muscle Power Deficits: Midportion Achilles Tendinopathy Revision 2018. J Orthop Sports Phys Ther. 2018;48(5):A1–A38.",
      "Silbernagel KG, et al. Continued sports activity, using a pain-monitoring model, during rehabilitation in patients with Achilles tendinopathy: a randomized controlled study. Am J Sports Med. 2007;35(6):897–906.",
      "Alfredson H, et al. Heavy-load eccentric calf muscle training for the treatment of chronic Achilles tendinosis. Am J Sports Med. 1998;26(3):360–366.",
    ],
  },
  {
    id: "plantar_heel_pain",
    region: "ankle-foot",
    hypotheses: ["a_plantar_heel"],
    title: L("Plantar heel pain", "درد کف پاشنه"),
    summary: L(
      "Plantar fascia and calf stretching, education, foot orthoses or taping in the short term, and progressive strengthening including high-load heel raises.",
      "کشش فاسیای کف پا و ساق، آموزش، کفی یا تیپینگ در کوتاه‌مدت و تقویت پیشرونده از جمله بالا رفتن روی پنجه با بار زیاد."
    ),
    principles: [
      L("Stretch before the first steps in the morning.", "کشش پیش از اولین قدم‌های صبح."),
      L("Manage standing and walking load; supportive footwear.", "مدیریت بار ایستادن و راه رفتن؛ کفش مناسب."),
    ],
    phases: [
      {
        id: "settle",
        name: L("Settle and stretch", "آرام کردن و کشش"),
        typical: L("Usually 2–4 weeks", "معمولاً ۲ تا ۴ هفته"),
        goals: [L("Reduce first-step pain", "کاهش درد قدم‌های اول")],
        exercises: ["ex_plantar_fascia_stretch", "ex_calf_raise", "ex_short_foot"],
        other: [L("Taping or prefabricated orthoses in the short term", "تیپینگ یا کفی پیش‌ساخته در کوتاه‌مدت"), L("Night splint if morning pain persists", "آتل شبانه در صورت ماندگاری درد صبحگاهی")],
        progressWhen: [L("First-step pain clearly reducing", "کاهش واضح درد قدم‌های اول")],
      },
      {
        id: "strength",
        name: L("Progressive strengthening", "تقویت پیشرونده"),
        typical: L("Usually 6–12 weeks", "معمولاً ۶ تا ۱۲ هفته"),
        goals: [L("Calf and foot strength", "قدرت ساق و پا")],
        exercises: ["ex_soleus_raise", "ex_eccentric_heel_drop", "ex_short_foot", "ex_ankle_balance"],
        other: [L("High-load heel raises with the toes on a towel roll", "بالا رفتن روی پنجه با بار زیاد در حالی که انگشتان روی حوله لوله‌شده است")],
        progressWhen: [L("Walking and standing tolerated for daily needs", "تحمل راه رفتن و ایستادن در حد نیاز روزانه")],
      },
      {
        id: "return",
        name: L("Return to running and full activity", "بازگشت به دویدن و فعالیت کامل"),
        typical: L("Usually from week 8", "معمولاً از هفته ۸"),
        goals: [L("Running or work demands", "نیازهای دویدن یا کار")],
        exercises: ["ex_hop_progression", "ex_balance_reach"],
        other: [],
        progressWhen: [],
      },
    ],
    outcomes: [NPRS, FAAM, LEFS],
    watchFor: [L("Burning or numb heel (nerve entrapment) or pain at rest and night (other pathology)", "سوزش یا بی‌حسی پاشنه (گیر افتادن عصب) یا درد در استراحت و شب (پاتولوژی دیگر)")],
    references: [
      "Martin RL, et al. Heel Pain—Plantar Fasciitis: Revision 2014. J Orthop Sports Phys Ther. 2014;44(11):A1–A33.",
      "Rathleff MS, et al. High-load strength training improves outcome in patients with plantar fasciitis: A randomized controlled trial with 12-month follow-up. Scand J Med Sci Sports. 2015;25(3):e292–e300.",
    ],
  },
];
