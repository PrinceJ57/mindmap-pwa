# Security Model

This app is a client-only Vite SPA using Supabase Auth + Postgres RLS. All authorization is enforced in the database; client filters are defense-in-depth only.

## Keys and secrets
- Client uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never ship a service role key to the browser or commit it to this repo.
- OAuth redirect target is controlled by `VITE_SITE_URL` (see `DEPLOYMENT.md`).

## RLS policy intent (owner isolation)
User-owned data is protected by RLS with `owner_id = auth.uid()` or indirect ownership checks.

Tables and intent:
- `nodes`: Users can select/insert/update/delete only their own nodes.
- `tags`: Users can select/insert/update/delete only their own tags. Tag names are lowercase and unique per user.
- `node_tags`: Users can only link their own nodes to their own tags (both sides must belong to auth.uid()).
- `edges`: Users can only read/write edges where both `from_node_id` and `to_node_id` belong to them.
- `saved_views`: Users can select/insert/update/delete only their own saved views.

Notes:
- RPCs (e.g., `list_nodes`, `search_nodes`, `create_edge`) are `SECURITY DEFINER` but explicitly scope by `auth.uid()` in SQL.
- If you add new tables, enable RLS and add owner-scoped policies before using them in the client.

## Threat model (short)
- Assume a malicious client can call any Supabase endpoint with their own auth token.
- The DB must reject any cross-user reads/writes regardless of client-side filtering.
- Client-side owner filters are helpful but never sufficient.

## “Evil twin” verification
Goal: confirm User B cannot read or mutate User A’s data.

1) Create two users (A and B). Log in with two separate browser profiles.
2) As User A:
   - Create a node, tag it, and copy the node id from `/node/:id`.
3) As User B:
   - Navigate to `/node/:id` with A’s id → should show “Node not found.”
   - In DevTools, try:
     - `supabase.from('nodes').select('*').eq('id', A_ID)` → should return empty.
     - `supabase.from('nodes').update({ status: 'archived' }).eq('id', A_ID)` → should fail or affect 0 rows.
     - `supabase.from('node_tags').insert({ node_id: A_ID, tag_id: B_TAG_ID })` → should fail.
     - `supabase.from('edges').insert({ owner_id: B_ID, from_node_id: A_ID, to_node_id: B_ID })` → should fail.

## Common foot-guns
- Missing RLS on new tables.
- Join tables (`node_tags`, `edges`) that don’t verify ownership on both sides.
- Relying on client filters without RLS.
- Storing offline queue content in localStorage (privacy on shared devices).

## Key rotation checklist
- Rotate Supabase anon keys in Supabase dashboard.
- Update `VITE_SUPABASE_ANON_KEY` in Vercel and local `.env`.
- Verify login and CRUD flows still work after rotation.
