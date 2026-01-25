begin;

alter table public.nodes
  add column if not exists search tsvector;

do $$
declare
  is_generated boolean := false;
begin
  select (a.attgenerated <> '')
  into is_generated
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'nodes'
    and a.attname = 'search'
    and a.attnum > 0
    and not a.attisdropped;

  if is_generated then
    if exists (
      select 1 from pg_trigger where tgname = 'nodes_search_update_trigger'
    ) then
      drop trigger nodes_search_update_trigger on public.nodes;
    end if;
    drop function if exists public.nodes_search_update();
  else
    create or replace function public.nodes_search_update()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.search := to_tsvector('english', coalesce(new.title, '') || ' ' || coalesce(new.body, ''));
      return new;
    end
    $fn$;

    if not exists (
      select 1 from pg_trigger where tgname = 'nodes_search_update_trigger'
    ) then
      create trigger nodes_search_update_trigger
      before insert or update on public.nodes
      for each row execute function public.nodes_search_update();
    end if;

    update public.nodes
    set search = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
    where search is null;
  end if;
end
$$;

create index if not exists nodes_search_gin
  on public.nodes using gin (search);

create or replace function public.search_nodes(
  q text,
  lim integer default 50,
  type_filter text default null,
  status_filter text default null,
  tag_filter text[] default null
)
returns table (
  id bigint,
  type text,
  title text,
  body text,
  status text,
  created_at timestamptz,
  tags text[],
  rank real
)
language sql
security definer
set search_path = public
as $$
  with query as (
    select case
      when q is null or btrim(q) = '' then null
      else plainto_tsquery('english', q)
    end as tsq
  )
  select
    n.id,
    n.type,
    n.title,
    n.body,
    n.status,
    n.created_at,
    coalesce(
      array_agg(distinct t.name order by t.name) filter (where t.name is not null),
      '{}'::text[]
    ) as tags,
    coalesce(ts_rank(n.search, query.tsq), 0) as rank
  from public.nodes n
  left join public.node_tags nt on nt.node_id = n.id
  left join public.tags t on t.id = nt.tag_id and t.owner_id = auth.uid()
  cross join query
  where n.owner_id = auth.uid()
    and (type_filter is null or n.type = type_filter)
    and (status_filter is null or n.status = status_filter)
    and (query.tsq is null or n.search @@ query.tsq)
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
  group by n.id, n.type, n.title, n.body, n.status, n.created_at, n.search, query.tsq
  order by rank desc, n.created_at desc
  limit lim;
$$;

grant execute on function public.search_nodes(text, integer, text, text, text[]) to authenticated;

commit;
