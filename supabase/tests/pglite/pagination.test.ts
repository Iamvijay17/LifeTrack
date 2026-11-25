import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Q } from './helpers'
// @ts-expect-error plain JS module shared with the apps
import { buildPage, keysetFilter, normalizePageRequest } from '../../../packages/core/src/pagination.js'

// The keyset condition the data adapter sends to PostgREST (an `or=(...)` string) is turned back into SQL here and run on real Postgres against rows with ties and
// NULLs, so "every row once, in order" is proved against the database's own ordering, in both directions.
let ctx: Awaited<ReturnType<typeof createDb>>
let U: string
beforeAll(async () => {
  ctx = await createDb()
  U = await ctx.newUser('p@example.com')
  await ctx.db.exec(`set session_replication_role = replica`)
  await ctx.q(`insert into tasks (user_id, title, due_date, created_at) select $1, 'T' || g, case when g % 7 = 0 then null else date '2026-01-01' + (g % 40) end, timestamptz '2026-01-01' + ((g % 90) || ' hours')::interval from generate_series(1, 1200) g`, [U])
  await ctx.db.exec(`set session_replication_role = origin`)
})
afterAll(async () => { await ctx.db.close() })

// "a.lt."x",and(a.eq."x",id.lt."y"),a.is.null"  →  SQL
const split = (s: string) => { const out: string[] = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = '' } else cur += ch } out.push(cur); return out }
const toSql = (expr: string): string => {
  expr = expr.trim()
  if (expr.startsWith('and(')) return '(' + split(expr.slice(4, -1)).map(toSql).join(' and ') + ')'
  let m = expr.match(/^(\w+)\.is\.null$/); if (m) return `${m[1]} is null`
  m = expr.match(/^(\w+)\.not\.is\.null$/); if (m) return `${m[1]} is not null`
  m = expr.match(/^(\w+)\.(lt|gt|eq)\."(.*)"$/); if (m) return `${m[1]} ${{ lt: '<', gt: '>', eq: '=' }[m[2] as 'lt']} '${m[3].replace(/'/g, "''")}'`
  throw new Error('unparsed ' + expr)
}
const run = async (q: Q, spec: any) => {
  const reverse = spec.cursor?.direction === 'prev'
  const dir = (spec.dir === 'asc') !== reverse ? 'asc' : 'desc'
  const where = spec.cursor ? 'where ' + split(keysetFilter(spec)).map(toSql).join(' or ') : ''
  const rows = (await q(`select id, ${spec.sort}::text as ${spec.sort} from tasks ${where} order by ${spec.sort} ${dir}, id ${dir} limit ${spec.pageSize + 1}`)).rows
  return buildPage(spec, rows, null)
}

describe('keyset conditions on real Postgres', () => {
  for (const [sort, dir] of [['created_at', 'desc'], ['created_at', 'asc'], ['due_date', 'desc'], ['due_date', 'asc']] as const) {
    it(`${sort} ${dir}: forward walk returns every row exactly once, in the database's order`, async () => {
      await ctx.asUser(U, async (q) => {
        const expected = (await q(`select id from tasks order by ${sort} ${dir}, id ${dir}`)).rows.map((r) => r.id)
        const seen: string[] = []
        let cursor: string | null = null
        for (let guard = 0; guard < 100; guard++) {
          const spec = normalizePageRequest('tasks', { sort, dir, pageSize: 100, cursor, count: false })
          const page = await run(q, spec)
          seen.push(...page.items.map((r: any) => r.id))
          if (!page.nextCursor) break
          cursor = page.nextCursor
        }
        expect(seen).toEqual(expected)
      })
    })
    it(`${sort} ${dir}: walking back from the last page reproduces the earlier pages`, async () => {
      await ctx.asUser(U, async (q) => {
        const pages: string[][] = []
        let cursor: string | null = null
        let last: any
        for (let guard = 0; guard < 100; guard++) {
          const page = await run(q, normalizePageRequest('tasks', { sort, dir, pageSize: 100, cursor, count: false }))
          pages.push(page.items.map((r: any) => r.id)); last = page
          if (!page.nextCursor) break
          cursor = page.nextCursor
        }
        let back = last
        for (let i = pages.length - 2; i >= 0; i--) {
          back = await run(q, normalizePageRequest('tasks', { sort, dir, pageSize: 100, cursor: back.prevCursor, direction: 'prev', count: false }))
          expect(back.items.map((r: any) => r.id)).toEqual(pages[i])
        }
        expect(back.hasPrev).toBe(false)
      })
    })
  }
})
