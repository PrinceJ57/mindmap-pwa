# Deployment (Vercel + Supabase)

This repo is a Vite SPA backed by Supabase. Use this as the repeatable deploy runbook.

## Prereqs
- A Supabase project (Postgres + Auth).
- A Vercel project connected to this repo.
- Google OAuth enabled in Supabase Auth (if you want Google login).

## Environment variables
Create `.env` locally (see `.env.example`) and set the same vars in Vercel:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SITE_URL=https://your-vercel-domain.vercel.app
```

Notes:
- `VITE_SITE_URL` is used for OAuth redirect in `src/pages/Login.tsx`.
- For local dev, you can omit `VITE_SITE_URL` and it will default to the current origin.

## Supabase schema + RLS
Migrations live in `supabase/migrations`. Apply them in order using the Supabase SQL Editor:
1. Supabase Dashboard → SQL Editor → New query.
2. Paste each migration file in order and run.

If you already have a production schema, export it and compare before applying:
- Supabase Dashboard → Database → Schema → (export SQL), then diff against this repo.

### Rollback notes
If you need to roll back the base schema migration, drop in reverse order:
```
drop table if exists public.node_tags;
drop table if exists public.tags;
drop table if exists public.nodes;
```
Only do this on a fresh project or after exporting data.

## OAuth redirect URLs (Supabase Auth)
Add redirect URLs in Supabase Dashboard → Auth → URL Configuration:
```
http://localhost:5173/*
https://your-vercel-domain.vercel.app/*
https://*.vercel.app/*
```
Use the production domain for `VITE_SITE_URL` to avoid preview deployments redirecting to dead URLs.

## Vercel settings
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- SPA rewrite: already handled by `vercel.json`

## Local dev
```
npm install
npm run dev
```

## First deploy smoke test
- Visit `/login` and sign in with Google.
- Create a node in `/capture`.
- Add a tag; verify tags autocomplete on subsequent edits.
- Search for the node and open its detail view.
