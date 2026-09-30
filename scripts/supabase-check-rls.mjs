// Checks the RLS policies and RPCs as simulated users inside a transaction
// that is rolled back at the end: the database is left untouched.
//   node scripts/supabase-check-rls.mjs
import { client } from "./supabase-db.mjs";
const c = client();
await c.connect();
const ids = {
  M: crypto.randomUUID(),
  A: crypto.randomUUID(),
  B: crypto.randomUUID(),
  Z: crypto.randomUUID(),
};
const names = {
  M: "Mestre Teste",
  A: "Ana Teste",
  B: "Bruno Teste",
  Z: "Zed Teste",
};
let pass = 0,
  fail = 0;
const check = (label, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${label}${extra && !ok ? " — " + extra : ""}`,
  );
};
let sp = 0;
async function as(who, sql, params = []) {
  const name = `s${sp++}`;
  await c.query(`savepoint ${name}`);
  try {
    const claims =
      who === "anon"
        ? { role: "anon" }
        : { sub: ids[who], role: "authenticated" };
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    await c.query(
      `set local role ${who === "anon" ? "anon" : "authenticated"}`,
    );
    const r = await c.query(sql, params);
    await c.query("reset role");
    await c.query(`release savepoint ${name}`);
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (e) {
    await c.query(`rollback to savepoint ${name}`);
    await c.query("reset role");
    return { error: e.message, code: e.code };
  }
}
const character = (id, name, revision, hp) => ({ id, name, revision, hp });
try {
  await c.query("begin");
  for (const k of Object.keys(ids))
    await c.query(
      "insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)",
      [
        ids[k],
        `${k.toLowerCase()}-${ids[k].slice(0, 6)}@teste.dev`,
        { display_name: names[k] },
      ],
    );
  const profiles = await c.query(
    "select display_name from public.profiles where id = any($1) order by display_name",
    [Object.values(ids)],
  );
  check(
    "cadastro cria perfis com o nome informado",
    profiles.rows.length === 4 && profiles.rows[0].display_name === "Ana Teste",
  );

  const anon = await as("anon", "select public.create_campaign('x', '')");
  check("anônimo não executa RPCs", !!anon.error);

  const created = await as(
    "M",
    "select public.create_campaign('Mesa RLS', 'teste') as id",
  );
  const campaign = created.rows?.[0]?.id;
  check("mestre cria campanha", !!campaign, created.error);
  const code = (
    await as("M", "select invite_code from public.campaigns where id = $1", [
      campaign,
    ])
  ).rows[0].invite_code;
  check("convite com 8 caracteres", /^[A-Z2-9]{8}$/.test(code), code);

  const direct = await as(
    "M",
    "insert into public.campaign_members (campaign_id, user_id, role) values ($1, $2, 'master')",
    [campaign, ids.Z],
  );
  check("ninguém insere participantes direto na tabela", !!direct.error);

  const joined = await as("A", "select public.join_campaign($1) as id", [
    code.toLowerCase(),
  ]);
  check(
    "jogador entra com o código (minúsculas)",
    joined.rows?.[0]?.id === campaign,
    joined.error,
  );
  const bad = await as("Z", "select public.join_campaign('ZZZZZZZZ')");
  check(
    "código inválido é recusado",
    /Convite não encontrado/.test(bad.error ?? ""),
    bad.error,
  );

  const outsiderSees = await as(
    "Z",
    "select (select count(*) from public.campaigns) c, (select count(*) from public.campaign_members) m",
  );
  check(
    "quem está fora não vê campanha nem participantes",
    outsiderSees.rows[0].c === "0" && outsiderSees.rows[0].m === "0",
  );

  const charId = crypto.randomUUID();
  const saved = await as(
    "A",
    "select public.save_character(null, $1, $2) as r",
    [
      character(charId, "Budrik", 1, 69),
      JSON.stringify([{ id: "ev-1", characterId: charId, title: "Criado" }]),
    ],
  );
  check(
    "jogador envia a ficha",
    saved.rows?.[0]?.r?.status === "ok",
    saved.error ?? JSON.stringify(saved.rows?.[0]?.r),
  );
  const link = await as("A", "select public.set_character_campaign($1, $2)", [
    charId,
    campaign,
  ]);
  check("jogador leva a ficha para a campanha", !link.error, link.error);
  const zlink = await as(
    "Z",
    "select public.set_character_campaign($1, null)",
    [charId],
  );
  check("outro usuário não muda a campanha da ficha", !!zlink.error);

  const mSees = await as("M", "select id from public.characters");
  check("mestre vê a ficha do jogador", mSees.rows?.length === 1, mSees.error);
  const zSees = await as(
    "Z",
    "select (select count(*) from public.characters) c, (select count(*) from public.character_events) e",
  );
  check(
    "quem está fora não vê fichas nem histórico",
    zSees.rows[0].c === "0" && zSees.rows[0].e === "0",
  );

  await as("B", "select public.join_campaign($1)", [code]);
  const bSees = await as("B", "select id from public.characters");
  check("outro jogador da campanha vê a ficha", bSees.rows?.length === 1);
  const bWrite = await as("B", "select public.save_character(1, $1, '[]')", [
    character(charId, "Budrik", 2, 1),
  ]);
  check(
    "outro jogador não altera a ficha",
    bWrite.code === "42501",
    bWrite.error,
  );
  const bDirect = await as(
    "B",
    "update public.characters set revision = 99 where id = $1",
    [charId],
  );
  const rev = await c.query(
    "select revision from public.characters where id = $1",
    [charId],
  );
  check(
    "update direto na tabela não altera nada",
    rev.rows[0].revision === 1,
    bDirect.error,
  );

  const mWrite = await as("M", "select public.save_character(1, $1, $2) as r", [
    character(charId, "Budrik", 2, 74),
    JSON.stringify([
      {
        id: "ev-2",
        characterId: charId,
        title: "Cura",
        author: "Mestre Teste",
      },
    ]),
  ]);
  check(
    "mestre aplica efeito na revisão atual",
    mWrite.rows?.[0]?.r?.status === "ok",
    mWrite.error,
  );
  const author = await c.query(
    "select author_id from public.character_events where id = 'ev-2'",
  );
  check(
    "evento do mestre registra o autor",
    author.rows[0]?.author_id === ids.M,
  );
  const stale = await as(
    "M",
    "select public.save_character(1, $1, '[]') as r",
    [character(charId, "Budrik", 2, 0)],
  );
  const conflict = stale.rows?.[0]?.r;
  check(
    "revisão antiga devolve conflito com a ficha atual",
    conflict?.status === "conflict" &&
      conflict.character.data.hp === 74 &&
      conflict.character.owner_name === "Ana Teste",
    stale.error ?? JSON.stringify(conflict),
  );
  const hijack = await as("M", "select public.save_character(2, $1, $2)", [
    character(charId, "Budrik", 3, 74),
    JSON.stringify([{ id: "ev-x", characterId: "outra-ficha" }]),
  ]);
  check(
    "evento de outra ficha é recusado",
    /Evento de outra ficha/.test(hijack.error ?? ""),
    hijack.error,
  );

  const notes = await as(
    "M",
    "insert into public.campaign_notes (campaign_id, title, body, visibility) values ($1, 'Segredo', 'x', 'master'), ($1, 'Sessão 1', 'y', 'all')",
    [campaign],
  );
  check("mestre cria notas", !notes.error, notes.error);
  const aNotes = await as("A", "select title from public.campaign_notes");
  check(
    "jogador vê só o diário, não as notas secretas",
    aNotes.rows?.length === 1 && aNotes.rows[0].title === "Sessão 1",
  );
  const aNote = await as(
    "A",
    "insert into public.campaign_notes (campaign_id, title, visibility) values ($1, 'x', 'all')",
    [campaign],
  );
  check("jogador não cria notas", !!aNote.error);

  const zProfile = await as(
    "Z",
    "select count(*) n from public.profiles where id = $1",
    [ids.A],
  );
  const bProfile = await as(
    "B",
    "select count(*) n from public.profiles where id = $1",
    [ids.A],
  );
  check(
    "perfis visíveis só para quem joga junto",
    zProfile.rows[0].n === "0" && bProfile.rows[0].n === "1",
  );

  const mVisible = await as(
    "M",
    "select array_agg(v) ids from public.visible_party_ids() v",
  );
  const aVisible = await as(
    "A",
    "select count(*) n from public.visible_party_ids()",
  );
  check(
    "lista do grupo: mestre vê a ficha, dono não se inclui",
    mVisible.rows?.[0]?.ids?.[0] === charId && aVisible.rows[0].n === "0",
    mVisible.error,
  );

  await as("A", "update public.campaigns set name = 'hack' where id = $1", [
    campaign,
  ]);
  const name = await c.query(
    "select name from public.campaigns where id = $1",
    [campaign],
  );
  check("jogador não edita a campanha", name.rows[0].name === "Mesa RLS");
  const aRole = await as(
    "A",
    "select public.set_member_role($1, $2, 'master')",
    [campaign, ids.A],
  );
  check(
    "jogador não se promove a mestre",
    /Apenas o mestre/.test(aRole.error ?? ""),
    aRole.error,
  );
  const soleMaster = await as("M", "select public.leave_campaign($1)", [
    campaign,
  ]);
  check(
    "único mestre não sai com outros participantes",
    /Promova outro mestre/.test(soleMaster.error ?? ""),
    soleMaster.error,
  );
  const demote = await as(
    "M",
    "select public.set_member_role($1, $2, 'player')",
    [campaign, ids.M],
  );
  check(
    "campanha mantém ao menos um mestre",
    /ao menos um mestre/.test(demote.error ?? ""),
    demote.error,
  );

  const leave = await as("A", "select public.leave_campaign($1)", [campaign]);
  const after = await as("M", "select count(*) n from public.characters");
  const own = await as(
    "A",
    "select campaign_id from public.characters where id = $1",
    [charId],
  );
  check(
    "ao sair, a ficha deixa a campanha e o mestre para de vê-la",
    !leave.error && after.rows[0].n === "0" && own.rows[0].campaign_id === null,
    leave.error,
  );

  const zDelete = await as("Z", "select public.delete_character($1)", [charId]);
  check(
    "só o dono exclui a ficha",
    /Somente o dono/.test(zDelete.error ?? ""),
    zDelete.error,
  );
} catch (e) {
  console.log("ERRO inesperado:", e.message);
  fail++;
} finally {
  await c.query("rollback");
  const left = await c.query(
    "select count(*) n from auth.users where email like '%@teste.dev'",
  );
  console.log(
    `\n${pass} ok, ${fail} falhas · usuários de teste restantes: ${left.rows[0].n}`,
  );
  await c.end();
}
