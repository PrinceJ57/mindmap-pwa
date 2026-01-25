begin;

create or replace function public.list_nodes(
  lim integer default 200,
  q text default null,
  type_filter text default null,
  status_filter text[] default null,
  tag_filter text[] default null
)
returns table (
  id bigint,
  type text,
  title text,
  body text,
  status text,
  created_at timestamptz,
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
  group by n.id, n.type, n.title, n.body, n.status, n.created_at
  order by n.created_at desc
  limit lim;
$$;

create or replace function public.set_node_status(
  node_id bigint,
  new_status text
)
returns table (
  id bigint,
  status text
)
language sql
security definer
set search_path = public
as $$
  update public.nodes
  set status = new_status
  where id = node_id
    and owner_id = auth.uid()
  returning id, status;
$$;

grant execute on function public.list_nodes(integer, text, text, text[], text[]) to authenticated;
grant execute on function public.set_node_status(bigint, text) to authenticated;

commit;
