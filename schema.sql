-- Already applied in the agreed shared test database. Do not reapply blindly.
create table public.yoosal_bot_sessions (phone text primary key, state jsonb not null default '{}'::jsonb, last_message_id text);
create table public.yoosal_bot_leads (message_id text primary key, phone text not null, service text not null, name text not null, business text not null, details text not null, created_at timestamptz not null default now());
alter table public.yoosal_bot_sessions enable row level security;
alter table public.yoosal_bot_leads enable row level security;
revoke all on public.yoosal_bot_sessions, public.yoosal_bot_leads from public, anon, authenticated;
grant select, insert, update on public.yoosal_bot_sessions, public.yoosal_bot_leads to service_role;