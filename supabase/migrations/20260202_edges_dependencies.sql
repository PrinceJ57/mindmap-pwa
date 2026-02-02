begin;

create index if not exists edges_owner_relation_idx on public.edges (owner_id, relation);

create or replace function public.list_edges_for_nodes(
  node_ids bigint[],
  relation_filter text default null
)
returns table (
  id bigint,
  from_node_id bigint,
  to_node_id bigint,
  relation text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.from_node_id,
    e.to_node_id,
    e.relation,
    e.created_at
  from public.edges e
  where e.owner_id = auth.uid()
    and (
      relation_filter is null
      or e.relation = relation_filter
    )
    and (
      e.from_node_id = any(node_ids)
      or e.to_node_id = any(node_ids)
    );
$$;

grant execute on function public.list_edges_for_nodes(bigint[], text) to authenticated;

commit;
