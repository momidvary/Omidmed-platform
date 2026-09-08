-- Versioned patient-facing exercise snapshots and real calendar validation.
-- Run after 015_patient_onboarding_and_episode_lifecycle.sql.

begin;

-- --------------------------------------------------------------------------
-- 1) Only reviewed patient-ready exercises can enter a prescription. Each
--    prescription item retains the exact content shown at publication time.
-- --------------------------------------------------------------------------

create or replace function private.is_valid_patient_exercise_content(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_value ?& array[
      'name', 'purpose', 'howTo', 'commonMistakes', 'whenToStop'
    ]
    and (select count(*) = 5 from jsonb_object_keys(p_value))
    and char_length(btrim(p_value ->> 'name')) between 2 and 300
    and char_length(btrim(p_value ->> 'purpose')) between 3 and 2000
    and private.is_bounded_text_array(p_value -> 'howTo', 1, 20, 2000)
    and private.is_bounded_text_array(
      p_value -> 'commonMistakes', 1, 20, 1000
    )
    and char_length(btrim(p_value ->> 'whenToStop')) between 3 and 2000
    and pg_column_size(p_value) <= 32768,
    false
  );
$$;

create table if not exists public.exercise_catalog_versions (
  exercise_id text not null,
  version integer not null check (version between 1 and 10000),
  patient_content jsonb not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (exercise_id, version),
  check (exercise_id ~ '^[a-z0-9][a-z0-9_-]{1,99}$'),
  check (private.is_valid_patient_exercise_content(patient_content))
);

create unique index if not exists exercise_catalog_one_active_idx
  on public.exercise_catalog_versions (exercise_id) where active;

insert into public.exercise_catalog_versions (
  exercise_id, version, patient_content, content_hash, active
)
select source.exercise_id, 1, source.patient_content,
       encode(extensions.digest(source.patient_content::text, 'sha256'), 'hex'),
       true
