-- =========================================================================
-- Anemia condition module + condition-aware pregnancy considerations.
-- GENERAL, sourced education — NOT personalized medical advice.
-- Pregnancy with a chronic condition is higher-risk: preconception counseling
-- and an OB (ideally maternal-fetal medicine) + the relevant specialist are
-- essential. Care team decides; never start/stop a medication from this app.
-- Have a clinician review this content before launch. Idempotent.
-- =========================================================================

------------------------------------------------------------------------
-- 1) Anemia condition
------------------------------------------------------------------------
insert into conditions (id, name, active) values ('anemia', 'Anemia', true)
on conflict (id) do update set name = excluded.name, active = excluded.active;

insert into condition_metrics (id, condition_id, key, label, unit, conditional, sort) values
  ('anemia.hemoglobin',   'anemia', 'hemoglobin',   'Hemoglobin',            'g/dL',   false, 10),
  ('anemia.iron_intake',  'anemia', 'iron_intake',  'Dietary iron',          'food',   false, 20),
  ('anemia.absorption',   'anemia', 'absorption',   'Iron absorption',       'tips',   false, 30),
  ('anemia.ferritin',     'anemia', 'ferritin',     'Iron stores (ferritin)','lab',    true,  40),
  ('anemia.b12_folate',   'anemia', 'b12_folate',   'B12 & folate',          'lab',    true,  50)
on conflict (id) do update
  set label = excluded.label, unit = excluded.unit, conditional = excluded.conditional, sort = excluded.sort;

delete from guidelines where metric_id in
  ('anemia.hemoglobin','anemia.iron_intake','anemia.absorption','anemia.ferritin','anemia.b12_folate');

insert into guidelines (metric_id, rule, source, source_url, version) values
  ('anemia.hemoglobin',
   '{"kind":"range","range":"anemia is generally defined below ~12 g/dL (nonpregnant women) or ~13 g/dL (men)","note":"pregnancy thresholds are lower; your care team interprets your labs"}',
   'World Health Organization', null, 'who'),
  ('anemia.iron_intake',
   '{"kind":"range","range":"iron-rich foods — heme iron (meat, fish, poultry) absorbs best; plant (non-heme) iron includes beans, lentils, tofu, spinach, fortified grains"}',
   'NIH Office of Dietary Supplements', null, 'nih-ods'),
  ('anemia.absorption',
   '{"kind":"range","range":"vitamin C (citrus, peppers, tomatoes) boosts non-heme iron absorption; tea, coffee, and calcium reduce it when taken with iron-rich meals"}',
   'NIH Office of Dietary Supplements', null, 'nih-ods'),
  ('anemia.ferritin',
   '{"kind":"range","range":"iron studies (ferritin, transferrin saturation) guide iron-deficiency treatment; targets are individualized"}',
   'American Society of Hematology', null, 'ash'),
  ('anemia.b12_folate',
   '{"kind":"range","range":"vitamin B12 and folate deficiencies also cause anemia — checked if that type is suspected"}',
   'American Society of Hematology', null, 'ash');

------------------------------------------------------------------------
-- 2) Condition-aware pregnancy considerations (reference data)
------------------------------------------------------------------------
create table if not exists pregnancy_considerations (
  id uuid primary key default gen_random_uuid(),
  condition_id text references conditions,   -- NULL = applies to any pregnancy
  category text not null,                    -- preconception | target-change | watch-for | monitoring | nutrition | general
  title text not null,
  detail text not null,
  source text not null,
  sort int not null default 0
);
create index if not exists pregnancy_considerations_cond_idx on pregnancy_considerations (condition_id, sort);

alter table pregnancy_considerations enable row level security;
drop policy if exists "reference read" on pregnancy_considerations;
create policy "reference read" on pregnancy_considerations for select to authenticated using (true);

-- Re-seed deterministically.
delete from pregnancy_considerations;

