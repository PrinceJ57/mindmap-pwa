begin;

create table if not exists public.edges (
  id bigserial primary key,
  owner_id uuid not null,
  from_node_id bigint not null,
  to_node_id bigint not null,
  relation text not null default 'related',
  created_at timestamptz not null default now(),
  constraint edges_no_self check (from_node_id <> to_node_id),
  constraint edges_owner_from_to_relation_unique unique (owner_id, from_node_id, to_node_id, relation),
  constraint edges_from_node_fkey foreign key (from_node_id) references public.nodes(id) on delete cascade,
  constraint edges_to_node_fkey foreign key (to_node_id) references public.nodes(id) on delete cascade
);

alter table public.edges
  add column if not exists id bigserial;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'edges'
      and column_name = 'id'
  ) then
    alter table public.edges
      alter column id set default nextval('edges_id_seq'::regclass);

    update public.edges
      set id = nextval('edges_id_seq'::regclass)
    where id is null;

    alter table public.edges
      alter column id set not null;

    if not exists (
      select 1 from pg_constraint where conname = 'edges_pkey'
    ) then
      alter table public.edges add constraint edges_pkey primary key (id);
    end if;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'edges_no_self') then
    alter table public.edges
      add constraint edges_no_self check (from_node_id <> to_node_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'edges_owner_from_to_relation_unique') then
    alter table public.edges
      add constraint edges_owner_from_to_relation_unique
      unique (owner_id, from_node_id, to_node_id, relation);
  end if;
end $$;

create index if not exists edges_owner_idx on public.edges (owner_id);
create index if not exists edges_from_idx on public.edges (from_node_id);
create index if not exists edges_to_idx on public.edges (to_node_id);

alter table public.edges enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'edges'
      and policyname = 'edges_select_owner'
  ) then
    create policy "edges_select_owner" on public.edges
      for select
      using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'edges'
      and policyname = 'edges_insert_owner'
  ) then
    create policy "edges_insert_owner" on public.edges
      for insert
      with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'edges'
      and policyname = 'edges_delete_owner'
  ) then
    create policy "edges_delete_owner" on public.edges
      for delete
      using (owner_id = auth.uid());
  end if;
end $$;

create or replace function public.get_node_detail(
  node_id bigint
)
returns table (
  node jsonb,
  tags text[]
)
language sql
security definer
set search_path = public
as $$
  select
    to_jsonb(n) as node,
    (
      select coalesce(
        array_agg(distinct t.name order by t.name) filter (where t.name is not null),
        '{}'::text[]
      )
      from public.node_tags nt
      join public.tags t on t.id = nt.tag_id and t.owner_id = auth.uid()
      where nt.node_id = n.id
    ) as tags
  from public.nodes n
  where n.id = node_id
    and n.owner_id = auth.uid();
$$;

create or replace function public.get_node_links(
  node_id bigint
)
returns table (
  edge_id bigint,
  direction text,
  relation text,
  from_node_id bigint,
  to_node_id bigint,
  other_node_id bigint,
  other_node_title text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select * from (
    select
      e.id as edge_id,
      'outgoing'::text as direction,
      e.relation,
      e.from_node_id,
      e.to_node_id,
      e.to_node_id as other_node_id,
      n.title as other_node_title,
      e.created_at
    from public.edges e
    join public.nodes n on n.id = e.to_node_id and n.owner_id = auth.uid()
    where e.owner_id = auth.uid()
      and e.from_node_id = node_id

    union all

    select
      e.id as edge_id,
      'incoming'::text as direction,
      e.relation,
      e.from_node_id,
      e.to_node_id,
      e.from_node_id as other_node_id,
      n.title as other_node_title,
      e.created_at
    from public.edges e
    join public.nodes n on n.id = e.from_node_id and n.owner_id = auth.uid()
    where e.owner_id = auth.uid()
      and e.to_node_id = node_id
  ) links
  order by created_at desc;
$$;

create or replace function public.create_edge(
  to_node_id bigint,
  from_node_id bigint,
  relation text default 'related'
)
returns table (
  id bigint,
  owner_id uuid,
  from_node_id bigint,
  to_node_id bigint,
  relation text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  insert into public.edges (owner_id, from_node_id, to_node_id, relation)
  select
    auth.uid(),
    from_node_id,
    to_node_id,
    coalesce(relation, 'related')
  where from_node_id <> to_node_id
    and exists (
      select 1
      from public.nodes n
      where n.id = from_node_id
        and n.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.nodes n
      where n.id = to_node_id
        and n.owner_id = auth.uid()
    )
  returning id, owner_id, from_node_id, to_node_id, relation, created_at;
$$;

create or replace function public.delete_edge(
  edge_id bigint
)
returns table (
  id bigint
)
language sql
security definer
set search_path = public
as $$
  delete from public.edges
  where id = edge_id
    and owner_id = auth.uid()
  returning id;
$$;

grant execute on function public.get_node_detail(bigint) to authenticated;
grant execute on function public.get_node_links(bigint) to authenticated;
grant execute on function public.create_edge(bigint, bigint, text) to authenticated;
grant execute on function public.delete_edge(bigint) to authenticated;

commit;