from (values
  ('ex_quad_sets', jsonb_build_object(
    'name', 'انقباض عضله چهارسر (کوآد ست)',
    'purpose', 'فعال‌سازی عضله جلوی ران بعد از جراحی زانو',
    'howTo', jsonb_build_array(
      'بنشینید یا دراز بکشید و پا را صاف کنید؛ یک حوله لوله‌شده زیر زانو بگذارید.',
      'پشت زانو را به آرامی به حوله فشار دهید.',
      'عضله جلوی ران را سفت کنید و ۵ ثانیه نگه دارید.',
      'شل کنید و تکرار کنید.'
    ),
    'commonMistakes', jsonb_build_array(
      'حبس کردن نفس', 'سفت‌نکردن کامل عضله', 'بلندکردن کل پا در روزهای اول'
    ),
    'whenToStop', 'اگر درد تیز در محل جراحی حس کردید (بیشتر از دردِ معمول) توقف کنید.'
  )),
  ('ex_ankle_pumps', jsonb_build_object(
    'name', 'پمپ مچ پا',
    'purpose', 'بهبود گردش خون و کاهش ورم بعد از جراحی',
    'howTo', jsonb_build_array(
      'دراز بکشید یا بنشینید و پاها را روی سطحی تکیه دهید.',
      'پنجه پا را به سمت جلو بکشید، بعد به سمت خودتان بالا بیاورید.',
      'با ریتم آرام و پیوسته در دامنه بدون درد حرکت دهید.'
    ),
    'commonMistakes', jsonb_build_array(
      'خیلی آهسته انجام‌دادن', 'فراموش‌کردن تکرار منظم در طول روز'
    ),
    'whenToStop', 'اگر درد یا ورم جدید در ساق پا دیدید حتماً به فیزیوتراپیست اطلاع دهید.'
  )),
  ('ex_heel_slides', jsonb_build_object(
    'name', 'سُر دادن پاشنه (هیل اسلاید)',
    'purpose', 'بازگرداندن خم‌شدن زانو بعد از تعویض مفصل',
    'howTo', jsonb_build_array(
      'به پشت دراز بکشید و یک حوله یا بند دور کف پا بیندازید.',
      'پاشنه را به آرامی به سمت باسن سُر دهید تا زانو خم شود.',
      'با کمک بند، تا حد کشش راحت جلو بروید و کمی نگه دارید.',
      'به آرامی به حالت اول برگردید.'
    ),
    'commonMistakes', jsonb_build_array(
      'فشار زیاد تا حد درد شدید', 'چرخاندن زانو به داخل یا بیرون', 'حبس نفس'
    ),
    'whenToStop', 'اگر درد تیز یا حس گیر کردن مفصل داشتید توقف کنید.'
  )),
  ('ex_glute_bridge', jsonb_build_object(
    'name', 'پل باسن',
    'purpose', 'تقویت باسن و زنجیره پشتی بدن و کاهش فشار روی کمر',
    'howTo', jsonb_build_array(
      'به پشت دراز بکشید، زانوها خم و کف پاها روی زمین.',
      'عضلات باسن را سفت کنید و لگن را بالا بیاورید تا بدن در یک خط صاف قرار گیرد.',
      'بالای حرکت یک لحظه مکث کنید، بعد آرام پایین بیایید.'
    ),
    'commonMistakes', jsonb_build_array(
      'قوس بیش از حد کمر', 'فشار با پنجه پا به‌جای پاشنه', 'استفاده فقط از پشت ران'
    ),
    'whenToStop', 'اگر درد کمر هنگام حرکت بیشتر شد توقف کنید.'
  )),
  ('ex_bird_dog', jsonb_build_object(
    'name', 'پرنده-سگ (برد داگ)',
    'purpose', 'تقویت ثبات تنه و کنترل کمر و لگن',
    'howTo', jsonb_build_array(
      'روی چهار دست و پا قرار بگیرید و کمر را در حالت طبیعی نگه دارید.',
      'دست و پای مخالف را همزمان و آهسته صاف کنید.',
      'لگن را تراز نگه دارید و نچرخید.',
      'با کنترل برگردید و سمت دیگر را انجام دهید.'
    ),
    'commonMistakes', jsonb_build_array(
      'قوس‌دادن کمر', 'عجله در حرکت', 'چرخیدن لگن'
    ),
    'whenToStop', 'اگر درد یا گزگز به پا انتشار پیدا کرد توقف کنید.'
  )),
  ('ex_curl_up', jsonb_build_object(
    'name', 'کرل-آپ اصلاح‌شده',
    'purpose', 'تقویت استقامت عضلات شکم بدون فشار به کمر',
    'howTo', jsonb_build_array(
      'به پشت دراز بکشید؛ یک زانو خم و پای دیگر صاف باشد.',
      'دست‌ها را زیر گودی کمر بگذارید.',
      'سر و شانه‌ها را چند سانتی‌متر از زمین بلند کنید.',
      'کمی نگه دارید و با کنترل پایین بیایید.'
    ),
    'commonMistakes', jsonb_build_array(
      'صاف‌کردن گودی کمر', 'کشیدن گردن', 'حبس نفس'
    ),
    'whenToStop', 'اگر درد یا گزگز به پا انتشار پیدا کرد توقف کنید.'
  )),
  ('ex_glute_med_sidelying', jsonb_build_object(
    'name', 'بالا آوردن پا از پهلو',
    'purpose', 'تقویت عضله کنار باسن برای ثبات لگن',
    'howTo', jsonb_build_array(
      'به پهلو دراز بکشید؛ پاها روی هم و کمی عقب‌تر از بدن.',
      'پای بالایی را صاف نگه دارید و پنجه رو به جلو باشد.',
      'پا را به سمت سقف بالا ببرید بدون اینکه بدن به عقب بچرخد.',
      'آهسته پایین بیاورید.'
    ),
    'commonMistakes', jsonb_build_array(
      'چرخیدن لگن به عقب', 'استفاده از عجله و ضربه', 'بالا بردن با پنجه چرخیده'
    ),
    'whenToStop', 'با درد تیز در کنار باسن توقف کنید.'
  )),
  ('ex_wall_sit', jsonb_build_object(
    'name', 'اسکوات کنار دیوار (وال سیت)',
    'purpose', 'تقویت عضله جلوی ران بدون فشار زیاد به مفصل زانو',
    'howTo', jsonb_build_array(
      'پشت به دیوار بایستید و به آن تکیه دهید.',
      'به آرامی پایین بیایید تا زانوها کمی خم شوند.',
      'در همین حالت بمانید؛ زانوها بالای پاها باشند.',
      'به آرامی بالا بیایید.'
    ),
    'commonMistakes', jsonb_build_array(
      'جمع‌شدن زانوها به داخل', 'پایین‌رفتن بیش از حد در ابتدا', 'حبس نفس'
    ),
    'whenToStop', 'با درد تیز جلوی زانو توقف کنید.'
  ))
) as source(exercise_id, patient_content)
on conflict (exercise_id, version) do update
set patient_content = excluded.patient_content,
    content_hash = excluded.content_hash,
    active = excluded.active;

