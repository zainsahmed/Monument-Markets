-- Indexes, triggers, deterministic classification, seed data.

-- updated_at on every table
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end $$;

-- indexes
create index opportunities_naics on public.opportunities (naics);
create index opportunities_psc on public.opportunities (psc);
create index opportunities_department on public.opportunities (department);
create index opportunities_response_deadline on public.opportunities (response_deadline);
create index opportunities_notice_type_code on public.opportunities (notice_type_code);
create index opportunities_active on public.opportunities (active);
create index opportunities_color_label on public.opportunities (color_label);
create index opportunities_posted_date on public.opportunities (posted_date desc);
create index opportunities_solnum on public.opportunities (solicitation_number);
create index opportunities_search on public.opportunities using gin (search_vector);
create index document_pages_search on public.document_pages using gin (search_vector);
create index document_pages_doc on public.document_pages (document_id, page_number);
create index company_opportunities_stage on public.company_opportunities (company_id, pipeline_stage);
create index company_opportunities_opp on public.company_opportunities (opportunity_id);
create index alerts_user_read on public.alerts (user_id, read_at);
create index activity_log_opp on public.activity_log (opportunity_id, created_at desc);
create index activity_log_company on public.activity_log (company_id, created_at desc);
create index amendments_opp on public.opportunity_amendments (opportunity_id, detected_at desc);
create index historical_awards_opp on public.historical_awards (opportunity_id);
create index sync_runs_started on public.sync_runs (source, started_at desc);
create index rate_limit_lookup on public.rate_limit_events (user_id, bucket, created_at desc);
create index checklist_items_co on public.checklist_items (company_opportunity_id);
create index notes_co on public.notes (company_opportunity_id, created_at desc);
create index tasks_co on public.tasks (company_opportunity_id);
create index tasks_due on public.tasks (company_id, due_date) where done = false;

-- search vector
create or replace function public.opportunities_search_trigger() returns trigger
language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.solicitation_number,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.department,'') || ' ' || coalesce(new.sub_tier,'') || ' ' || coalesce(new.office,'')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.description,'')), 'B');
  return new;
end $$;
create trigger opportunities_search before insert or update of title, solicitation_number, department, sub_tier, office, description
  on public.opportunities for each row execute function public.opportunities_search_trigger();

-- Deterministic classification (mirrors lib/classification.ts; a test asserts parity).
-- GREEN: bid-type notice (o, k, DIBBS RFQ), active, deadline in the future.
-- RED: award / justification / inactive / cancelled / deadline passed.
-- YELLOW: everything else (sources sought, presolicitation, special notice, intent to bundle,
--         bid-type notice with no deadline, other types).
create or replace function public.compute_color_label(
  p_type_code text, p_active boolean, p_cancelled boolean, p_deadline timestamptz, p_now timestamptz default now()
) returns text language sql immutable as $$
  select case
    when p_type_code in ('a','u') or p_active = false or p_cancelled = true then 'RED'
    when p_deadline is not null and p_deadline <= p_now then 'RED'
    when p_type_code in ('o','k','dibbs_rfq') and p_deadline is not null then 'GREEN'
    else 'YELLOW'
  end
$$;

create or replace function public.opportunities_color_trigger() returns trigger
language plpgsql as $$
begin
  new.color_label := public.compute_color_label(new.notice_type_code, new.active, new.cancelled, new.response_deadline);
  return new;
end $$;
create trigger opportunities_color before insert or update of notice_type_code, active, cancelled, response_deadline
  on public.opportunities for each row execute function public.opportunities_color_trigger();

-- Time-dependent: run after each sync and daily.
create or replace function public.refresh_color_labels() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.opportunities o
     set color_label = public.compute_color_label(o.notice_type_code, o.active, o.cancelled, o.response_deadline)
   where color_label is distinct from public.compute_color_label(o.notice_type_code, o.active, o.cancelled, o.response_deadline);
  get diagnostics n = row_count;
  return n;
end $$;

-- Mark inactive once past archive_date.
create or replace function public.deactivate_archived() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.opportunities set active = false
   where active and archive_date is not null and archive_date < current_date;
  get diagnostics n = row_count;
  return n;
end $$;

-- Checklist integrity: PASS can only be set by a signed-in user (auth.uid() not null).
-- The server's AI code runs with the service role (auth.uid() is null) and so can only
-- write ai_suggestion, never PASS. (principle: UNKNOWN never becomes PASS)
create or replace function public.checklist_guard() returns trigger
language plpgsql as $$
begin
  if new.status = 'PASS' and (tg_op = 'INSERT' or old.status is distinct from 'PASS') and auth.uid() is null then
    raise exception 'checklist PASS can only be set by a user';
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;
create trigger checklist_guard before insert or update on public.checklist_items
  for each row execute function public.checklist_guard();

-- Never leave a company without an owner.
create or replace function public.guard_last_owner() returns trigger
language plpgsql as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if not exists (select 1 from public.company_members where company_id = old.company_id and role = 'owner' and id <> old.id)
       and exists (select 1 from public.companies where id = old.company_id) then
      raise exception 'cannot remove the last owner of a company';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_last_owner before update or delete on public.company_members
  for each row execute function public.guard_last_owner();

-- Submitted is set manually only: a pipeline move to 'submitted' needs a note + timestamp.
create or replace function public.pipeline_guard() returns trigger
language plpgsql as $$
begin
  if new.pipeline_stage is distinct from old.pipeline_stage then
    new.stage_entered_at := now();
    if new.pipeline_stage = 'submitted' and (new.submitted_note is null or length(trim(new.submitted_note)) = 0) then
      raise exception 'moving to Submitted requires a confirmation note (submitted manually by you)';
    end if;
    if new.pipeline_stage = 'submitted' then new.submitted_at := coalesce(new.submitted_at, now()); end if;
  end if;
  return new;
end $$;
create trigger pipeline_guard before update on public.company_opportunities
  for each row execute function public.pipeline_guard();

-- seed
insert into public.pipeline_stages (key, label, position, terminal) values
  ('new','New',1,false), ('reviewing','Reviewing',2,false), ('researching','Researching',3,false),
  ('sourcing','Sourcing',4,false), ('pricing','Pricing',5,false), ('ready_to_bid','Ready to Bid',6,false),
  ('submitted','Submitted',7,false), ('won','Won',8,true), ('lost_passed','Lost/Passed',9,true);
