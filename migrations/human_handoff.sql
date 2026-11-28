
-- Persistent per-phone switch; only service_role can read/change.
create table if not exists public.yoosal_bot_handoffs (
  phone text primary key check (phone ~ '^[0-9]{6,20}$'),
  mode text not null default 'auto' check (mode in ('auto','human')),
  reason text,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.yoosal_bot_handoffs enable row level security;
revoke all on public.yoosal_bot_handoffs from public, anon, authenticated;
grant select, insert, update on public.yoosal_bot_handoffs to service_role;
create index if not exists yoosal_bot_handoffs_human_idx on public.yoosal_bot_handoffs(updated_at desc) where mode='human';

-- Must serialize switches, claim, prepare and dispatch gate on the phone advisory lock.
create or replace function public.yoosal_bot_set_mode(p_phone text,p_mode text,p_reason text default null,p_actor text default null)
returns jsonb language plpgsql set search_path='' as $$
declare new_state jsonb;
begin
 if p_phone !~ '^[0-9]{6,20}$' or p_mode not in ('auto','human') then raise exception 'Invalid mode request'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,0));
 insert into public.yoosal_bot_handoffs(phone,mode,reason,updated_by,updated_at)
 values(p_phone,p_mode,left(coalesce(p_reason,''),100),left(coalesce(p_actor,''),160),now())
 on conflict(phone) do update set mode=excluded.mode,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
 if p_mode='human' then
  update public.yoosal_bot_sessions set state=(state - 'expiresAt')||jsonb_build_object('stage','human','data','{}'::jsonb,'lastOptions','[]'::jsonb,'numberedFallback',false) where phone=p_phone;
  -- Do not attempt unsent auto replies after takeover.
  update public.yoosal_bot_outbox set status='failed',error_code='human_takeover',updated_at=now()
  where phone=p_phone and status='sending';
 else
  update public.yoosal_bot_sessions set state=jsonb_build_object('stage','menu','data','{}'::jsonb,'lastOptions','[]'::jsonb,'numberedFallback',false) where phone=p_phone;
 end if;
 select jsonb_build_object('phone',p_phone,'mode',p_mode,'reason',coalesce(p_reason,'')) into new_state;
 return new_state;
end $$;

create or replace function public.yoosal_bot_claim_context(p_phone text,p_id text,p_ts bigint,p_token uuid)
returns jsonb language plpgsql set search_path='' as $$
declare st text;ctx jsonb;conf jsonb;chat_mode text;
begin
 st:=public.yoosal_bot_claim(p_phone,p_id,p_ts,p_token);
 if st<>'claimed' then return jsonb_build_object('status',st);end if;
 select state into ctx from public.yoosal_bot_sessions where phone=p_phone;
 select config into conf from public.yoosal_bot_config where id=1;
 select mode into chat_mode from public.yoosal_bot_handoffs where phone=p_phone;
 return jsonb_build_object('status',st,'state',coalesce(ctx,'{}'::jsonb),'config',coalesce(conf,'{}'::jsonb),'mode',coalesce(chat_mode,'auto'));
end $$;

-- Records a new inbound message while human is talking; never calls the bot.
create or replace function public.yoosal_bot_human_inbound(p_phone text,p_id text,p_token uuid,p_ts bigint,p_in text,p_type text)
returns boolean language plpgsql set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,0));
 if not exists(select 1 from public.yoosal_bot_handoffs where phone=p_phone and mode='human') then return false;end if;
 update public.yoosal_bot_events set processed=true where message_id=p_id and phone=p_phone and claim_token=p_token and not processed;
 if not found then return false;end if;
 insert into public.yoosal_bot_sessions(phone,state,last_message_id) values(p_phone,jsonb_build_object('stage','human','lastInboundTs',p_ts,'lastOptions','[]'::jsonb),p_id)
 on conflict(phone) do update set state=(public.yoosal_bot_sessions.state - 'expiresAt')||jsonb_build_object('stage','human','lastInboundTs',p_ts,'lastOptions','[]'::jsonb),last_message_id=excluded.last_message_id;
 insert into public.yoosal_bot_history(event_id,phone,direction,body,message_type) values(p_id,p_phone,'in',left(p_in,4096),left(p_type,30)) on conflict(event_id,direction) do nothing;
 return true;
end $$;

-- Atomic preparation and human-request capture. Throws if mode changed during processing.
create or replace function public.yoosal_bot_prepare(p_phone text,p_id text,p_token uuid,p_state jsonb,p_ts bigint,p_reply jsonb,p_in text,p_type text,p_lead jsonb)
returns uuid language plpgsql set search_path='' as $$
declare oid uuid; requested_human boolean := p_state->>'stage'='human';
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,0));
 if exists(select 1 from public.yoosal_bot_handoffs where phone=p_phone and mode='human') then return null;end if;
 update public.yoosal_bot_events set processed=true where message_id=p_id and phone=p_phone and claim_token=p_token and not processed;
 if not found then return null;end if;
 insert into public.yoosal_bot_sessions(phone,state,last_message_id) values(p_phone,p_state||jsonb_build_object('lastInboundTs',p_ts),p_id)
 on conflict(phone) do update set state=excluded.state,last_message_id=excluded.last_message_id;
 if p_lead is not null and jsonb_typeof(p_lead)='object' then
  insert into public.yoosal_bot_leads(message_id,phone,service,name,business,details)
  values(p_id,p_phone,p_lead->>'service',p_lead->>'name',p_lead->>'business',p_lead->>'details') on conflict(message_id) do nothing;
 end if;
 insert into public.yoosal_bot_history(event_id,phone,direction,body,message_type)
 values(p_id,p_phone,'in',p_in,p_type),(p_id,p_phone,'out',p_reply->>'text',case when jsonb_array_length(p_reply->'options')>0 then 'menu' else 'text' end)
 on conflict(event_id,direction) do nothing;
 insert into public.yoosal_bot_outbox(event_id,phone) values(p_id,p_phone) returning id into oid;
 if requested_human then
  insert into public.yoosal_bot_handoffs(phone,mode,reason,updated_by,updated_at) values(p_phone,'human','customer_requested','customer',now())
  on conflict(phone) do update set mode='human',reason='customer_requested',updated_by='customer',updated_at=now();
 end if;
 return oid;
