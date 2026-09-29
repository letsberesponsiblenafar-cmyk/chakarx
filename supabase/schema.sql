create table if not exists source_observations (
  id bigint generated always as identity primary key,
  source_id text not null,
  url text not null,
  status integer not null default 0,
  retrieved_at timestamptz not null default now(),
  content_hash text,
  detail text
);
create index if not exists source_observations_source_time_idx
  on source_observations(source_id, retrieved_at desc);

create table if not exists hotel_master (
  id text primary key,
  destination text not null,
  name text not null,
  source_category text,
  star_rating integer,
  normalized_category text,
  map_b2b numeric,
  extra_bed_b2b numeric,
  cnb_b2b numeric,
  address text,
  room_type text,
  website text,
  source_type text,
  rate_validity text,
  availability_status text,
  last_updated date,
  notes text,
  source_files jsonb default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists hotel_master_destination_idx on hotel_master(destination);
create index if not exists hotel_master_category_idx on hotel_master(normalized_category);

-- The browser never connects to this table directly. Server routes use the
-- service-role key after validating the signed admin session.
alter table hotel_master enable row level security;
revoke all on table hotel_master from anon, authenticated;

-- Client itineraries are saved only after admin-authenticated server requests.
-- For projects that already ran this schema, apply saved_itineraries.sql once.
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
