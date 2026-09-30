-- Mapas da campanha: compartilhados por todos os participantes.
-- Todos criam, editam e excluem locais visíveis. Só mestres veem, criam e
-- revelam locais secretos. As regras espelham src/sync/memory-backend.ts.

create table public.campaign_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 50000),
  -- {id, kind: "bundled" | "storage", width, height, tileSize, maxZoom, baseUrl?}
  asset jsonb not null check (pg_column_size(asset) < 10000),
  source_key text,
  revision integer not null default 0,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  updated_by uuid references public.profiles on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create index campaign_maps_campaign on public.campaign_maps (campaign_id);

create table public.campaign_map_locations (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.campaign_maps on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  category_id text not null check (char_length(category_id) <= 100),
  icon_id text not null check (char_length(icon_id) <= 100),
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  notes text not null default '' check (char_length(notes) <= 50000),
  secret boolean not null default false,
  revision integer not null default 0,
  created_by uuid references public.profiles on delete set null,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_map_locations_map on public.campaign_map_locations (map_id);

alter table public.campaign_maps enable row level security;
alter table public.campaign_map_locations enable row level security;

create policy "membros veem os mapas" on public.campaign_maps
  for select to authenticated using (public.is_member(campaign_id));
create policy "mestre remove mapas" on public.campaign_maps
  for delete to authenticated using (public.is_master(campaign_id));

create policy "membros veem locais; segredos só o mestre" on public.campaign_map_locations
  for select to authenticated using (
    public.is_member(campaign_id) and (not secret or public.is_master(campaign_id))
  );

-- Escritas passam pelas funções abaixo, que validam segredo e revisão.

create function public.add_campaign_map(
  p_campaign uuid, p_name text, p_notes text, p_asset jsonb, p_source_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_user();
  if not public.is_master(p_campaign) then
    raise exception 'Apenas o mestre da campanha pode adicionar mapas.';
  end if;
  if p_asset ->> 'kind' not in ('bundled', 'storage') then
    raise exception 'Imagem do mapa inválida.';
  end if;
  insert into public.campaign_maps (campaign_id, name, notes, asset, source_key)
  values (p_campaign, trim(p_name), coalesce(p_notes, ''), p_asset, p_source_key)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_campaign_map(p_id uuid, p_expected integer, p_name text, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_map public.campaign_maps;
begin
  perform public.require_user();
  select * into v_map from public.campaign_maps where id = p_id for update;
  if v_map.id is null or not public.is_member(v_map.campaign_id) then
    raise exception 'Este mapa foi removido.';
  end if;
  if v_map.revision <> p_expected then
    raise exception 'Este mapa mudou enquanto você editava. Abra novamente para conferir a versão atual.';
  end if;
  update public.campaign_maps
  set name = trim(p_name), notes = coalesce(p_notes, ''), revision = revision + 1,
      updated_by = auth.uid(), updated_at = now()
  where id = p_id;
end;
$$;

-- Cria (p_expected nulo) ou atualiza um local. Retorna o local gravado.
create function public.save_map_location(p_location jsonb, p_expected integer)
returns public.campaign_map_locations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_map public.campaign_maps;
  v_current public.campaign_map_locations;
  v_result public.campaign_map_locations;
  v_id uuid := (p_location ->> 'id')::uuid;
  v_secret boolean := coalesce((p_location ->> 'secret')::boolean, false);
  v_master boolean;
begin
  perform public.require_user();
  select * into v_map from public.campaign_maps where id = (p_location ->> 'mapId')::uuid;
  if v_map.id is null or not public.is_member(v_map.campaign_id) then
    raise exception 'Este mapa foi removido.';
  end if;
  v_master := public.is_master(v_map.campaign_id);
  if v_secret and not v_master then
    raise exception 'Apenas o mestre cria locais secretos.';
  end if;
  select * into v_current from public.campaign_map_locations where id = v_id for update;
  if v_current.id is not null and (v_current.map_id <> v_map.id or (v_current.secret and not v_master)) then
    raise exception 'Este local foi removido.';
  end if;
  if p_expected is null and v_current.id is not null then
    raise exception 'Este local já existe.';
  end if;
  if p_expected is not null and (v_current.id is null) then
    raise exception 'Este local foi removido.';
  end if;
  if p_expected is not null and v_current.revision <> p_expected then
    raise exception 'Este local mudou enquanto você editava. Abra novamente para conferir a versão atual.';
  end if;
  if v_current.id is null then
    insert into public.campaign_map_locations
      (id, map_id, campaign_id, name, category_id, icon_id, x, y, notes, secret, created_by, updated_by)
    values
      (v_id, v_map.id, v_map.campaign_id, trim(p_location ->> 'name'), p_location ->> 'categoryId',
       p_location ->> 'iconId', (p_location ->> 'x')::double precision, (p_location ->> 'y')::double precision,
       coalesce(p_location ->> 'notes', ''), v_secret, auth.uid(), auth.uid())
    returning * into v_result;
  else
    update public.campaign_map_locations
    set name = trim(p_location ->> 'name'), category_id = p_location ->> 'categoryId',
        icon_id = p_location ->> 'iconId', x = (p_location ->> 'x')::double precision,
        y = (p_location ->> 'y')::double precision, notes = coalesce(p_location ->> 'notes', ''),
        secret = v_secret, revision = revision + 1, updated_by = auth.uid(), updated_at = now()
    where id = v_id
    returning * into v_result;
  end if;
  update public.campaign_maps set updated_at = now() where id = v_map.id;
  return v_result;
end;
$$;

create function public.delete_map_location(p_id uuid, p_expected integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.campaign_map_locations;
begin
  perform public.require_user();
  select * into v_current from public.campaign_map_locations where id = p_id for update;
  if v_current.id is null or not public.is_member(v_current.campaign_id)
     or (v_current.secret and not public.is_master(v_current.campaign_id)) then
    return;
  end if;
  if v_current.revision <> p_expected then
    raise exception 'Este local mudou enquanto você editava. Abra novamente para conferir a versão atual.';
  end if;
  delete from public.campaign_map_locations where id = p_id;
  update public.campaign_maps set updated_at = now() where id = v_current.map_id;
end;
$$;

revoke execute on function public.add_campaign_map(uuid, text, text, jsonb, text) from anon;
revoke execute on function public.update_campaign_map(uuid, integer, text, text) from anon;
revoke execute on function public.save_map_location(jsonb, integer) from anon;
revoke execute on function public.delete_map_location(uuid, integer) from anon;

-- Imagens próprias: {campaign_id}/{asset_id}/thumbnail.webp e /{z}/{x}/{y}.webp.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-maps', 'campaign-maps', false, 5242880, array['image/webp'])
on conflict (id) do nothing;

create function public.storage_campaign(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p_name, '/', 1)::uuid
  end;
$$;

create policy "membros baixam imagens dos mapas" on storage.objects
  for select to authenticated
  using (bucket_id = 'campaign-maps' and public.is_member(public.storage_campaign(name)));
create policy "mestre envia imagens dos mapas" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'campaign-maps' and public.is_master(public.storage_campaign(name)));
create policy "mestre substitui imagens dos mapas" on storage.objects
  for update to authenticated
  using (bucket_id = 'campaign-maps' and public.is_master(public.storage_campaign(name)));
create policy "mestre remove imagens dos mapas" on storage.objects
  for delete to authenticated
  using (bucket_id = 'campaign-maps' and public.is_master(public.storage_campaign(name)));

alter publication supabase_realtime add table public.campaign_maps, public.campaign_map_locations;