end $$;

-- Block sending any queued auto message once human mode is active, except the human acknowledgment.
create or replace function public.yoosal_bot_can_dispatch(p_phone text,p_id uuid)
returns boolean language plpgsql set search_path='' as $$
declare ev text; current_status text; human_mode text; reason text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,0));
 select event_id,status into ev,current_status from public.yoosal_bot_outbox where id=p_id and phone=p_phone for update;
 if not found or current_status<>'sending' then return false;end if;
 select mode,reason into human_mode,reason from public.yoosal_bot_handoffs where phone=p_phone;
 if human_mode='human' and not (reason='customer_requested' and ev !~ '^expiry:' and exists(select 1 from public.yoosal_bot_sessions s where s.phone=p_phone and s.last_message_id=ev)) then
  update public.yoosal_bot_outbox set status='failed',error_code='human_takeover',updated_at=now() where id=p_id;
  return false;
 end if;
 return true;
end $$;

-- Expiry worker must exclude human sessions, including if a previously prepared expiry is awaiting dispatch.
create or replace function public.yoosal_bot_expire_due(p_text text)
returns jsonb language plpgsql set search_path='' as $$
declare rec record; current_state jsonb; ev text; oid uuid; epoch bigint:=floor(extract(epoch from now()))::bigint;items jsonb:='[]'::jsonb;
begin
 for rec in select s.phone,s.last_message_id from public.yoosal_bot_sessions s
 where not exists(select 1 from public.yoosal_bot_handoffs h where h.phone=s.phone and h.mode='human')
 and case when s.state->>'expiresAt' ~ '^[0-9]{1,12}$' then (s.state->>'expiresAt')::bigint between epoch-1800 and epoch else false end
 order by (s.state->>'expiresAt') limit 20 loop
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(rec.phone,0)) then continue;end if;
  if exists(select 1 from public.yoosal_bot_handoffs where phone=rec.phone and mode='human') then continue;end if;
  select s.state into current_state from public.yoosal_bot_sessions s where s.phone=rec.phone and s.last_message_id=rec.last_message_id for update;
  if not found or current_state->>'stage' in ('done','expired','human') or not (current_state->>'expiresAt' ~ '^[0-9]{1,12}$') then continue;end if;
  if (current_state->>'expiresAt')::bigint>epoch or (current_state->>'expiresAt')::bigint<epoch-1800 then continue;end if;
  if exists(select 1 from public.yoosal_bot_events where phone=rec.phone and not processed and claimed_at>now()-interval '2 minutes') then continue;end if;
  if not exists(select 1 from public.yoosal_bot_outbox where event_id=rec.last_message_id and status in ('accepted','sent','delivered','read')) then continue;end if;
  ev:='expiry:'||rec.last_message_id;
  insert into public.yoosal_bot_outbox(event_id,phone) values(ev,rec.phone) on conflict(event_id) do nothing returning id into oid;
  if not found then continue;end if;
  update public.yoosal_bot_sessions set state=jsonb_build_object('stage','expired','data','{}'::jsonb,'lastInboundTs',current_state->'lastInboundTs','lastOptions','[]'::jsonb,'numberedFallback',false) where phone=rec.phone;
  insert into public.yoosal_bot_history(event_id,phone,direction,body,message_type) values(ev,rec.phone,'out',p_text,'text') on conflict(event_id,direction) do nothing;
  items:=items||jsonb_build_array(jsonb_build_object('id',oid,'phone',rec.phone,'last_message_id',rec.last_message_id));
 end loop;
 return items;
end $$;

-- Existing stale-interaction completion must not overwrite a newly activated human session.
create or replace function public.yoosal_bot_finish(p_phone text,p_id text,p_token uuid,p_state jsonb,p_ts bigint)
returns boolean language plpgsql set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,0));
 update public.yoosal_bot_events set processed=true where message_id=p_id and phone=p_phone and claim_token=p_token and not processed;
 if not found then return false;end if;
 if exists(select 1 from public.yoosal_bot_handoffs where phone=p_phone and mode='human') then return true;end if;
 insert into public.yoosal_bot_sessions(phone,state,last_message_id) values(p_phone,p_state||jsonb_build_object('lastInboundTs',p_ts),p_id)
 on conflict(phone) do update set state=excluded.state,last_message_id=excluded.last_message_id;
 return true;
end $$;
-- This application accesses these functions from a trusted server only.
revoke all on function public.yoosal_bot_set_mode(text,text,text,text) from PUBLIC, anon, authenticated;
revoke all on function public.yoosal_bot_human_inbound(text,text,uuid,bigint,text,text) from PUBLIC, anon, authenticated;
revoke all on function public.yoosal_bot_can_dispatch(text,uuid) from PUBLIC, anon, authenticated;
grant execute on function public.yoosal_bot_set_mode(text,text,text,text) to service_role;
grant execute on function public.yoosal_bot_human_inbound(text,text,uuid,bigint,text,text) to service_role;
grant execute on function public.yoosal_bot_can_dispatch(text,uuid) to service_role;