alter table public.exercise_catalog_versions enable row level security;
revoke all on table public.exercise_catalog_versions
  from public, anon, authenticated, service_role;

alter table public.prescription_items
  add column if not exists exercise_version integer,
  add column if not exists content_snapshot jsonb;

do $$
begin
  if exists (
    select 1
    from public.prescription_items item
    left join public.exercise_catalog_versions catalog
      on catalog.exercise_id = item.exercise_id and catalog.active
    where catalog.exercise_id is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'Remediate legacy prescription items that are absent from the reviewed exercise catalog';
  end if;
end $$;

update public.prescription_items item
set exercise_version = catalog.version,
    content_snapshot = catalog.patient_content
from public.exercise_catalog_versions catalog
where catalog.exercise_id = item.exercise_id
  and catalog.active
  and (item.exercise_version is null or item.content_snapshot is null);

alter table public.prescription_items
  alter column exercise_version set not null,
  alter column content_snapshot set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.prescription_items'::regclass
      and conname = 'prescription_items_catalog_fkey'
  ) then
    alter table public.prescription_items
      add constraint prescription_items_catalog_fkey
      foreign key (exercise_id, exercise_version)
      references public.exercise_catalog_versions (exercise_id, version)
      on delete restrict not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.prescription_items'::regclass
      and conname = 'prescription_items_snapshot_shape_check'
  ) then
    alter table public.prescription_items
      add constraint prescription_items_snapshot_shape_check check (
        jsonb_typeof(content_snapshot) = 'object'
        and content_snapshot ?& array[
          'name', 'purpose', 'howTo', 'commonMistakes', 'whenToStop'
        ]
        and pg_column_size(content_snapshot) <= 32768
      ) not valid;
  end if;
end $$;

alter table public.prescription_items
  validate constraint prescription_items_catalog_fkey;
alter table public.prescription_items
  validate constraint prescription_items_snapshot_shape_check;

create or replace function private.stamp_prescription_item_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog public.exercise_catalog_versions%rowtype;
begin
  select catalog.* into v_catalog
  from public.exercise_catalog_versions catalog
  where catalog.exercise_id = new.exercise_id and catalog.active
  for share;
  if not found then
    raise exception using
      errcode = '22023',
      message = 'Exercise is not in the active patient-ready catalog';
  end if;
  new.exercise_version := v_catalog.version;
  new.content_snapshot := v_catalog.patient_content;
  return new;
end;
$$;

revoke all on function private.stamp_prescription_item_snapshot()
  from public, anon, authenticated, service_role;
drop trigger if exists prescription_items_stamp_catalog
  on public.prescription_items;
