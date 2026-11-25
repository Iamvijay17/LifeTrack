import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { API_SCOPES, ERROR_CODES, PAGE, RESOURCES, WEBHOOK_EVENTS, buildOpenApi } from '@lifetrack/core/platformApi'
import { download } from '@/services/csv'
import { CopyButton } from './shared'

const BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '')}/functions/v1/api`
  : 'https://<project-ref>.supabase.co/functions/v1/api'

function Code({ children, label }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 pr-20 text-xs" aria-label={label}>
        <code>{children}</code>
      </pre>
      <CopyButton text={children} className="absolute right-2 top-2" />
    </div>
  )
}
const H = ({ id, children }) => (
  <h3 id={id} className="mb-2 mt-1 scroll-mt-20 text-base font-semibold">
    {children}
  </h3>
)

const verifySample = `import { createHmac, timingSafeEqual } from 'node:crypto'

// rawBody: the request body EXACTLY as received (before JSON.parse)
export function verify(rawBody, headers, secret) {
  const timestamp = headers['x-lifetrack-timestamp']
  const signature = headers['x-lifetrack-signature'] // "v1=<hex>"
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false // older than 5 minutes: reject (replay)
  const expected = 'v1=' + createHmac('sha256', secret).update(\`\${timestamp}.\${rawBody}\`).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(signature ?? '')
  return a.length === b.length && timingSafeEqual(a, b)
}`

export function DocsTab() {
  const endpoints = Object.entries(RESOURCES).flatMap(([name, r]) => [
    ...(r.methods.includes('list') ? [{ method: 'GET', path: `/v1/${name}`, scope: r.read, what: `List ${r.summary.toLowerCase()}` }] : []),
    ...(r.methods.includes('get') ? [{ method: 'GET', path: `/v1/${name}/{id}`, scope: r.read, what: 'Get one' }] : []),
    ...(r.methods.includes('create') ? [{ method: 'POST', path: `/v1/${name}`, scope: r.writeScope, what: 'Create' }] : []),
    ...(r.methods.includes('update') ? [{ method: 'PATCH', path: `/v1/${name}/{id}`, scope: r.writeScope, what: 'Update' }] : []),
  ])
  return (
    <div className="space-y-4" data-testid="api-docs">
      <Card>
        <CardHeader className="flex-wrap gap-2">
          <CardTitle as="h2">LifeTrack API</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => download('lifetrack-openapi.json', JSON.stringify(buildOpenApi(BASE), null, 2), 'application/json')}
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> OpenAPI (JSON)
          </Button>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <section>
            <H id="overview">Overview</H>
            <p>
              A small JSON REST API over your own data. It reads and writes only what the key's permissions allow, and only your records.
              There is no delete operation: the API cannot destroy data. Every request is recorded (method, path, status, time, never the
              body) in <b>Activity</b>.
            </p>
            <p className="mt-2 text-muted-foreground">
              Use it from a server you control. Never put a key in a web page or mobile app: anyone who can read the page could use it.
            </p>
          </section>
          <section>
            <H id="base-url">Base URL</H>
            <Code label="Base URL">{BASE}</Code>
            <p className="mt-2 text-muted-foreground">
              Health checks need no key: <code>GET /health</code>, <code>/health/live</code>, <code>/health/ready</code>. The
              machine-readable description is at <code>/v1/openapi.json</code>.
            </p>
          </section>
          <section>
            <H id="auth">Authentication</H>
            <p>
              Create a key on the <b>API keys</b> tab, then send it on every request:
            </p>
            <Code label="Authentication example">{`curl ${BASE}/v1/tasks \\\n  -H "Authorization: Bearer lt_live_YOUR_KEY"`}</Code>
            <p className="mt-2 text-muted-foreground">
              The key is shown once when you create it and only a one-way fingerprint is stored. If it leaks, revoke it and create another.{' '}
              <code>X-API-Key: …</code> is accepted as an alternative to the Authorization header.
            </p>
          </section>
          <section>
            <H id="scopes">Permissions</H>
            <ul className="grid gap-1 sm:grid-cols-2">
              {API_SCOPES.map((s) => (
                <li key={s.key}>
                  <Badge className="font-mono">{s.key}</Badge> <span className="text-muted-foreground">{s.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              A request that needs a permission the key lacks gets <code>403 insufficient_scope</code>.
            </p>
          </section>
          <section>
            <H id="endpoints">Endpoints</H>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Method
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Path
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Permission
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/60">
                    <td className="px-3 py-2 font-mono">GET</td>
                    <td className="px-3 py-2 font-mono">/v1/me</td>
                    <td className="px-3 py-2">any key</td>
                    <td className="px-3 py-2">The key's name, permissions, expiry and limit</td>
                  </tr>
                  {endpoints.map((e) => (
                    <tr key={e.method + e.path} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono">{e.method}</td>
                      <td className="px-3 py-2 font-mono">{e.path}</td>
                      <td className="px-3 py-2 font-mono">{e.scope}</td>
                      <td className="px-3 py-2">{e.what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <H id="params">Request parameters</H>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code>limit</code> – page size, 1 to {PAGE.maxLimit} (default {PAGE.defaultLimit}).
              </li>
              <li>
                <code>cursor</code> – the <code>next_cursor</code> of the previous page.
              </li>
              <li>
                <code>updated_since</code> – an ISO 8601 time; only records changed at or after it.
              </li>
              <li>
                Exact-match filters per resource:{' '}
                {Object.entries(RESOURCES)
                  .map(([n, r]) => `${n}: ${r.filters.join(', ')}`)
                  .join(' · ')}
                .
              </li>
            </ul>
          </section>
          <section>
            <H id="examples">Examples</H>
            <p className="mb-1">Create a task:</p>
            <Code label="Create a task">{`curl -X POST ${BASE}/v1/tasks \\\n  -H "Authorization: Bearer lt_live_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"title":"Renew passport","priority":"high","due_date":"2026-12-15"}'`}</Code>
            <Code label="Create a task response">{`{\n  "data": {\n    "id": "5b0c…",\n    "title": "Renew passport",\n    "priority": "high",\n    "status": "pending",\n    "due_date": "2026-12-15",\n    "created_at": "2026-11-24T10:15:00.000Z",\n    …\n  }\n}`}</Code>
            <p className="mb-1 mt-3">Add an expense (amounts are in minor units: 12500 = 125.00):</p>
            <Code label="Add an expense">{`curl -X POST ${BASE}/v1/transactions \\\n  -H "Authorization: Bearer lt_live_YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"type":"expense","amount_paise":12500,"category":"Food","txn_date":"2026-11-24"}'`}</Code>
          </section>
          <section>
            <H id="pagination">Pagination</H>
            <p>
              Lists are newest first. A page looks like this; keep passing <code>next_cursor</code> until <code>has_more</code> is false.
            </p>
            <Code label="Pagination response">{`{\n  "data": [ … ],\n  "pagination": { "limit": 25, "has_more": true, "next_cursor": "eyJjIjoi…" }\n}`}</Code>
          </section>
          <section>
            <H id="rate-limits">Rate limits</H>
            <p>
              Each key has its own limit, set when you create it (1–600 requests a minute, default 60). Every response carries{' '}
              <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code> (a Unix time). Over the
              limit you get <code>429</code> with <code>Retry-After</code> (seconds).
            </p>
          </section>
          <section>
            <H id="errors">Errors</H>
            <p>
              Errors have one shape. Quote <code>request_id</code> when you ask for help; it is also in the <code>X-Request-Id</code> header
              and in your Activity log.
            </p>
            <Code label="Error response">{`{ "error": { "code": "validation_failed", "message": "Some fields are missing or invalid.", "request_id": "9f1c…", "fields": { "title": "required" } } }`}</Code>
            <div className="mt-2 overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Code
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Meaning
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ERROR_CODES.map((e) => (
                    <tr key={e.code} className="border-t border-border/60">
                      <td className="px-3 py-2">{e.status}</td>
                      <td className="px-3 py-2 font-mono">{e.code}</td>
                      <td className="px-3 py-2">{e.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Webhooks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <section>
            <H id="webhook-events">Events</H>
            <ul className="grid gap-1 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((e) => (
                <li key={e.key}>
                  <Badge className="font-mono">{e.key}</Badge> <span className="text-muted-foreground">{e.label}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <H id="webhook-delivery">What you receive</H>
            <p>
              A <code>POST</code> with a JSON body and these headers: <code>X-LifeTrack-Delivery</code> (the delivery id, the same on every
              retry: use it to ignore duplicates), <code>X-LifeTrack-Event</code>, <code>X-LifeTrack-Timestamp</code> (Unix seconds) and{' '}
              <code>X-LifeTrack-Signature</code>.
            </p>
            <Code label="Webhook body">{`{\n  "id": "d3b9…",\n  "type": "task.completed",\n  "created_at": "2026-11-24T10:20:00.000Z",\n  "data": { "task": { "id": "5b0c…", "title": "Renew passport", "status": "done", … } }\n}`}</Code>
            <p className="mt-2 text-muted-foreground">
              Answer with any 2xx within the timeout. Anything else (or no answer) is retried after 30 s, 1 min, 2 min and so on, up to 6 h
              apart, until your attempt limit; then the delivery moves to the dead-letter list where you can retry it by hand. Redirects are
              not followed. A 410 stops retries.
            </p>
          </section>
          <section>
            <H id="webhook-signature">Verify the signature</H>
            <p>
              The signature is <code>v1=</code> + the HMAC-SHA256 (hex) of <code>{'{timestamp}.{raw body}'}</code> with your endpoint's
              signing secret. Reject a timestamp more than 5 minutes old, and compare in constant time:
            </p>
            <Code label="Signature verification">{verifySample}</Code>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
