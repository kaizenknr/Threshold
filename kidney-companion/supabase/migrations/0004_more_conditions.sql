-- =========================================================================
-- Additional condition modules (data-only; no app code changes needed).
-- GENERAL, sourced reference ranges — NOT personalized medical advice.
-- Care team decides; doctor overrides always win. Values individualized.
--
-- SAFETY NOTE: POTS / orthostatic intolerance / dysautonomia often call for
-- INCREASED salt and fluids — the opposite of the CKD module. Those metrics
-- are marked conditional (only if advised, no contraindication) on purpose.
--
-- Idempotent: safe to re-run. Have a clinician review this content before launch.
-- =========================================================================

insert into conditions (id, name, active) values
  ('diabetes_t1',            'Type 1 Diabetes',                              true),
  ('diabetes_t2',            'Type 2 Diabetes',                              true),
  ('pots',                   'Postural Orthostatic Tachycardia Syndrome',    true),
  ('orthostatic_intolerance','Orthostatic Intolerance',                      true),
  ('dysautonomia',           'Dysautonomia',                                 true),
  ('celiac',                 'Celiac Disease',                               true)
on conflict (id) do update set name = excluded.name, active = excluded.active;

insert into condition_metrics (id, condition_id, key, label, unit, conditional, sort) values
  -- Type 1 Diabetes (ADA Standards of Care — general adult targets)
  ('diabetes_t1.a1c',                'diabetes_t1', 'a1c',                'A1c',                     '%',          false, 10),
  ('diabetes_t1.glucose_fasting',    'diabetes_t1', 'glucose_fasting',    'Fasting / pre-meal glucose','mg/dL',    false, 20),
  ('diabetes_t1.glucose_post',       'diabetes_t1', 'glucose_post',       'Post-meal glucose (1–2h)','mg/dL',      false, 30),
  ('diabetes_t1.time_in_range',      'diabetes_t1', 'time_in_range',      'Time in range (CGM)',     '% of time',  true,  40),

  -- Type 2 Diabetes
  ('diabetes_t2.a1c',                'diabetes_t2', 'a1c',                'A1c',                     '%',          false, 10),
  ('diabetes_t2.glucose_fasting',    'diabetes_t2', 'glucose_fasting',    'Fasting / pre-meal glucose','mg/dL',    false, 20),
  ('diabetes_t2.glucose_post',       'diabetes_t2', 'glucose_post',       'Post-meal glucose (1–2h)','mg/dL',      false, 30),
  ('diabetes_t2.time_in_range',      'diabetes_t2', 'time_in_range',      'Time in range (CGM)',     '% of time',  true,  40),
  ('diabetes_t2.blood_pressure',     'diabetes_t2', 'blood_pressure',     'Blood pressure',          'mmHg',       true,  50),

  -- POTS
  ('pots.fluids',                    'pots', 'fluids',                     'Fluids',                  'L/day',      true,  10),
  ('pots.sodium',                    'pots', 'sodium',                     'Salt / sodium',           'salt g/day', true,  20),
  ('pots.hr_standing',               'pots', 'hr_standing',                'Heart-rate rise on standing','bpm',     true,  30),

  -- Orthostatic Intolerance
  ('orthostatic_intolerance.fluids', 'orthostatic_intolerance', 'fluids', 'Fluids',                  'L/day',      true,  10),
  ('orthostatic_intolerance.sodium', 'orthostatic_intolerance', 'sodium', 'Salt / sodium',           'salt g/day', true,  20),

  -- Dysautonomia (umbrella term)
  ('dysautonomia.fluids',            'dysautonomia', 'fluids',            'Fluids',                   'L/day',      true,  10),
  ('dysautonomia.sodium',            'dysautonomia', 'sodium',            'Salt / sodium',            'salt g/day', true,  20),

  -- Celiac Disease
  ('celiac.gluten',                  'celiac', 'gluten',                  'Gluten',                   'avoid',      false, 10),
  ('celiac.cross_contact',           'celiac', 'cross_contact',           'Cross-contact',            'avoid',      false, 20),
  ('celiac.oats',                    'celiac', 'oats',                    'Oats',                     'individualized', true, 30),
  ('celiac.micronutrients',          'celiac', 'micronutrients',          'Nutrient monitoring',      'monitor',    true,  40)
on conflict (id) do update
  set label = excluded.label, unit = excluded.unit,
      conditional = excluded.conditional, sort = excluded.sort;

-- Re-seed guideline rows deterministically for these metrics.
delete from guidelines where metric_id in (
  'diabetes_t1.a1c','diabetes_t1.glucose_fasting','diabetes_t1.glucose_post','diabetes_t1.time_in_range',
  'diabetes_t2.a1c','diabetes_t2.glucose_fasting','diabetes_t2.glucose_post','diabetes_t2.time_in_range','diabetes_t2.blood_pressure',
  'pots.fluids','pots.sodium','pots.hr_standing',
  'orthostatic_intolerance.fluids','orthostatic_intolerance.sodium',
  'dysautonomia.fluids','dysautonomia.sodium',
  'celiac.gluten','celiac.cross_contact','celiac.oats','celiac.micronutrients'
);

