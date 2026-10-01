-- Value-when-known and keyword search across notice text AND extracted document text.
alter table public.opportunities add column value_amount numeric(16,2);
create index opportunities_value on public.opportunities (value_amount) where value_amount is not null;

-- SECURITY INVOKER: row level security still applies to the caller.
create or replace function public.search_opportunity_ids(q text, lim integer default 2000)
returns table (opportunity_id uuid)
language sql stable security invoker set search_path = public as $$
  with query as (select websearch_to_tsquery('english', q) as tsq)
  select o.id from public.opportunities o, query where o.search_vector @@ query.tsq
  union
  select d.opportunity_id from public.document_pages p
    join public.opportunity_documents d on d.id = p.document_id, query
   where p.search_vector @@ query.tsq
  limit lim
$$;
