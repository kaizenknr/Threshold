-- =========================================================================
-- Nephrologist-driven features: lab results over time, medication dose-change
-- history, and a kidney-friendly foods / swaps reference.
-- =========================================================================

-- ---- Lab / test results (track progression vs regression) --------------
create table if not exists lab_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  test_key text not null,           -- 'egfr' | 'creatinine' | 'potassium' | free text
  label text,                       -- friendly label
  value numeric not null,
  unit text,
  taken_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists lab_results_user_test_idx on lab_results (user_id, test_key, taken_on);
alter table lab_results enable row level security;
drop policy if exists "own rows" on lab_results;
create policy "own rows" on lab_results for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- Medication dose-change history ------------------------------------
create table if not exists medication_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  medication_id uuid not null references medications on delete cascade,
  changed_on date not null default current_date,
  new_dose text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists medication_changes_med_idx on medication_changes (medication_id, changed_on);
alter table medication_changes enable row level security;
drop policy if exists "own rows" on medication_changes;
create policy "own rows" on medication_changes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- Kidney-friendly foods & swaps (reference; qualitative guidance) ----
-- Qualitative levels avoid fabricating precise nutrient numbers; this mirrors
-- how renal-diet education is delivered. Values still defer to a dietitian.
create table if not exists kidney_friendly_foods (
  id text primary key,
  name text not null,
  category text not null,            -- protein | fruit | vegetable | grain | swap | drink
  potassium_level text,              -- low | moderate | high
  phosphorus_level text,             -- low | moderate | high
  sodium_level text,                 -- low | moderate | high
  high_protein boolean not null default false,
  note text,
  swap_for text,                     -- lower-burden alternative(s)
  sort int not null default 0
);
alter table kidney_friendly_foods enable row level security;
drop policy if exists "reference read" on kidney_friendly_foods;
create policy "reference read" on kidney_friendly_foods for select to authenticated using (true);

delete from kidney_friendly_foods;
insert into kidney_friendly_foods (id, name, category, potassium_level, phosphorus_level, sodium_level, high_protein, note, swap_for, sort) values
  -- Kidney-friendly proteins (keep protein up)
  ('egg_whites',   'Egg whites',            'protein', 'low',      'low',      'low', true,  'Excellent high-quality protein, low in phosphorus and potassium.', null, 10),
  ('chicken',      'Skinless chicken breast','protein','moderate', 'moderate', 'low', true,  'Lean protein; keep portions to your protein target.', null, 11),
  ('turkey',       'Skinless turkey',        'protein','moderate', 'moderate', 'low', true,  'Lean protein; choose fresh over deli/processed (high sodium).', 'processed deli meats', 12),
  ('fish_cod',     'White fish (cod, tilapia)','protein','moderate','moderate','low', true,  'Good protein; generally kidney-friendly.', null, 13),
  ('tofu_firm',    'Firm tofu',              'protein','moderate', 'moderate', 'low', true,  'Plant protein; check portion for potassium.', null, 14),
  -- Lower-potassium fruit
  ('apple',        'Apple',                  'fruit',  'low',      'low',      'low', false, 'Lower-potassium fruit choice.', null, 20),
  ('berries',      'Berries (blue/straw/rasp)','fruit','low',     'low',      'low', false, 'Lower-potassium, antioxidant-rich.', null, 21),
  ('grapes',       'Grapes',                 'fruit',  'low',      'low',      'low', false, 'Lower-potassium snack.', null, 22),
  ('pineapple',    'Pineapple',              'fruit',  'low',      'low',      'low', false, 'Lower-potassium tropical option.', null, 23),
  -- Higher-potassium fruit (limit)
  ('banana',       'Banana',                 'fruit',  'high',     'low',      'low', false, 'High potassium — often limited on a renal diet.', 'apple, berries, or grapes', 24),
  ('orange',       'Orange / orange juice',  'fruit',  'high',     'low',      'low', false, 'High potassium — often limited.', 'apple or berries', 25),
  ('dried_fruit',  'Dried fruit',            'fruit',  'high',     'low',      'moderate', false, 'Very concentrated potassium.', 'fresh lower-potassium fruit', 26),
  -- Lower-potassium vegetables
  ('bell_pepper',  'Bell peppers',           'vegetable','low',    'low',      'low', false, 'Lower-potassium veggie.', null, 30),
  ('cabbage',      'Cabbage',                'vegetable','low',    'low',      'low', false, 'Lower-potassium; versatile.', null, 31),
  ('cauliflower',  'Cauliflower',            'vegetable','low',    'low',      'low', false, 'Lower-potassium; a common potato swap.', null, 32),
  ('green_beans',  'Green beans',            'vegetable','low',    'low',      'low', false, 'Lower-potassium veggie.', null, 33),
  -- Higher-potassium vegetables (limit)
  ('potato',       'Potatoes',               'vegetable','high',   'moderate', 'low', false, 'High potassium; leaching (soaking) can reduce it.', 'cauliflower; or soak/double-boil potatoes', 34),
  ('tomato',       'Tomatoes / tomato sauce','vegetable','high',   'low',      'moderate', false, 'High potassium, especially concentrated sauces.', 'roasted red pepper sauce', 35),
  ('spinach_ckd',  'Cooked spinach',         'vegetable','high',   'moderate', 'low', false, 'Cooking concentrates potassium.', 'raw lettuce/cabbage', 36),
  ('avocado',      'Avocado',                'vegetable','high',   'low',      'low', false, 'Very high potassium.', 'cucumber or bell pepper', 37),
  -- High-phosphorus (limit)
  ('dairy_milk',   'Cow''s milk',            'drink',  'high',     'high',     'low', true,  'High phosphorus and potassium.', 'unenriched rice/almond milk', 40),
  ('cheese',       'Cheese',                 'protein','low',      'high',     'high', true,  'High phosphorus and sodium.', 'small portions; lower-sodium cheeses', 41),
  ('nuts',         'Nuts & seeds',           'protein','high',     'high',     'moderate', true, 'High phosphorus and potassium.', 'unsalted popcorn; small portions', 42),
  ('whole_grain',  'Whole-grain / bran',     'grain',  'moderate', 'high',     'low', false, 'More phosphorus/potassium than refined grains.', 'white rice, white bread, refined pasta', 43),
  ('cola',         'Dark colas',             'drink',  'low',      'high',     'low', false, 'Contain phosphate additives.', 'clear sodas or water', 44),
  -- Smart swaps
  ('salt',         'Table salt',             'swap',   'low',      'low',      'high', false, 'Sodium raises blood pressure and fluid retention.', 'herbs, spices, salt-free seasoning, lemon', 50),
  ('processed',    'Processed / canned foods','swap',  'moderate', 'high',     'high', false, 'Often very high sodium and phosphate additives.', 'fresh or low-sodium versions; rinse canned foods', 51),
  ('white_grains', 'White rice / white bread','grain', 'low',      'low',      'low', false, 'Lower phosphorus/potassium than whole-grain.', null, 52);
