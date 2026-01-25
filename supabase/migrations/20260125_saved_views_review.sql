begin;

-- Ensure node review/pin metadata exists
alter table public.nodes
  add column if not exists updated_at timestamptz default now(),
  add column if not exists pinned boolean default false,
  add column if not exists review_after timestamptz null;

update public.nodes
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_nodes_updated_at'
  ) then
    create trigger set_nodes_updated_at
    before update on public.nodes
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- Saved views table
create table if not exists public.saved_views (
  id bigserial primary key,
  owner_id uuid not null,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'saved_views_owner_name_unique'
  ) then
    alter table public.saved_views
      add constraint saved_views_owner_name_unique unique (owner_id, name);
  end if;
end $$;

alter table public.saved_views enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_views'
      and policyname = 'saved_views_select'
  ) then
    create policy saved_views_select
      on public.saved_views for select
      using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_views'
      and policyname = 'saved_views_insert'
  ) then
    create policy saved_views_insert
      on public.saved_views for insert
      with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_views'
      and policyname = 'saved_views_update'
  ) then
    create policy saved_views_update
      on public.saved_views for update
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_views'
      and policyname = 'saved_views_delete'
  ) then
    create policy saved_views_delete
      on public.saved_views for delete
      using (owner_id = auth.uid());
  end if;
end $$;


do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_saved_views_updated_at'
  ) then
    create trigger set_saved_views_updated_at
    before update on public.saved_views
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- Extend list_nodes for pinned/review use
create or replace function public.list_nodes(
  lim integer default 200,
  q text default null,
  type_filter text default null,
  status_filter text[] default null,
  tag_filter text[] default null,
  pinned_only boolean default false,
  review_due_only boolean default false
)
returns table (
  id bigint,
  type text,
  title text,
  body text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  pinned boolean,
  review_after timestamptz,
  tags text[]
)
language sql
security definer
set search_path = public
as $$
  with query as (
    select
      case
        when q is null or btrim(q) = '' then null
        else plainto_tsquery('english', q)
      end as tsq,
      case
        when q is null or btrim(q) = '' then null
        else '%' || q || '%'
      end as ilike_q
  )
  select
    n.id,
    n.type,
    n.title,
    n.body,
    n.status,
    n.created_at,
    n.updated_at,
    n.pinned,
    n.review_after,
    coalesce(
      array_agg(distinct t.name order by t.name) filter (where t.name is not null),
      '{}'::text[]
    ) as tags
  from public.nodes n
  left join public.node_tags nt on nt.node_id = n.id
  left join public.tags t on t.id = nt.tag_id and t.owner_id = auth.uid()
  cross join query
  where n.owner_id = auth.uid()
    and (type_filter is null or n.type = type_filter)
    and (
      status_filter is null
      or array_length(status_filter, 1) is null
      or n.status = any(status_filter)
    )
    and (
      pinned_only is false or n.pinned is true
    )
    and (
      review_due_only is false
      or n.review_after is null
      or n.review_after <= now()
    )
    and (
      query.tsq is null
      or (n.search is not null and n.search @@ query.tsq)
      or (
        n.search is null
        and query.ilike_q is not null
        and (n.title ilike query.ilike_q or n.body ilike query.ilike_q)
      )
    )
    and (
      tag_filter is null
      or array_length(tag_filter, 1) is null
      or (
        select count(distinct t2.name)
        from public.node_tags nt2
        join public.tags t2 on t2.id = nt2.tag_id and t2.owner_id = auth.uid()
        where nt2.node_id = n.id
          and t2.name = any(tag_filter)
      ) = array_length(tag_filter, 1)
    )
  group by n.id, n.type, n.title, n.body, n.status, n.created_at, n.updated_at, n.pinned, n.review_after
  order by n.pinned desc, coalesce(n.updated_at, n.created_at) desc
  limit lim;
$$;

create or replace function public.set_node_pinned(
  node_id bigint,
  pinned boolean
)
returns table (
  id bigint,
  pinned boolean
)
language sql
security definer
set search_path = public
as $$
  update public.nodes
  set pinned = set_node_pinned.pinned
  where id = node_id
    and owner_id = auth.uid()
  returning id, pinned;
$$;

create or replace function public.set_node_review_after(
  node_id bigint,
  review_after timestamptz
)
returns table (
  id bigint,
  review_after timestamptz
)
language sql
security definer
set search_path = public
as $$
  update public.nodes
  set review_after = set_node_review_after.review_after
  where id = node_id
    and owner_id = auth.uid()
  returning id, review_after;
$$;

grant execute on function public.list_nodes(integer, text, text, text[], text[], boolean, boolean) to authenticated;
grant execute on function public.set_node_pinned(bigint, boolean) to authenticated;
grant execute on function public.set_node_review_after(bigint, timestamptz) to authenticated;

commit;
