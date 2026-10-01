-- Private bucket; there are intentionally NO storage.objects policies for clients:
-- all access is by short-lived signed URLs minted server-side after an auth check.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
      on conflict (id) do update set public = false;
  end if;
end $$;
