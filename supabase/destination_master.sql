-- Run once in the Supabase SQL Editor. The app overlays editable records on
-- the bundled Kashmir catalog; each edit or new destination is saved here.
create table if not exists public.destination_master (
  id text primary key,
  record jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists destination_master_name_idx on public.destination_master ((record->>'name'));
alter table public.destination_master enable row level security;
revoke all on table public.destination_master from anon, authenticated;
