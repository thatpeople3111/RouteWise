// Standalone embedded-Postgres validation. Never connects to hosted Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireValidation = createRequire(new URL('../../.next/preferences-validation/package.json', import.meta.url));
const { PGlite } = requireValidation('@electric-sql/pglite');
const db = new PGlite();
const owner = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const sql = await readFile(new URL('../migrations/20261014000000_create_user_preferences.sql', import.meta.url), 'utf8');
async function denied(query, code) {
  await assert.rejects(db.query(query), error => error.code === code);
}
try {
  // Model Supabase's Auth IDs/roles locally; no project credentials or real users.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    insert into auth.users values ('${owner}'), ('${other}');
  `);
  await db.exec(sql);
  const policies = await db.query("select policyname from pg_policies where schemaname = 'public' and tablename = 'user_preferences'");
  assert.equal(policies.rows.length, 3);
  const rls = await db.query("select relrowsecurity from pg_class where oid = 'public.user_preferences'::regclass");
  assert.equal(rls.rows[0].relrowsecurity, true);

  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${owner}';`);
  await db.query("insert into public.user_preferences (preferred_transport_mode) values ('PUBLIC_TRANSIT')");
  let own = (await db.query('select * from public.user_preferences')).rows[0];
  assert.equal(own.user_id, owner);
  assert.equal(own.route_priority, 'BEST');
  assert.equal(own.max_budget, null);
  assert.equal(own.max_walking_minutes, null);
  assert.equal(own.created_at.getTime(), own.updated_at.getTime());
  const created = own.created_at.getTime();
  await db.query("update public.user_preferences set max_budget = 15.25, max_walking_minutes = 0, route_priority = 'CHEAPEST'");
  own = (await db.query('select * from public.user_preferences')).rows[0];
  assert.equal(own.created_at.getTime(), created);
  assert.ok(own.updated_at.getTime() >= created);
  await denied("insert into public.user_preferences (preferred_transport_mode) values ('WALKING')", '23505');
  await denied(`insert into public.user_preferences (user_id, preferred_transport_mode) values ('${other}', 'DRIVING')`, '42501');
  await denied(`update public.user_preferences set user_id = '${other}'`, '42501');
  await denied("update public.user_preferences set created_at = now()", '42501');
  await denied("update public.user_preferences set updated_at = now()", '42501');
  await denied("update public.user_preferences set preferred_transport_mode = 'FLIGHT'", '23514');
  await denied("update public.user_preferences set route_priority = 'UNKNOWN'", '23514');
  await denied("update public.user_preferences set max_walking_minutes = -1", '23514');
  await denied("update public.user_preferences set max_budget = -1", '23514');
  await denied("update public.user_preferences set max_budget = 'NaN'", '23514');
  await denied('delete from public.user_preferences', '42501');

  await db.exec(`set request.jwt.claim.sub = '${other}';`);
  assert.equal((await db.query('select * from public.user_preferences')).rows.length, 0);
  assert.equal((await db.query(`update public.user_preferences set max_budget = 999 where user_id = '${owner}' returning user_id`)).rows.length, 0);
  await db.query("insert into public.user_preferences (preferred_transport_mode, route_priority) values ('RIDESHARE', 'FASTEST')");
  assert.equal((await db.query('select * from public.user_preferences')).rows.length, 1);

  await db.exec("set request.jwt.claim.sub = '';");
  assert.equal((await db.query('select * from public.user_preferences')).rows.length, 0);
  assert.equal((await db.query('update public.user_preferences set max_budget = 1 returning user_id')).rows.length, 0);
  await denied("insert into public.user_preferences (preferred_transport_mode) values ('WALKING')", '42501');
  await db.exec('set role anon;');
  await denied('select * from public.user_preferences', '42501');
  await denied("insert into public.user_preferences (preferred_transport_mode) values ('WALKING')", '42501');
  await denied('update public.user_preferences set max_budget = 1', '42501');

  await db.exec(`reset role; delete from auth.users where id = '${owner}';`);
  assert.equal((await db.query(`select * from public.user_preferences where user_id = '${owner}'`)).rows.length, 0);
  console.log('PASS: PostgreSQL migration, constraints, timestamps, one-row ownership, RLS, grants, and account-delete cascade.');
} finally { await db.close(); }
