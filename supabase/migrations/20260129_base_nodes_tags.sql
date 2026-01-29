begin;

-- Base schema for core tables (nodes/tags/node_tags) + owner-scoped RLS.
-- Rollback notes: see DEPLOYMENT.md.

create table if not exists public.nodes (
  id bigserial primary key,
  owner_id uuid not null,
  type text not null,
  title text not null,
  body text null,
  status text not null,
  context text null,
  energy text null,
  duration_minutes integer null,
  due_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pinned boolean not null default false,
  review_after timestamptz null,
  search tsvector null
);

create table if not exists public.tags (
  id bigserial primary key,
  owner_id uuid not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.node_tags (
  node_id bigint not null,
  tag_id bigint not null,
  created_at timestamptz not null default now(),
  constraint node_tags_pkey primary key (node_id, tag_id)
);

-- Ensure expected columns exist if tables predate this migration.
alter table public.nodes
  add column if not exists owner_id uuid,
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists status text,
  add column if not exists context text,
  add column if not exists energy text,
  add column if not exists duration_minutes integer,
  add column if not exists due_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists pinned boolean,
  add column if not exists review_after timestamptz,
  add column if not exists search tsvector;

alter table public.tags
  add column if not exists owner_id uuid,
  add column if not exists name text,
  add column if not exists created_at timestamptz;

alter table public.node_tags
  add column if not exists node_id bigint,
  add column if not exists tag_id bigint,
  add column if not exists created_at timestamptz;

-- Foreign keys (idempotent).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nodes_owner_id_fkey') then
    alter table public.nodes
      add constraint nodes_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tags_owner_id_fkey') then
    alter table public.tags
      add constraint tags_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'node_tags_node_id_fkey') then
    alter table public.node_tags
      add constraint node_tags_node_id_fkey foreign key (node_id) references public.nodes(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'node_tags_tag_id_fkey') then
    alter table public.node_tags
      add constraint node_tags_tag_id_fkey foreign key (tag_id) references public.tags(id) on delete cascade;
  end if;
end $$;

-- Constraints (idempotent).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nodes_type_check') then
    alter table public.nodes
      add constraint nodes_type_check check (type in ('idea', 'task'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'nodes_status_check') then
    alter table public.nodes
      add constraint nodes_status_check check (status in ('inbox', 'active', 'waiting', 'someday', 'done', 'archived'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'nodes_energy_check') then
    alter table public.nodes
      add constraint nodes_energy_check check (energy is null or energy in ('low', 'medium', 'high'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'nodes_duration_check') then
    alter table public.nodes
      add constraint nodes_duration_check check (duration_minutes is null or duration_minutes >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tags_owner_name_unique') then
    alter table public.tags
      add constraint tags_owner_name_unique unique (owner_id, name);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tags_name_lowercase_check') then
    alter table public.tags
      add constraint tags_name_lowercase_check check (name = lower(name));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'node_tags_unique') then
    alter table public.node_tags
      add constraint node_tags_unique unique (node_id, tag_id);
  end if;
end $$;

-- Indexes.
create index if not exists nodes_owner_idx on public.nodes (owner_id);
create index if not exists nodes_owner_status_idx on public.nodes (owner_id, status);
create index if not exists nodes_owner_type_idx on public.nodes (owner_id, type);
create index if not exists nodes_owner_created_idx on public.nodes (owner_id, created_at);
create index if not exists nodes_owner_updated_idx on public.nodes (owner_id, updated_at);
create index if not exists nodes_owner_due_idx on public.nodes (owner_id, due_at);

create index if not exists tags_owner_idx on public.tags (owner_id);
create index if not exists tags_owner_name_idx on public.tags (owner_id, name);

create index if not exists node_tags_node_idx on public.node_tags (node_id);
create index if not exists node_tags_tag_idx on public.node_tags (tag_id);

-- RLS.
alter table public.nodes enable row level security;
alter table public.tags enable row level security;
alter table public.node_tags enable row level security;

do $$
begin
  -- nodes
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nodes' and policyname = 'nodes_select_owner'
  ) then
    create policy nodes_select_owner on public.nodes
      for select using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nodes' and policyname = 'nodes_insert_owner'
  ) then
    create policy nodes_insert_owner on public.nodes
      for insert with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nodes' and policyname = 'nodes_update_owner'
  ) then
    create policy nodes_update_owner on public.nodes
      for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nodes' and policyname = 'nodes_delete_owner'
  ) then
    create policy nodes_delete_owner on public.nodes
      for delete using (owner_id = auth.uid());
  end if;

  -- tags
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tags' and policyname = 'tags_select_owner'
  ) then
    create policy tags_select_owner on public.tags
      for select using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tags' and policyname = 'tags_insert_owner'
  ) then
    create policy tags_insert_owner on public.tags
      for insert with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tags' and policyname = 'tags_update_owner'
  ) then
    create policy tags_update_owner on public.tags
      for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tags' and policyname = 'tags_delete_owner'
  ) then
    create policy tags_delete_owner on public.tags
      for delete using (owner_id = auth.uid());
  end if;

  -- node_tags (join must remain within owner scope)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'node_tags' and policyname = 'node_tags_select_owner'
  ) then
    create policy node_tags_select_owner on public.node_tags
      for select using (
        exists (
          select 1 from public.nodes n
          where n.id = node_tags.node_id and n.owner_id = auth.uid()
        ) and exists (
          select 1 from public.tags t
          where t.id = node_tags.tag_id and t.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'node_tags' and policyname = 'node_tags_insert_owner'
  ) then
    create policy node_tags_insert_owner on public.node_tags
      for insert with check (
        exists (
          select 1 from public.nodes n
          where n.id = node_tags.node_id and n.owner_id = auth.uid()
        ) and exists (
          select 1 from public.tags t
          where t.id = node_tags.tag_id and t.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'node_tags' and policyname = 'node_tags_delete_owner'
  ) then
    create policy node_tags_delete_owner on public.node_tags
      for delete using (
        exists (
          select 1 from public.nodes n
          where n.id = node_tags.node_id and n.owner_id = auth.uid()
        ) and exists (
          select 1 from public.tags t
          where t.id = node_tags.tag_id and t.owner_id = auth.uid()
        )
      );
  end if;
end $$;

commit;
