import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module
import { findings } from '../../../scripts/check-migration-safety.mjs'

const DIR = new URL('../../migrations/', import.meta.url)

describe('migration safety check', () => {
  it('every migration shipped so far is additive', () => {
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql'))) expect(findings(readFileSync(new URL(f, DIR), 'utf8')), f).toEqual([])
  })
  it.each([
    ['drop table public.tasks;', 'DROP TABLE'],
    ['alter table t drop column x;', 'DROP COLUMN'],
    ['TRUNCATE public.habits;', 'TRUNCATE'],
    ['alter table t alter column n type bigint;', 'ALTER COLUMN TYPE (rewrites data)'],
    ['delete from public.tasks;', 'DELETE without WHERE'],
    ['update public.tasks set status = \'x\';', 'UPDATE without WHERE'],
    ['alter table t rename column a to b;', 'RENAME (breaks running app versions)'],
    ['do $$ begin execute \'drop table x\'; end $$; drop table y;', 'DROP TABLE'],
  ])('flags %s', (sql, name) => { expect(findings(sql)).toContain(name) })
  it.each([
    'delete from public.tasks where id = 1;',
    'update public.tasks set status = \'x\' where id = 1;',
    'create table a (id int); alter table a add column b int;',
    '-- drop table in a comment\nselect 1;',
    'drop trigger if exists t on public.a;',
  ])('accepts %s', (sql) => { expect(findings(sql)).toEqual([]) })
  it('a reviewed statement is accepted only with a reason', () => {
    expect(findings('-- lifetrack:allow-destructive removing the unused legacy table, backed up\ndrop table old;')).toEqual([])
    expect(findings('-- lifetrack:allow-destructive\ndrop table old;')).toEqual(['DROP TABLE'])
  })
})
