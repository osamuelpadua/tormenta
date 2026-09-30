// Creates or removes the two confirmed accounts used by tests/supabase-live.test.ts.
//   TEST_USER_PASSWORD=... node scripts/supabase-test-users.mjs create | remove
import { client } from "./supabase-db.mjs";
const action = process.argv[2];
const password = process.env.TEST_USER_PASSWORD;
const emails = [
  "tormenta-teste-mestre@example.com",
  "tormenta-teste-jogador@example.com",
];
const names = ["Mestre de Teste", "Jogadora de Teste"];
const c = client();
await c.connect();
try {
  await c.query("begin");
  if (action === "create") {
    for (const [i, email] of emails.entries()) {
      const id = crypto.randomUUID();
      await c.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change_token_new, email_change)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
           extensions.crypt($3, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}', $4, now(), now(), '', '', '', '')`,
        [id, email, password, { display_name: names[i] }],
      );
      await c.query(
        `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
         values (gen_random_uuid(), $1::uuid, $1::text, $2, 'email', now(), now(), now())`,
        [id, { sub: id, email, email_verified: true }],
      );
    }
    console.log("contas de teste criadas");
  } else {
    const users = await c.query(
      "select id from auth.users where email = any($1)",
      [emails],
    );
    const ids = users.rows.map((r) => r.id);
    // Campaigns keep created_by as null after the user goes; remove them first.
    const camps = await c.query(
      "delete from public.campaigns where id in (select campaign_id from public.campaign_members where user_id = any($1)) returning id",
      [ids],
    );
    await c.query("delete from auth.users where id = any($1)", [ids]);
    const left = await c.query(
      "select (select count(*) from public.characters) ch, (select count(*) from public.campaigns) ca, (select count(*) from public.profiles) pr, (select count(*) from auth.users) us",
    );
    console.log(
      `removidas ${ids.length} contas e ${camps.rowCount} campanhas de teste; restante:`,
      left.rows[0],
    );
  }
  await c.query("commit");
} catch (e) {
  await c.query("rollback");
  console.log("ERRO:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
