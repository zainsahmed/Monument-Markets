-- Row Level Security on every table, scoped by company_id and role.
-- Roles: owner (all, incl. members/profile), member (working data), viewer (read-only,
-- no supplier or pricing data). The service role bypasses RLS and is used only by
-- server routes/jobs after they have authenticated the caller.

create or replace function public.member_role(cid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.company_members where company_id = cid and user_id = auth.uid()
$$;
create or replace function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.member_role(cid) is not null $$;
create or replace function public.can_write(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.member_role(cid) in ('owner','member'), false) $$;
create or replace function public.is_owner(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.member_role(cid) = 'owner', false) $$;

create or replace function public.can_see_opportunity(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.opportunities o
     where o.id = oid and (o.company_id is null or public.is_member(o.company_id))
  )
$$;

-- Bootstrap: first sign-in creates a company and makes the caller its owner.
create or replace function public.create_company(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.companies (name) values (p_name) returning id into cid;
  insert into public.company_members (company_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
end $$;

-- Accept pending invites for the signed-in user's email.
create or replace function public.accept_invites() returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer := 0; r record; em text;
begin
  select lower(email) into em from auth.users where id = auth.uid();
  for r in select * from public.company_invites where lower(email) = em and accepted_at is null loop
    insert into public.company_members (company_id, user_id, role) values (r.company_id, auth.uid(), r.role)
      on conflict (company_id, user_id) do nothing;
    update public.company_invites set accepted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Per-user rate limit. Returns true when the call is allowed (and records it).
create or replace function public.check_rate_limit(p_bucket text, p_max integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare c integer;
begin
  if auth.uid() is null then return false; end if;
  select count(*) into c from public.rate_limit_events
   where user_id = auth.uid() and bucket = p_bucket and created_at > now() - make_interval(secs => p_window_seconds);
  if c >= p_max then return false; end if;
  insert into public.rate_limit_events (user_id, bucket) values (auth.uid(), p_bucket);
  return true;
end $$;

create or replace function public.ai_spend_this_month(cid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when public.is_member(cid) then
    coalesce((select sum(cost_usd) from public.ai_analyses where company_id = cid and created_at >= date_trunc('month', now())), 0)
  end
$$;

-- enable RLS everywhere
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- companies / membership
create policy companies_select on public.companies for select using (public.is_member(id));
create policy companies_update on public.companies for update using (public.is_owner(id)) with check (public.is_owner(id));
create policy companies_delete on public.companies for delete using (public.is_owner(id));

create policy profiles_select on public.profiles for select
  using (user_id = auth.uid() or exists (select 1 from public.company_members a join public.company_members b on a.company_id = b.company_id where a.user_id = auth.uid() and b.user_id = profiles.user_id));
create policy profiles_insert on public.profiles for insert with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy members_select on public.company_members for select using (public.is_member(company_id));
create policy members_insert on public.company_members for insert with check (public.is_owner(company_id));
create policy members_update on public.company_members for update using (public.is_owner(company_id)) with check (public.is_owner(company_id));
create policy members_delete on public.company_members for delete using (public.is_owner(company_id) or user_id = auth.uid());

create policy invites_all on public.company_invites for all using (public.is_owner(company_id)) with check (public.is_owner(company_id));

-- shared reference/public data: readable by any signed-in user, written by service role only
create policy stages_select on public.pipeline_stages for select to authenticated using (true);
create policy sync_runs_select on public.sync_runs for select to authenticated using (true);

create policy opportunities_select on public.opportunities for select to authenticated
  using (company_id is null or public.is_member(company_id));

create policy amendments_select on public.opportunity_amendments for select to authenticated
  using (public.can_see_opportunity(opportunity_id));
create policy historical_awards_select on public.historical_awards for select to authenticated
  using (public.can_see_opportunity(opportunity_id));
create policy historical_lookups_select on public.historical_lookups for select to authenticated
  using (public.can_see_opportunity(opportunity_id));

create policy documents_select on public.opportunity_documents for select to authenticated
  using ((company_id is null and public.can_see_opportunity(opportunity_id)) or (company_id is not null and public.is_member(company_id)));
create policy documents_insert on public.opportunity_documents for insert to authenticated
  with check (company_id is not null and public.can_write(company_id) and public.can_see_opportunity(opportunity_id));
create policy documents_delete on public.opportunity_documents for delete to authenticated
  using (company_id is not null and public.can_write(company_id));

create policy pages_select on public.document_pages for select to authenticated
  using (exists (select 1 from public.opportunity_documents d where d.id = document_id
     and ((d.company_id is null and public.can_see_opportunity(d.opportunity_id)) or (d.company_id is not null and public.is_member(d.company_id)))));

-- company working data: viewers read, owners/members write
do $$
declare t text;
begin
  foreach t in array array['company_opportunities','ai_analyses','extracted_facts','checklist_items','checklist_templates','notes','tasks','saved_searches'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_member(company_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.can_write(company_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.can_write(company_id)) with check (public.can_write(company_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.can_write(company_id))', t);
  end loop;
  -- supplier & pricing data: no viewer access at all
  foreach t in array array['suppliers','supplier_quotes','opportunity_suppliers','pricing','pricing_lines'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.can_write(company_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.can_write(company_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.can_write(company_id)) with check (public.can_write(company_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.can_write(company_id))', t);
  end loop;
end $$;

-- saved searches are personal within a company
drop policy saved_searches_select on public.saved_searches;
drop policy saved_searches_insert on public.saved_searches;
drop policy saved_searches_update on public.saved_searches;
drop policy saved_searches_delete on public.saved_searches;
create policy saved_searches_all on public.saved_searches for all to authenticated
  using (user_id = auth.uid() and public.is_member(company_id)) with check (user_id = auth.uid() and public.is_member(company_id));

-- alerts & preferences are per-user
create policy alerts_select on public.alerts for select to authenticated using (user_id = auth.uid());
create policy alerts_update on public.alerts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy alerts_delete on public.alerts for delete to authenticated using (user_id = auth.uid());
create policy alert_prefs_all on public.alert_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log is append-only for users
create policy activity_select on public.activity_log for select to authenticated using (company_id is not null and public.is_member(company_id));
create policy activity_insert on public.activity_log for insert to authenticated
  with check (company_id is not null and public.can_write(company_id) and actor_id = auth.uid());

-- rate_limit_events: no client policies (function is security definer)

-- grants: tables are reachable through PostgREST only per policies above
revoke update, delete on public.activity_log from authenticated;
