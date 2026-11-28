
create table if not exists public.yoosal_bot_ratings (
 id uuid primary key default gen_random_uuid(),
 phone text not null check(phone ~ '^[0-9]{6,20}$'),
 actor_id text not null,
 actor_name text not null,
 reactivated_at timestamptz not null default now(),
 request_outbox_id uuid,
 skip_reason text,
 rating smallint check(rating between 1 and 5),
 rated_at timestamptz,
 rating_event_id text unique
);
alter table public.yoosal_bot_ratings enable row level security;
revoke all on public.yoosal_bot_ratings from public, anon, authenticated;
grant select,insert,update on public.yoosal_bot_ratings to service_role;
create index if not exists yoosal_bot_ratings_phone_time_idx on public.yoosal_bot_ratings(phone,reactivated_at desc);

create or replace function public.yoosal_bot_resume_with_rating(p_phone text,p_actor text,p_name text,p_text text)
returns jsonb language plpgsql set search_path='' as $$
declare survey uuid; oid uuid; last_ts bigint; mode_now text;
begin
 if p_phone !~ '^[0-9]{6,20}$' or nullif(trim(p_actor),'') is null or nullif(trim(p_name),'') is null then raise exception 'Invalid resume';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,0));
 select mode into mode_now from public.yoosal_bot_handoffs where phone=p_phone;
 if mode_now is distinct from 'human' then return jsonb_build_object('mode','auto','survey_status','already_auto');end if;
 select case when state->>'lastInboundTs' ~ '^[0-9]{1,12}$' then (state->>'lastInboundTs')::bigint end into last_ts from public.yoosal_bot_sessions where phone=p_phone;
 perform public.yoosal_bot_set_mode(p_phone,'auto','dashboard_resume',p_actor);
 insert into public.yoosal_bot_ratings(phone,actor_id,actor_name) values(p_phone,left(p_actor,160),left(p_name,240)) returning id into survey;
 if last_ts is null or last_ts <= extract(epoch from now())::bigint-86400 then
  update public.yoosal_bot_ratings set skip_reason='window_closed' where id=survey;
  return jsonb_build_object('mode','auto','survey_status','window_closed','survey_id',survey);
 end if;
 insert into public.yoosal_bot_outbox(event_id,phone) values('rating:'||survey::text,p_phone) returning id into oid;
 update public.yoosal_bot_ratings set request_outbox_id=oid where id=survey;
 update public.yoosal_bot_sessions set state=state||jsonb_build_object('stage','rating','ratingId',survey::text) where phone=p_phone;
 insert into public.yoosal_bot_history(event_id,phone,direction,body,message_type) values('rating:'||survey::text,p_phone,'out',left(p_text,4096),'rating_request');
 return jsonb_build_object('mode','auto','survey_status','sending','survey_id',survey,'outbox_id',oid);
end $$;

-- Consumes a rating only for the latest matching reactivation, using the existing event claim.
create or replace function public.yoosal_bot_record_rating(p_phone text,p_id text,p_token uuid,p_ts bigint,p_survey uuid,p_rating integer,p_in text,p_type text,p_ack text)
returns jsonb language plpgsql set search_path='' as $$
declare r public.yoosal_bot_ratings%rowtype; st jsonb; oid uuid;
begin
 if p_rating not between 1 and 5 then return null;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone,0));
 if not exists(select 1 from public.yoosal_bot_handoffs where phone=p_phone and mode='auto') then return null;end if;
 select * into r from public.yoosal_bot_ratings where phone=p_phone order by reactivated_at desc,id desc limit 1;
 if not found or r.rating is not null or r.request_outbox_id is null or r.reactivated_at < now()-interval '7 days' or (p_survey is not null and r.id<>p_survey) then return null;end if;
 if not exists(select 1 from public.yoosal_bot_handoffs where phone=p_phone and mode='auto' and updated_at=r.reactivated_at) then return null;end if;
 if not exists(select 1 from public.yoosal_bot_outbox where id=r.request_outbox_id and status in ('sending','accepted','sent','delivered','read','uncertain')) then return null;end if;
 select state into st from public.yoosal_bot_sessions where phone=p_phone;
 if p_survey is null and (st->>'stage' is distinct from 'rating' or st->>'ratingId' is distinct from r.id::text) then return null;end if;
 if st->>'stage'='rating' then st:=jsonb_build_object('stage','menu','data','{}'::jsonb,'lastOptions','[]'::jsonb,'numberedFallback',false);end if;
 oid:=public.yoosal_bot_prepare(p_phone,p_id,p_token,coalesce(st,'{}'::jsonb),p_ts,jsonb_build_object('text',p_ack,'options','[]'::jsonb),p_in,p_type,null);
 if oid is null then return null;end if;
 update public.yoosal_bot_ratings set rating=p_rating,rated_at=now(),rating_event_id=p_id where id=r.id;
 return jsonb_build_object('outbox_id',oid);
end $$;
revoke all on function public.yoosal_bot_resume_with_rating(text,text,text,text) from public,anon,authenticated;
revoke all on function public.yoosal_bot_record_rating(text,text,uuid,bigint,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.yoosal_bot_resume_with_rating(text,text,text,text) to service_role;
grant execute on function public.yoosal_bot_record_rating(text,text,uuid,bigint,uuid,integer,text,text,text) to service_role;
