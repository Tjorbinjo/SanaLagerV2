-- Im Supabase SQL Editor einmal komplett ausführen.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'lager' check (role in ('admin', 'lager')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'Stück',
  stock integer not null default 0 check (stock >= 0),
  minimum integer not null default 0 check (minimum >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.backpacks (
  id integer primary key,
  name text not null,
  identifier text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.backpack_items (
  backpack_id integer references public.backpacks(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  target_quantity integer not null default 1 check (target_quantity > 0),
  stock integer not null default 0 check (stock >= 0),
  primary key (backpack_id, item_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  backpack_id integer references public.backpacks(id) not null,
  reporter_name text not null,
  note text not null default '',
  entries jsonb not null,
  status text not null default 'offen' check (status in ('offen', 'gebucht', 'verworfen')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

insert into public.backpacks (id, name, identifier) values
  (1, 'Rucksack 1', 'SAN-001'), (2, 'Rucksack 2', 'SAN-002'),
  (3, 'Rucksack 3', 'SAN-003'), (4, 'Rucksack 4', 'SAN-004'),
  (5, 'Rucksack 5', 'SAN-005') on conflict (id) do nothing;

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.backpacks enable row level security;
alter table public.backpack_items enable row level security;
alter table public.reports enable row level security;

create policy profiles_read_staff on public.profiles for select to authenticated using (public.is_staff());
create policy profiles_update_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy items_read_public on public.items for select using (active = true);
create policy items_write_staff on public.items for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy backpacks_read_public on public.backpacks for select using (true);
create policy backpacks_write_staff on public.backpacks for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy backpack_items_read_public on public.backpack_items for select using (true);
create policy backpack_items_write_staff on public.backpack_items for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy reports_insert_public on public.reports for insert with check (status = 'offen');
create policy reports_read_staff on public.reports for select to authenticated using (public.is_staff());
create policy reports_update_staff on public.reports for update to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.new_user_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.new_user_profile();

-- Nach der ersten Registrierung einmal ausführen und DEINE-USER-ID ersetzen:
-- update public.profiles set role = 'admin' where id = 'DEINE-USER-ID';
