-- Kitchen Table — Postgres schema (gameplan 093/094, reshaped for Neon).
-- Everything lives in the `kitchen` schema so this database can later share
-- space with Sift without either app touching the other's tables.
--
-- Apply with:  KT_DB=postgres://…  node db/migrate.js
-- The connection string comes ONLY from the environment. It is never
-- committed to this repository.

create schema if not exists kitchen;

-- 095: the migration ledger exists before the second migration does.
create table if not exists kitchen.schema_version (
  version     integer primary key,
  applied_at  timestamptz not null default now(),
  notes       text
);

create table if not exists kitchen.contributors (
  id    serial primary key,
  name  text not null unique
);

create table if not exists kitchen.recipes (
  id             text primary key,             -- the kebab-case slug the app routes on
  title          text not null check (length(title) between 1 and 300),
  category       text not null check (category in
    ('Breakfast','Brunch','Lunch','Dinner','Sides','Snacks','Baking','Desserts','Cocktails','Drinks')),
  contributor_id integer not null references kitchen.contributors(id),
  servings       integer not null check (servings between 1 and 40),
  prep_time      text,                          -- free text, displayed verbatim
  cook_time      text,
  ingredients    jsonb not null default '[]',   -- ordered list of lines
  steps          jsonb not null default '[]',
  notes          text,
  flagged        jsonb not null default '[]',   -- 100: the transcription's honesty survives
  source         text,
  image          text,                          -- images/<id>.jpg when committed
  position       integer not null,              -- preserves recipes.json order for "recently added"
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 093: tags are a join table, never a comma column.
create table if not exists kitchen.tags (
  id    serial primary key,
  name  text not null,
  constraint tags_name_ci unique (name)
);

create table if not exists kitchen.recipe_tags (
  recipe_id text    not null references kitchen.recipes(id) on delete cascade,
  tag_id    integer not null references kitchen.tags(id)    on delete cascade,
  primary key (recipe_id, tag_id)
);

-- The calendar (Phase 15, ruled into 1.0): a planned meal points at a recipe
-- but survives its removal by keeping the title it was planned under (127).
create table if not exists kitchen.menu_plan (
  id          serial primary key,
  plan_date   date not null,
  slot        text not null check (slot in ('breakfast','lunch','dinner')),
  recipe_id   text references kitchen.recipes(id) on delete set null,
  title_then  text not null,                    -- what it was called when planned
  servings    integer check (servings between 1 and 40),  -- 125: per-meal override
  created_at  timestamptz not null default now()
);

-- 094: the indexes the queries will actually use, from day one.
create index if not exists idx_recipes_category    on kitchen.recipes(category);
create index if not exists idx_recipes_contributor on kitchen.recipes(contributor_id);
create index if not exists idx_menu_plan_date      on kitchen.menu_plan(plan_date);
create index if not exists idx_recipe_tags_tag     on kitchen.recipe_tags(tag_id);