insert into guidelines (metric_id, rule, source, source_url, version) values
  -- ===== Type 1 Diabetes (ADA) =====
  ('diabetes_t1.a1c',
   '{"kind":"range","range":"under ~7% for many nonpregnant adults","note":"highly individualized; some aim 7–8%, some tighter"}',
   'American Diabetes Association — Standards of Care', null, 'ada'),
  ('diabetes_t1.glucose_fasting',
   '{"kind":"range","range":"80–130 mg/dL before meals","note":"a common general target; your care team sets yours"}',
   'American Diabetes Association — Standards of Care', null, 'ada'),
  ('diabetes_t1.glucose_post',
   '{"kind":"range","range":"under 180 mg/dL 1–2 hours after meals"}',
   'American Diabetes Association — Standards of Care', null, 'ada'),
  ('diabetes_t1.time_in_range',
   '{"kind":"range","range":"over 70% of time in 70–180 mg/dL, under 4% below 70 mg/dL","note":"if using a CGM"}',
   'International Consensus on Time in Range / ADA', null, 'ada'),

  -- ===== Type 2 Diabetes (ADA) =====
  ('diabetes_t2.a1c',
   '{"kind":"range","range":"under ~7% for many nonpregnant adults","note":"highly individualized; some aim 7–8%"}',
   'American Diabetes Association — Standards of Care', null, 'ada'),
  ('diabetes_t2.glucose_fasting',
   '{"kind":"range","range":"80–130 mg/dL before meals","note":"a common general target; your care team sets yours"}',
   'American Diabetes Association — Standards of Care', null, 'ada'),
  ('diabetes_t2.glucose_post',
   '{"kind":"range","range":"under 180 mg/dL 1–2 hours after meals"}',
   'American Diabetes Association — Standards of Care', null, 'ada'),
  ('diabetes_t2.time_in_range',
   '{"kind":"range","range":"over 70% of time in 70–180 mg/dL, under 4% below 70 mg/dL","note":"if using a CGM"}',
   'International Consensus on Time in Range / ADA', null, 'ada'),
  ('diabetes_t2.blood_pressure',
   '{"kind":"range","range":"under 130/80 mmHg if it can be reached safely","note":"individualized"}',
   'American Diabetes Association — Standards of Care', null, 'ada'),

  -- ===== POTS (increase salt & fluids — only if advised) =====
  ('pots.fluids',
   '{"kind":"range","range":"often about 2–3 L (8–12 cups) per day","note":"increase fluids only if advised and not contraindicated"}',
   'Heart Rhythm Society 2015 expert consensus; Dysautonomia International', null, 'hrs-2015'),
  ('pots.sodium',
   '{"kind":"range","range":"often increased, sometimes up to ~8–10 g salt/day (≈3–4 g sodium)","note":"ONLY if advised and no contraindication (e.g. high blood pressure, kidney or heart disease). Opposite of a low-sodium diet."}',
   'Heart Rhythm Society 2015 expert consensus', null, 'hrs-2015'),
  ('pots.hr_standing',
   '{"kind":"range","range":"sustained rise of ≥30 bpm (≥40 bpm ages 12–19) within 10 min of standing, without a large blood-pressure drop","note":"this is how POTS is defined (a diagnostic criterion), not a treatment goal"}',
   'Heart Rhythm Society 2015 expert consensus', null, 'hrs-2015'),

  -- ===== Orthostatic Intolerance =====
  ('orthostatic_intolerance.fluids',
   '{"kind":"range","range":"often increased fluids across the day","note":"only if advised and not contraindicated"}',
   'Dysautonomia International; consensus guidance', null, 'di'),
  ('orthostatic_intolerance.sodium',
   '{"kind":"range","range":"often increased salt","note":"ONLY if advised and no contraindication"}',
   'Dysautonomia International; consensus guidance', null, 'di'),

  -- ===== Dysautonomia (umbrella) =====
  ('dysautonomia.fluids',
   '{"kind":"range","range":"varies by type; often increased fluids","note":"umbrella term — depends on the specific form and your care team"}',
   'Dysautonomia International', null, 'di'),
  ('dysautonomia.sodium',
   '{"kind":"range","range":"varies by type; sometimes increased salt","note":"depends on the specific form and comorbidities; only if advised"}',
   'Dysautonomia International', null, 'di'),

  -- ===== Celiac Disease (ACG) =====
  ('celiac.gluten',
   '{"kind":"range","range":"strict, lifelong gluten-free diet — avoid all wheat, barley, and rye (and their derivatives)","note":"this is the core of management"}',
   'American College of Gastroenterology — Celiac Disease guideline', null, 'acg'),
  ('celiac.cross_contact',
   '{"kind":"range","range":"avoid cross-contact — shared toasters, fryers, utensils, and airborne flour"}',
   'Celiac Disease Foundation', null, 'cdf'),
  ('celiac.oats',
   '{"kind":"range","range":"certified gluten-free oats are tolerated by most people, but not all","note":"reintroduce only with clinician guidance"}',
   'American College of Gastroenterology — Celiac Disease guideline', null, 'acg'),
  ('celiac.micronutrients',
   '{"kind":"range","range":"check and correct common deficiencies — iron, folate, B12, vitamin D, calcium, zinc","note":"especially around diagnosis; your care team orders labs"}',
   'American College of Gastroenterology — Celiac Disease guideline', null, 'acg');
