-- =========================================================================
-- CKD reference seed (BUILD SPEC §12). VERIFIED general starting ranges,
-- not personalized advice. Keep in sync with packages/shared/src/guidelines.ts.
-- Idempotent: safe to re-run.
-- =========================================================================

insert into conditions (id, name, active) values
  ('ckd', 'Chronic Kidney Disease', true)
on conflict (id) do update set name = excluded.name, active = excluded.active;

insert into condition_metrics (id, condition_id, key, label, unit, conditional, sort) values
  ('ckd.sodium',     'ckd', 'sodium',     'Sodium',     'mg/day',   false, 10),
  ('ckd.protein',    'ckd', 'protein',    'Protein',    'g/kg/day', false, 20),
  ('ckd.potassium',  'ckd', 'potassium',  'Potassium',  'mg/day',   true,  30),
  ('ckd.phosphorus', 'ckd', 'phosphorus', 'Phosphorus', 'mg/day',   true,  40),
  ('ckd.fluid',      'ckd', 'fluid',      'Fluid',      'varies',   true,  50)
on conflict (id) do update
  set label = excluded.label, unit = excluded.unit,
      conditional = excluded.conditional, sort = excluded.sort;

-- Re-seed guideline rows deterministically.
delete from guidelines where metric_id in
  ('ckd.sodium','ckd.protein','ckd.potassium','ckd.phosphorus','ckd.fluid');

insert into guidelines (metric_id, rule, source, source_url, version) values
  -- Sodium — applies broadly.
  ('ckd.sodium',
   '{"kind":"range","range":"under 2,300 mg/day","note":"many aim under 2,000 mg/day"}',
   'KDOQI 2020', null, 'kdoqi-2020'),

  -- Protein — by profile (g/kg × weight when known).
  ('ckd.protein',
   '{"kind":"protein_band","stage":"early","g_per_kg":[0.8,0.8]}',
   'KDOQI 2020', null, 'kdoqi-2020'),
  ('ckd.protein',
   '{"kind":"protein_band","stage":"nondialysis","diabetes":false,"g_per_kg":[0.55,0.6],"note":"metabolically stable, no diabetes"}',
   'KDOQI 2020', null, 'kdoqi-2020'),
  ('ckd.protein',
   '{"kind":"protein_band","stage":"nondialysis","diabetes":true,"g_per_kg":[0.6,0.8]}',
   'KDOQI 2020', null, 'kdoqi-2020'),
  ('ckd.protein',
   '{"kind":"protein_band","stage":"dialysis","g_per_kg":[1.0,1.2],"note":"MORE protein on dialysis — never restrict below this"}',
   'KDOQI 2020', null, 'kdoqi-2020'),

  -- Potassium — individualized; only if advised.
  ('ckd.potassium',
   '{"kind":"range","range":"individualized; often 2,000–3,000 mg/day when limited"}',
   'KDOQI 2020 / National Kidney Foundation', null, 'kdoqi-2020'),

  -- Phosphorus — if limited.
  ('ckd.phosphorus',
   '{"kind":"range","range":"800–1,000 mg/day if limited (usually when blood phosphorus is high)"}',
   'KDOQI 2020', null, 'kdoqi-2020'),

  -- Fluid — set by care team.
  ('ckd.fluid',
   '{"kind":"range","range":"set by your care team; often only limited in later stages/dialysis"}',
   'National Kidney Foundation', null, 'nkf');
