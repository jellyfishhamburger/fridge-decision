import {PGlite} from '../../local-db-validation/node_modules/@electric-sql/pglite/dist/index.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync(new URL('../../pebble-content-preview/initialize-test-project.sql',import.meta.url),'utf8');
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);
 await db.exec(sql);
 const result=await db.query("select tablename from pg_tables where schemaname='public' order by tablename");
 assert.deepEqual(result.rows.map(r=>r.tablename),['devices','household_members','households','pebble_sessions']);
 await assert.rejects(db.exec(sql),/Refusing bootstrap/);
 await db.exec('rollback');
 assert.equal((await db.query('select count(*)::integer as n from public.devices')).rows[0].n,0);
 console.log('PASS: complete empty-project SQL executes, creates four tables, and refuses reinitialization');
}finally{await db.close();}