insert into pregnancy_considerations (condition_id, category, title, detail, source, sort) values
  -- ===== General (any pregnancy) =====
  (null, 'preconception', 'Plan ahead with your care team',
   'If you have a chronic condition, ask about preconception counseling — getting the condition well-controlled before conception lowers risk. Bring your full medication list; some medicines are changed before or during pregnancy (only ever by your clinician).',
   'ACOG', 10),
  (null, 'nutrition', 'Folic acid early',
   'A prenatal vitamin with folic acid (commonly 400–800 mcg/day, sometimes more if advised) started before conception lowers the risk of neural tube defects. Your care team sets your dose.',
   'ACOG / CDC', 20),
  (null, 'monitoring', 'Expect closer prenatal care',
   'Chronic conditions usually mean more frequent visits and often a maternal-fetal medicine (high-risk OB) specialist alongside the doctor who manages your condition.',
   'ACOG', 30),
  (null, 'watch-for', 'Preeclampsia warning signs',
   'Severe or persistent headache, vision changes, upper-abdominal pain, sudden swelling, or a big jump in blood pressure warrant prompt contact with your care team.',
   'ACOG', 40),

  -- ===== Type 1 Diabetes =====
  ('diabetes_t1', 'target-change', 'Glucose targets are tighter in pregnancy',
   'Common pregnancy targets: fasting under 95 mg/dL, 1-hour after meals under 140, 2-hour under 120; A1c ideally near 6–6.5% if reachable without lows. Your care team sets yours.',
   'ADA — Standards of Care', 10),
  ('diabetes_t1', 'watch-for', 'Why preconception control matters',
   'High glucose around conception raises the risk of birth defects, so control before pregnancy is emphasized. Later risks include a large baby (macrosomia), preeclampsia, and newborn low blood sugar.',
   'ADA / ACOG', 20),
  ('diabetes_t1', 'monitoring', 'Eyes and kidneys',
   'Diabetic eye disease (retinopathy) and kidney disease can progress in pregnancy — expect extra screening. Some blood-pressure medicines are changed; never adjust these yourself.',
   'ADA', 30),

  -- ===== Type 2 Diabetes =====
  ('diabetes_t2', 'target-change', 'Glucose targets are tighter in pregnancy',
   'Common pregnancy targets: fasting under 95 mg/dL, 1-hour after meals under 140, 2-hour under 120. Some oral diabetes medicines are switched (often to insulin) in pregnancy — decided by your care team.',
   'ADA — Standards of Care', 10),
  ('diabetes_t2', 'watch-for', 'Higher-risk pregnancy',
   'Risks include birth defects if glucose is high at conception, a large baby, preeclampsia, and newborn low blood sugar. Preconception control lowers these.',
   'ADA / ACOG', 20),

  -- ===== CKD =====
  ('ckd', 'monitoring', 'Co-managed, higher-risk pregnancy',
   'CKD in pregnancy raises the risk of preeclampsia, preterm birth, and worsening kidney function. Care is usually shared between nephrology and a high-risk OB, with close blood-pressure and lab monitoring.',
   'National Kidney Foundation', 10),
  ('ckd', 'watch-for', 'Blood-pressure medicines matter',
   'Some common BP medicines (ACE inhibitors and ARBs) are generally avoided in pregnancy. Do not stop or change any medication on your own — your care team adjusts this safely.',
   'National Kidney Foundation / ACOG', 20),
  ('ckd', 'target-change', 'Sodium, protein, and fluid may change',
   'Dietary targets set for CKD are often revisited in pregnancy because your body’s needs change. Follow the plan your care team gives you rather than the general CKD ranges.',
   'National Kidney Foundation', 30),

  -- ===== POTS / OI / dysautonomia =====
  ('pots', 'watch-for', 'Symptoms can shift with pregnancy',
   'Blood-volume changes mean POTS symptoms may improve or worsen; morning sickness can worsen dehydration. Watch for fainting and falls. Hydration and salt (if previously advised and not contraindicated) usually continue under your care team.',
   'Dysautonomia International', 10),
  ('orthostatic_intolerance', 'watch-for', 'Guard against fainting and dehydration',
   'Orthostatic symptoms and dehydration risk can rise, especially with nausea. Change positions slowly and keep up fluids/salt if your team has advised them.',
   'Dysautonomia International', 10),
  ('dysautonomia', 'watch-for', 'Depends on your specific form',
   'Effects of pregnancy vary widely by the type of dysautonomia. This needs individualized guidance from the specialist who manages it, alongside your OB.',
   'Dysautonomia International', 10),

  -- ===== Celiac =====
  ('celiac', 'nutrition', 'Stay strictly gluten-free',
   'Untreated or poorly-controlled celiac is linked to higher risks of miscarriage, low birth weight, and preterm birth, so a strict gluten-free diet remains essential in pregnancy.',
   'ACG / celiac guidelines', 10),
  ('celiac', 'monitoring', 'Watch nutrient levels',
   'Iron, folate, B12, and vitamin D can run low in celiac — important in pregnancy. Your care team may check and correct these.',
   'ACG / celiac guidelines', 20),

  -- ===== Anemia =====
  ('anemia', 'target-change', 'Different hemoglobin thresholds in pregnancy',
   'Pregnancy lowers the anemia cutoffs: commonly under 11 g/dL in the 1st and 3rd trimesters and under 10.5 in the 2nd. Iron and folate needs rise, and supplementation is often advised.',
   'CDC / WHO', 10),
  ('anemia', 'watch-for', 'Treated to protect mom and baby',
   'Untreated anemia in pregnancy is linked to preterm birth and low birth weight, so it’s monitored and treated. Fatigue and low labs are followed by your care team.',
   'CDC / ACOG', 20);
