begin;

-- Tighten edge policies to ensure links cannot cross users.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_select_owner'
  ) then
    alter policy edges_select_owner on public.edges
      using (
        owner_id = auth.uid()
        and exists (
          select 1 from public.nodes n
          where n.id = edges.from_node_id and n.owner_id = auth.uid()
        )
        and exists (
          select 1 from public.nodes n
          where n.id = edges.to_node_id and n.owner_id = auth.uid()
        )
      );
  else
    create policy edges_select_owner on public.edges
      for select
      using (
        owner_id = auth.uid()
        and exists (
          select 1 from public.nodes n
          where n.id = edges.from_node_id and n.owner_id = auth.uid()
        )
        and exists (
          select 1 from public.nodes n
          where n.id = edges.to_node_id and n.owner_id = auth.uid()
        )
      );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_insert_owner'
  ) then
    alter policy edges_insert_owner on public.edges
      with check (
        owner_id = auth.uid()
        and exists (
          select 1 from public.nodes n
          where n.id = edges.from_node_id and n.owner_id = auth.uid()
        )
        and exists (
          select 1 from public.nodes n
          where n.id = edges.to_node_id and n.owner_id = auth.uid()
        )
      );
  else
    create policy edges_insert_owner on public.edges
      for insert
      with check (
        owner_id = auth.uid()
        and exists (
          select 1 from public.nodes n
          where n.id = edges.from_node_id and n.owner_id = auth.uid()
        )
        and exists (
          select 1 from public.nodes n
          where n.id = edges.to_node_id and n.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_update_owner'
  ) then
    create policy edges_update_owner on public.edges
      for update
      using (
        owner_id = auth.uid()
        and exists (
          select 1 from public.nodes n
          where n.id = edges.from_node_id and n.owner_id = auth.uid()
        )
        and exists (
          select 1 from public.nodes n
          where n.id = edges.to_node_id and n.owner_id = auth.uid()
        )
      )
      with check (
        owner_id = auth.uid()
        and exists (
          select 1 from public.nodes n
          where n.id = edges.from_node_id and n.owner_id = auth.uid()
        )
        and exists (
          select 1 from public.nodes n
          where n.id = edges.to_node_id and n.owner_id = auth.uid()
        )
      );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_delete_owner'
  ) then
    alter policy edges_delete_owner on public.edges
      using (
        owner_id = auth.uid()
        and exists (
          select 1 from public.nodes n
          where n.id = edges.from_node_id and n.owner_id = auth.uid()
        )
        and exists (
          select 1 from public.nodes n
          where n.id = edges.to_node_id and n.owner_id = auth.uid()
        )
      );
  else
    create policy edges_delete_owner on public.edges
      for delete
      using (
        owner_id = auth.uid()
        and exists (
          select 1 from public.nodes n
          where n.id = edges.from_node_id and n.owner_id = auth.uid()
        )
        and exists (
          select 1 from public.nodes n
          where n.id = edges.to_node_id and n.owner_id = auth.uid()
        )
      );
  end if;
end $$;

-- Add update policy for node_tags (defense-in-depth).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'node_tags' and policyname = 'node_tags_update_owner'
  ) then
    create policy node_tags_update_owner on public.node_tags
      for update
      using (
        exists (
          select 1 from public.nodes n
          where n.id = node_tags.node_id and n.owner_id = auth.uid()
        ) and exists (
          select 1 from public.tags t
          where t.id = node_tags.tag_id and t.owner_id = auth.uid()
        )
      )
      with check (
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