create trigger prescription_items_stamp_catalog
before insert or update of exercise_id on public.prescription_items
for each row execute function private.stamp_prescription_item_snapshot();

-- --------------------------------------------------------------------------
-- 2) YYYY-MM-DD shape is not calendar validation. Rebuild the planner input
--    constraint with a parser that rejects impossible dates.
-- --------------------------------------------------------------------------

create or replace function private.is_iso_calendar_date(p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_date date;
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  v_date := p_value::date;
  return to_char(v_date, 'YYYY-MM-DD') = p_value;
exception when others then
  return false;
end;
$$;

create or replace function private.is_valid_treatment_plan_input(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_value ?& array[
      'region', 'stage', 'painSeverity', 'irritability',
      'mainImpairment', 'patientGoal', 'safetyConfirmed'
    ]
    and not exists (
      select 1 from jsonb_object_keys(p_value) key
      where key <> all (array[
        'region', 'stage', 'painSeverity', 'irritability',
        'mainImpairment', 'patientGoal', 'safetyConfirmed', 'postOpDetails'
      ])
    )
    and jsonb_typeof(p_value -> 'region') = 'string'
    and char_length(btrim(p_value ->> 'region')) between 1 and 100
    and p_value ->> 'stage' in (
      'acute', 'subacute', 'chronic', 'post-op', 'return-to-sport'
    )
    and p_value ->> 'irritability' in ('low', 'moderate', 'high')
    and jsonb_typeof(p_value -> 'painSeverity') = 'number'
    and (p_value ->> 'painSeverity') ~ '^\d+$'
    and (p_value ->> 'painSeverity')::integer between 0 and 10
    and jsonb_typeof(p_value -> 'mainImpairment') = 'string'
    and char_length(p_value ->> 'mainImpairment') <= 2000
    and jsonb_typeof(p_value -> 'patientGoal') = 'string'
    and char_length(p_value ->> 'patientGoal') <= 2000
    and p_value -> 'safetyConfirmed' = 'true'::jsonb
    and (
      (
        p_value ->> 'stage' <> 'post-op'
        and not (p_value ? 'postOpDetails')
      )
      or (
        p_value ->> 'stage' = 'post-op'
        and jsonb_typeof(p_value -> 'postOpDetails') = 'object'
        and (p_value -> 'postOpDetails') ?& array[
          'procedure', 'surgeryDate', 'precautions',
          'weightBearingStatus', 'protocolConfirmed'
        ]
        and (
          select count(*) = 5
          from jsonb_object_keys(p_value -> 'postOpDetails')
        )
        and char_length(btrim(p_value #>> '{postOpDetails,procedure}')) between 1 and 1000
        and private.is_iso_calendar_date(p_value #>> '{postOpDetails,surgeryDate}')
        and char_length(btrim(p_value #>> '{postOpDetails,precautions}')) between 1 and 4000
        and char_length(btrim(p_value #>> '{postOpDetails,weightBearingStatus}')) between 1 and 1000
        and p_value #> '{postOpDetails,protocolConfirmed}' = 'true'::jsonb
      )
    ),
    false
  );
$$;

alter table public.treatment_plans
  drop constraint if exists treatment_plans_input_shape_check;
alter table public.treatment_plans
  add constraint treatment_plans_input_shape_check
  check (private.is_valid_treatment_plan_input(planner_input)) not valid;
alter table public.treatment_plans
  validate constraint treatment_plans_input_shape_check;

revoke all on function private.is_iso_calendar_date(text)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_patient_exercise_content(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_treatment_plan_input(jsonb)
  from public, anon, authenticated, service_role;

comment on table public.exercise_catalog_versions is
  'Reviewed versioned patient-facing exercise content; prescriptions retain immutable snapshots.';
comment on column public.prescription_items.content_snapshot is
  'Exact reviewed instructions associated with the prescribed exercise version.';

commit;
