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
