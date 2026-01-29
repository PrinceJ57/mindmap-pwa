begin;

-- Normalize auth.uid() usage in RLS policies so it is evaluated once per statement.
do $$
declare
  pol record;
  new_qual text;
  new_check text;
  sql text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('nodes', 'tags', 'node_tags', 'edges', 'saved_views', 'node_reviews')
  loop
    new_qual := pol.qual;
    if new_qual is not null then
      new_qual := regexp_replace(new_qual, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;

    new_check := pol.with_check;
    if new_check is not null then
      new_check := regexp_replace(new_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;

    sql := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if new_qual is not null then
      sql := sql || ' using (' || new_qual || ')';
    end if;
    if new_check is not null then
      sql := sql || ' with check (' || new_check || ')';
    end if;

    execute sql;
  end loop;
end $$;

-- Drop duplicate edges policies when owner-specific alternatives exist.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_select_own'
  ) and exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_select_owner'
  ) then
    drop policy "edges_select_own" on public.edges;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_insert_own'
  ) and exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_insert_owner'
  ) then
    drop policy "edges_insert_own" on public.edges;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_delete_own'
  ) and exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'edges' and policyname = 'edges_delete_owner'
  ) then
    drop policy "edges_delete_own" on public.edges;
  end if;
end $$;

commit;
