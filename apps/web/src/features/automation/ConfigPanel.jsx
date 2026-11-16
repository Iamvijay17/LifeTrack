import { AlertTriangle, Trash2 } from 'lucide-react'
import { ACTIONS, LIMITS, TRIGGERS, TRIGGER_GROUPS, actionDef, nodeTitle, subjectOf, triggerDef } from '@lifetrack/core/automation'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { ConditionEditor, ConfigFields } from './ConfigFields'
import { NODE_STYLE } from './format'
import { cn } from '@/lib/utils'

/** The panel for the selected step: its options, what runs next, and anything wrong with it. */
export function NodePanel({ graph, node, problems, data, onConfig, onKind, onRemove, onToggleNext }) {
  const st = NODE_STYLE[node.type]
  const subject = subjectOf(graph)
  const others = graph.nodes.filter((n) => n.id !== node.id && n.type !== 'trigger')
  const next = new Set(graph.edges.filter((e) => e.from === node.id).map((e) => e.to))
  const def = node.type === 'trigger' ? triggerDef(node.kind) : node.type === 'action' ? actionDef(node.kind) : null
  return (
    <div className="space-y-4" data-testid="node-panel">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className={cn('inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider', st.chip)}>
            {st.label}
          </span>
          <h2 className="mt-1 text-sm font-semibold">{nodeTitle(node)}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${nodeTitle(node)}`}>
          <Trash2 className="h-4 w-4" aria-hidden /> Remove
        </Button>
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-lg border border-danger/40 bg-danger/5 p-2.5 text-xs text-danger">
          {problems.map((p) => (
            <li key={p.message} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {p.message}
            </li>
          ))}
        </ul>
      )}

      {node.type === 'trigger' && (
        <Field label="When">
          <Select value={node.kind} onChange={(e) => onKind(e.target.value)}>
            {TRIGGER_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {TRIGGERS.filter((t) => t.group === g).map((t) => (
                  <option key={t.kind} value={t.kind}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      )}
      {node.type === 'action' && (
        <Field label="Do">
          <Select value={node.kind} onChange={(e) => onKind(e.target.value)}>
            {ACTIONS.map((a) => (
              <option key={a.kind} value={a.kind}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {def?.hint && <p className="text-xs text-muted-foreground">{def.hint}</p>}
      {node.type === 'condition' ? (
        <ConditionEditor config={node.config} onChange={onConfig} subject={subject} />
      ) : (
        <ConfigFields
          fields={def?.fields ?? []}
          config={node.config}
          onChange={onConfig}
          data={data}
          nodeType={node.type}
          subject={subject}
        />
      )}

      {others.length > 0 && (
        <fieldset className="space-y-1.5 border-t border-border/70 pt-3">
          <legend className="text-[13px] font-medium">Runs next</legend>
          <p className="text-xs text-muted-foreground">
            Connect this step to the steps that follow it. (You can also drag from its round handle.)
          </p>
          {others.map((o) => (
            <label key={o.id} className="flex min-h-8 cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--mod))]"
                checked={next.has(o.id)}
                onChange={(e) => onToggleNext(o.id, e.target.checked)}
              />
              <span className="truncate">{nodeTitle(o)}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}

/** Shown when no step is selected: name, description and the run limit. */
export function WorkflowPanel({ values, onChange }) {
  return (
    <div className="space-y-4" data-testid="workflow-panel">
      <h2 className="text-sm font-semibold">Workflow</h2>
      <Field label="Name">
        <Input value={values.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="Description">
        <Textarea rows={3} maxLength={500} value={values.description} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <Field
        label="Most runs per day"
        hint={`A safety limit. When it is reached the workflow stops for the day. At most ${LIMITS.maxRunsPerDay}.`}
      >
        <Input
          type="number"
          min={1}
          max={LIMITS.maxRunsPerDay}
          value={values.max_runs_per_day}
          onChange={(e) => onChange({ max_runs_per_day: e.target.value === '' ? '' : Number(e.target.value) })}
        />
      </Field>
      <p className="text-xs text-muted-foreground">Select a step on the canvas to edit it.</p>
    </div>
  )
}
