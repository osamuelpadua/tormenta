-- Contas, campanhas e fichas sincronizadas do Tormenta Wiki.
-- As regras espelham src/sync/memory-backend.ts, usado nos testes do cliente.
-- Escrita em fichas, participação e convites passa por funções RPC; as
-- tabelas só aceitam leitura direta (e notas, para o mestre).

create extension if not exists pgcrypto with schema extensions;

-- Perfis ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                  split_part(new.email, '@', 1)), 60)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Campanhas ------------------------------------------------------------------

create function public.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b, 0) % 32) + 1, 1), '')
  from (select extensions.gen_random_bytes(1) as b from generate_series(1, 8)) s;
$$;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  invite_code text not null unique default public.new_invite_code(),
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null check (role in ('master', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index campaign_members_user on public.campaign_members (user_id);

-- security definer evita recursão das políticas de campaign_members.
create function public.is_member(p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and user_id = auth.uid()
  );
$$;

create function public.is_master(p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and user_id = auth.uid() and role = 'master'
  );
$$;

-- Fichas ---------------------------------------------------------------------

create table public.characters (
  id text primary key check (char_length(id) between 1 and 200),
  owner_id uuid not null references public.profiles on delete cascade,
  campaign_id uuid references public.campaigns on delete set null,
  name text not null,
  revision integer not null check (revision >= 0),
  data jsonb not null check (pg_column_size(data) < 2000000),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index characters_owner on public.characters (owner_id, updated_at);
create index characters_campaign on public.characters (campaign_id, updated_at);

create table public.character_events (
  id text primary key check (char_length(id) between 1 and 200),
  character_id text not null references public.characters on delete cascade,
  author_id uuid references public.profiles on delete set null,
  data jsonb not null check (pg_column_size(data) < 2000000),
  updated_at timestamptz not null default now()
);
create index character_events_character on public.character_events (character_id, updated_at);

create function public.can_read_character(p_owner uuid, p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = auth.uid()
      or (p_campaign is not null and public.is_member(p_campaign));
$$;

-- Notas da campanha -----------------------------------------------------------

create table public.campaign_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  author_id uuid references public.profiles on delete set null default auth.uid(),
  title text not null check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 50000),
  visibility text not null check (visibility in ('master', 'all')),
  updated_at timestamptz not null default now()
);
create index campaign_notes_campaign on public.campaign_notes (campaign_id);

-- RLS -----------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters enable row level security;
alter table public.character_events enable row level security;
alter table public.campaign_notes enable row level security;

create policy "perfil próprio ou de quem joga junto" on public.profiles
  for select to authenticated using (
    id = auth.uid() or exists (
      select 1 from public.campaign_members m
      where m.user_id = profiles.id and public.is_member(m.campaign_id)
    )
  );
create policy "edita o próprio perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "membros veem a campanha" on public.campaigns
  for select to authenticated using (public.is_member(id));
create policy "mestres editam a campanha" on public.campaigns
  for update to authenticated using (public.is_master(id)) with check (public.is_master(id));

create policy "membros veem os participantes" on public.campaign_members
  for select to authenticated using (public.is_member(campaign_id));

create policy "dono e grupo leem a ficha" on public.characters
  for select to authenticated using (public.can_read_character(owner_id, campaign_id));

create policy "dono e grupo leem o histórico" on public.character_events
  for select to authenticated using (
    exists (
      select 1 from public.characters c
      where c.id = character_events.character_id
        and public.can_read_character(c.owner_id, c.campaign_id)
    )
  );

create policy "mestre lê tudo, grupo lê o diário" on public.campaign_notes
  for select to authenticated using (
    public.is_master(campaign_id) or (visibility = 'all' and public.is_member(campaign_id))
  );
create policy "mestre cria notas" on public.campaign_notes
  for insert to authenticated with check (public.is_master(campaign_id));
create policy "mestre edita notas" on public.campaign_notes
  for update to authenticated using (public.is_master(campaign_id)) with check (public.is_master(campaign_id));
create policy "mestre exclui notas" on public.campaign_notes
  for delete to authenticated using (public.is_master(campaign_id));

-- RPCs ------------------------------------------------------------------------

create function public.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '28000';
  end if;
  return auth.uid();
end;
$$;

create function public.create_campaign(p_name text, p_description text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Dê um nome à campanha.';
  end if;
  insert into public.campaigns (name, description, created_by)
  values (trim(p_name), trim(coalesce(p_description, '')), v_user)
  returning id into v_id;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_id, v_user, 'master');
  return v_id;
end;
$$;

create function public.join_campaign(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_id uuid;
begin
  select id into v_id from public.campaigns
  where invite_code = upper(trim(p_code));
  if v_id is null then
    raise exception 'Convite não encontrado. Confira o código.';
  end if;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_id, v_user, 'player')
  on conflict do nothing;
  return v_id;
end;
$$;

-- Personagens de quem sai deixam a campanha junto.
create function public.detach_characters(p_campaign uuid, p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.characters set campaign_id = null, updated_at = now()
  where campaign_id = p_campaign and owner_id = p_user;
$$;
revoke execute on function public.detach_characters(uuid, uuid) from public, anon, authenticated;

create function public.leave_campaign(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_role text;
  v_members integer;
begin
  select role into v_role from public.campaign_members
  where campaign_id = p_campaign and user_id = v_user
  for update;
  if v_role is null then return; end if;
  select count(*) into v_members from public.campaign_members where campaign_id = p_campaign;
  if v_role = 'master' and v_members > 1 and not exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and role = 'master' and user_id <> v_user
  ) then
    raise exception 'Promova outro mestre antes de sair da campanha.';
  end if;
  perform public.detach_characters(p_campaign, v_user);
  delete from public.campaign_members where campaign_id = p_campaign and user_id = v_user;
  if v_members = 1 then
    delete from public.campaigns where id = p_campaign;
  end if;
end;
$$;

create function public.remove_member(p_campaign uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
begin
  if not public.is_master(p_campaign) then
    raise exception 'Apenas o mestre da campanha pode fazer isso.';
  end if;
  if p_user = v_user then
    raise exception 'Use Sair da campanha para remover a si mesmo.';
  end if;
  perform public.detach_characters(p_campaign, p_user);
  delete from public.campaign_members where campaign_id = p_campaign and user_id = p_user;
end;
$$;

create function public.set_member_role(p_campaign uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_user();
  if not public.is_master(p_campaign) then
    raise exception 'Apenas o mestre da campanha pode fazer isso.';
  end if;
  if p_role not in ('master', 'player') then
    raise exception 'Papel inválido.';
  end if;
  if p_role = 'player' and not exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and role = 'master' and user_id <> p_user
  ) then
    raise exception 'A campanha precisa de ao menos um mestre.';
  end if;
  update public.campaign_members set role = p_role
  where campaign_id = p_campaign and user_id = p_user;
  if not found then
    raise exception 'Participante não encontrado.';
  end if;
end;
$$;

create function public.regenerate_invite(p_campaign uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  perform public.require_user();
  if not public.is_master(p_campaign) then
    raise exception 'Apenas o mestre da campanha pode fazer isso.';
  end if;
  update public.campaigns
  set invite_code = public.new_invite_code(), updated_at = now()
  where id = p_campaign
  returning invite_code into v_code;
  return v_code;
end;
$$;

-- Grava estado e eventos na mesma transação, com revisão otimista.
-- Retorna {status: ok | conflict | deleted}; em conflito, a ficha atual.
create function public.save_character(p_expected integer, p_data jsonb, p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_id text := p_data ->> 'id';
  v_revision integer := (p_data ->> 'revision')::integer;
  v_current public.characters;
  v_event jsonb;
begin
  if v_id is null or v_revision is null then
    raise exception 'Ficha inválida.';
  end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 20000 then
    raise exception 'Histórico inválido.';
  end if;
  select * into v_current from public.characters where id = v_id for update;
  if not found then
    if p_expected is not null then
      return jsonb_build_object('status', 'deleted');
    end if;
    insert into public.characters (id, owner_id, name, revision, data)
    values (v_id, v_user, coalesce(p_data ->> 'name', ''), v_revision, p_data);
  else
    if v_current.owner_id <> v_user
       and not (v_current.campaign_id is not null and public.is_master(v_current.campaign_id)) then
      raise exception 'Você não pode alterar esta ficha.' using errcode = '42501';
    end if;
    if v_current.deleted_at is not null then
      return jsonb_build_object('status', 'deleted');
    end if;
    if p_expected is distinct from v_current.revision then
      return jsonb_build_object('status', 'conflict', 'character', jsonb_build_object(
        'id', v_current.id,
        'owner_id', v_current.owner_id,
        'owner_name', (select display_name from public.profiles where id = v_current.owner_id),
        'campaign_id', v_current.campaign_id,
        'revision', v_current.revision,
        'data', v_current.data,
        'updated_at', v_current.updated_at,
        'deleted_at', v_current.deleted_at
      ));
    end if;
    if v_revision <= v_current.revision then
      raise exception 'Revisão inválida.';
    end if;
    update public.characters
    set data = p_data, name = coalesce(p_data ->> 'name', ''), revision = v_revision, updated_at = now()
    where id = v_id;
  end if;
  for v_event in select * from jsonb_array_elements(p_events) loop
    if v_event ->> 'characterId' is distinct from v_id then
      raise exception 'Evento de outra ficha.';
    end if;
    insert into public.character_events (id, character_id, author_id, data)
    values (v_event ->> 'id', v_id, v_user, v_event)
    on conflict (id) do update
      set data = excluded.data, updated_at = now()
      where public.character_events.character_id = v_id;
  end loop;
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.delete_character(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
begin
  update public.characters set deleted_at = now(), updated_at = now()
  where id = p_id and owner_id = v_user;
  if not found and exists (select 1 from public.characters where id = p_id) then
    raise exception 'Somente o dono pode excluir a ficha.';
  end if;
end;
$$;

create function public.set_character_campaign(p_id text, p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
begin
  if p_campaign is not null and not public.is_member(p_campaign) then
    raise exception 'Entre na campanha antes de levar o personagem.';
  end if;
  update public.characters set campaign_id = p_campaign, updated_at = now()
  where id = p_id and owner_id = v_user;
  if not found then
    raise exception 'Somente o dono pode mudar a campanha da ficha.';
  end if;
end;
$$;

-- As fichas de outros membros que a sessão ainda pode ler (para podar o cache).
create function public.visible_party_ids()
returns setof text
language sql
stable
set search_path = ''
as $$
  select id from public.characters
  where owner_id <> auth.uid() and deleted_at is null and campaign_id is not null
    and public.is_member(campaign_id);
$$;

revoke execute on all functions in schema public from anon;

-- Tempo real -----------------------------------------------------------------
-- O Realtime aplica as políticas de SELECT acima a cada assinante.

alter publication supabase_realtime add table public.characters, public.campaign_members, public.campaigns;
