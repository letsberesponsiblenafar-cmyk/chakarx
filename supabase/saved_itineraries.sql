-- Run once in the Supabase SQL editor. All access is through the authenticated
-- Chakar server; browser clients receive neither this table nor the secret key.
create table if not exists public.saved_itineraries (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  arrival date,
  departure date,
  days integer not null check (days between 1 and 31),
  nights integer not null check (nights between 0 and 30),
  package_total numeric not null check (package_total >= 0),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_downloaded_at timestamptz,
  download_count integer not null default 0 check (download_count >= 0)
);
create index if not exists saved_itineraries_updated_at_idx on public.saved_itineraries(updated_at desc);
create index if not exists saved_itineraries_client_name_idx on public.saved_itineraries(client_name);
alter table public.saved_itineraries enable row level security;
revoke all on table public.saved_itineraries from anon, authenticated;
