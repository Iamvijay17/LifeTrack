import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, CheckCircle2, FlaskConical, LayoutList, Redo2, Save, Undo2, Workflow } from 'lucide-react'
import {
  NODE_H,
  NODE_W,
  actionDef,
  addEdge,
  addNode,
  autoLayout,
  blankWorkflow,
  connectProblem,
  defaultConfig,
  edgeKey,
  fromTemplate,
  newNode,
  nodeTitle,
  removeEdge,
  removeNode,
  triggerDef,
  updateConfig,
  validateWorkflow,
} from '@lifetrack/core/automation'
import { DataGate } from '@/components/shared/states'
import { useConfirm } from '@/components/shared/Confirm'
import { Button } from '@/components/ui/button'
import { Badge, Segmented } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useTables } from '@/hooks/store'
import { saveWorkflow } from '@/services/api'
import { cn } from '@/lib/utils'
import { Canvas } from './Canvas'
import { NodePanel, WorkflowPanel } from './ConfigPanel'
import { Palette } from './Palette'
import { StepsView } from './StepsView'
import { TestDialog } from './TestDialog'
import { useAutomationData } from './useAutomation'
import { useGraphHistory } from './useGraphHistory'
import { useWorkflowActions } from './useWorkflowActions'

const snapshot = (w) => JSON.stringify({ n: w.name, d: w.description, g: w.graph, m: w.max_runs_per_day })
const typing = (t) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"], [role="listbox"]')

function EditorBody({ seed, live }) {
  const nav = useNavigate()
  const confirm = useConfirm()
  const act = useWorkflowActions()
  const desktop = useIsDesktop()
  const { data } = useTables('habits', 'goals', 'reminders')
  const hist = useGraphHistory(seed.graph)
  const [meta, setMeta] = useState({ name: seed.name, description: seed.description ?? '', max_runs_per_day: seed.max_runs_per_day ?? 50 })
  const [baseline, setBaseline] = useState(() =>
    snapshot({ ...seed, ...{ name: seed.name, description: seed.description ?? '', max_runs_per_day: seed.max_runs_per_day ?? 50 } }),
  )
  const [selection, setSelection] = useState(null)
  const [mode, setMode] = useState(desktop ? 'canvas' : 'steps')
  const [testing, setTesting] = useState(false)
  const canvas = useRef(null)
  const cfgTimer = useRef(null)
  const cfgBase = useRef(null)

  const workflow = useMemo(
    () => ({
      ...(live ?? {}),
      id: live?.id,
      name: meta.name,
      description: meta.description,
      max_runs_per_day: meta.max_runs_per_day,
      graph: hist.graph,
      template_key: live?.template_key ?? seed.template_key ?? null,
    }),
    [live, meta, hist.graph, seed.template_key],
  )
  const validation = useMemo(() => validateWorkflow(workflow), [workflow])
  const changed = snapshot(workflow) !== baseline // edits not saved yet
  const dirty = changed || !live // a workflow that was never saved still needs saving
  const issues = useMemo(() => {
    const m = new Map()
    for (const w of validation.warnings) if (w.nodeId) m.set(w.nodeId, 'warning')
    for (const e of validation.errors) if (e.nodeId) m.set(e.nodeId, 'error')
    return m
  }, [validation])
  const selectedNode = selection?.kind === 'node' ? hist.graph.nodes.find((n) => n.id === selection.id) : null
  const enabled = !!live?.enabled

  // Typing in a field is one undo step, not one per key: the first change opens it, the others replace it, and it closes after a pause.
  const flush = useCallback(() => {
    clearTimeout(cfgTimer.current)
    if (cfgBase.current) {
      hist.checkpoint(cfgBase.current)
      cfgBase.current = null
    }
  }, [hist])
  const commit = useCallback(
    (g) => {
      flush()
      hist.commit(g)
    },
    [flush, hist],
  )
  const editConfig = (id, config) => {
    if (!cfgBase.current) cfgBase.current = hist.graph
    hist.transient(updateConfig(hist.graph, id, config))
    clearTimeout(cfgTimer.current)
    cfgTimer.current = setTimeout(flush, 700)
  }
  useEffect(() => () => clearTimeout(cfgTimer.current), [])

  const [save, saving] = useAction(
    async () => {
      flush()
      const { workflow: saved, switchedOff } = await saveWorkflow(live ?? null, {
        name: meta.name.trim(),
        description: meta.description,
        graph: hist.graph,
        max_runs_per_day: Number(meta.max_runs_per_day) || 50,
        template_key: workflow.template_key,
      })
      setBaseline(snapshot({ ...workflow, name: meta.name.trim() }))
      if (switchedOff) toast.warning('Saved, and switched off: it is no longer complete.')
      if (!live) nav(`/automation/${saved.id}`, { replace: true })
      return saved
    },
    { success: (s) => (s ? 'Saved' : undefined) },
  )

  const back = async () => {
    if (
      changed &&
      !(await confirm({
        title: 'Leave without saving?',
        description: 'Your changes to this workflow will be lost.',
        confirmLabel: 'Leave',
        destructive: true,
      }))
    )
      return
    nav('/automation')
  }

  const onSwitch = async (on) => {
    let w = live
    if (dirty || !w) {
      if (!on) return
      if (!validation.ok) return toast.error(`Not ready: ${validation.errors[0].message}`)
      w = await save()
      if (!w) return
    }
    await act.toggle(w, on)
  }

  // ---- adding and editing steps
  const select = useCallback((s) => setSelection(s), [])
  const addStep = ({ type, kind }, at) => {
    const g = hist.graph
    const picked = selectedNode
    const node = newNode(type, kind)
    let pos = at
    if (!pos) {
      if (picked && mode === 'canvas')
        pos = { x: picked.x + NODE_W + 96, y: picked.y + g.edges.filter((e) => e.from === picked.id).length * (NODE_H + 36) }
      else if (mode === 'canvas' && canvas.current) pos = canvas.current.center()
      else pos = { x: 0, y: 0 }
    }
    // a new step never lands on top of another one
    while (g.nodes.some((n) => Math.abs(n.x - pos.x) < NODE_W && Math.abs(n.y - pos.y) < NODE_H)) pos = { ...pos, y: pos.y + NODE_H + 36 }
    Object.assign(node, pos)
    let next = addNode(g, node)
    const id = type === 'trigger' ? (next.nodes.find((n) => n.type === 'trigger')?.id ?? node.id) : node.id
    if (type !== 'trigger') {
      const from = picked && !g.edges.some((e) => e.from === picked.id) ? picked : null
      if (from) next = addEdge(next, from.id, node.id)
    }
    if (mode === 'steps') next = autoLayout(next)
    commit(next)
    setSelection({ kind: 'node', id })
  }
  const setKind = (node, kind) => {
    const def = node.type === 'trigger' ? triggerDef(kind) : actionDef(kind)
    commit({ ...hist.graph, nodes: hist.graph.nodes.map((n) => (n.id === node.id ? { ...n, kind, config: defaultConfig(def) } : n)) })
  }
  const toggleNext = (from, to, on) => {
    const g = hist.graph
    if (!on) return commit(removeEdge(g, g.edges.find((e) => e.from === from && e.to === to)?.id ?? edgeKey(from, to)))
    const problem = connectProblem(g, from, to)
    if (problem) toast.error(problem)
    else commit(addEdge(g, from, to))
  }
  const remove = (node) => {
    commit(removeNode(hist.graph, node.id))
    setSelection(null)
  }

  // ---- keyboard: save, undo, redo (but never while typing in a field, where the browser's own undo applies)
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty && !saving) save()
      } else if (!typing(e.target) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        flush()
        e.shiftKey ? hist.redo() : hist.undo()
      } else if (!typing(e.target) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        flush()
        hist.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, saving, save, flush, hist])
  useEffect(() => {
    const warn = (e) => {
      if (changed) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changed])

  const panel = selectedNode ? (
    <NodePanel
      graph={hist.graph}
      node={selectedNode}
      problems={validation.errors.filter((e) => e.nodeId === selectedNode.id)}
      data={data}
      onConfig={(c) => editConfig(selectedNode.id, c)}
      onKind={(k) => setKind(selectedNode, k)}
      onRemove={() => remove(selectedNode)}
      onToggleNext={(to, on) => toggleNext(selectedNode.id, to, on)}
    />
  ) : (
    <WorkflowPanel values={meta} onChange={(p) => setMeta((m) => ({ ...m, ...p }))} />
  )

  return (
    <div className="mx-auto max-w-[96rem]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={back} aria-label="Back to Automation Studio">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span className="lt-icon-tile h-9 w-9 rounded-xl">
          <Workflow className="h-4 w-4" aria-hidden />
        </span>
        <input
          aria-label="Workflow name"
          value={meta.name}
          maxLength={120}
          onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold tracking-tight outline-none transition-colors hover:border-border focus:border-mod"
        />
        {dirty ? (
          <Badge tone="warning">Unsaved</Badge>
        ) : (
          <Badge tone="success">
            <CheckCircle2 className="h-3 w-3" aria-hidden /> Saved
          </Badge>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              flush()
              hist.undo()
            }}
            disabled={!hist.canUndo}
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              flush()
              hist.redo()
            }}
            disabled={!hist.canRedo}
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'canvas', label: 'Canvas' },
            { value: 'steps', label: 'Steps' },
          ]}
          className={desktop ? '' : 'hidden sm:inline-flex'}
        />
        <Button variant="outline" onClick={() => setTesting(true)}>
          <FlaskConical className="h-4 w-4" aria-hidden /> Test
        </Button>
        <Button onClick={() => save()} loading={saving} disabled={!dirty}>
          <Save className="h-4 w-4" aria-hidden /> Save
        </Button>
        <label className="flex items-center gap-2 text-sm">
          {enabled ? 'On' : 'Off'}
          <Switch checked={enabled} onChange={onSwitch} label={enabled ? 'Switch workflow off' : 'Switch workflow on'} />
        </label>
      </div>

      <details
        open={!validation.ok}
        className="mb-3 rounded-xl border border-border bg-card/60 px-3 py-2 text-[13px]"
        data-testid="validation"
      >
        <summary className="flex cursor-pointer items-center gap-2 font-medium">
          {validation.ok ? (
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
          )}
          {validation.ok
            ? validation.warnings.length
              ? `Ready, with ${validation.warnings.length} warning${validation.warnings.length === 1 ? '' : 's'}`
              : 'Ready to switch on'
            : `${validation.errors.length} thing${validation.errors.length === 1 ? '' : 's'} to fix before it can be switched on`}
        </summary>
        <ul className="mt-2 space-y-1">
          {[
            ...validation.errors.map((e) => ({ ...e, level: 'error' })),
            ...validation.warnings.map((e) => ({ ...e, level: 'warning' })),
          ].map((p, i) => (
            <li key={`${p.message}-${i}`}>
              <button
                type="button"
                disabled={!p.nodeId}
                onClick={() => p.nodeId && setSelection({ kind: 'node', id: p.nodeId })}
                className={cn('flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left', p.nodeId && 'hover:bg-muted/60')}
              >
                <AlertTriangle
                  className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', p.level === 'error' ? 'text-danger' : 'text-warning')}
                  aria-hidden
                />
                <span>
                  {p.nodeId ? (
                    <span className="font-medium">
                      {nodeTitle(hist.graph.nodes.find((n) => n.id === p.nodeId) ?? { type: 'action', kind: '' })}:{' '}
                    </span>
                  ) : null}
                  {p.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>

      <div
        className={cn(
          'grid gap-3',
          mode === 'canvas' ? 'lg:grid-cols-[13.5rem_minmax(0,1fr)_21rem]' : 'lg:grid-cols-[minmax(0,1fr)_21rem]',
        )}
      >
        {mode === 'canvas' && (
          <Palette onAdd={addStep} className="hidden max-h-[calc(100dvh-16rem)] rounded-xl border border-border bg-card/60 p-2 lg:block" />
        )}
        <div className={cn(mode === 'canvas' ? 'h-[calc(100dvh-16rem)] min-h-[26rem]' : '')}>
          {mode === 'canvas' ? (
            <Canvas
              ref={canvas}
              graph={hist.graph}
              selection={selection}
              issues={issues}
              onSelect={select}
              onTransient={hist.transient}
              onCommit={commit}
              onCheckpoint={hist.checkpoint}
              onAutoLayout={() => commit(autoLayout(hist.graph))}
              onNotice={(m) => toast.error(m)}
              onDropNode={(item, at) => addStep(item, at)}
            />
          ) : (
            <StepsView graph={hist.graph} selection={selection} issues={issues} onSelect={select} onAdd={(i) => addStep(i)} />
          )}
        </div>
        {desktop && (
          <aside
            aria-label="Step settings"
            className="max-h-[calc(100dvh-16rem)] overflow-y-auto rounded-xl border border-border bg-card/60 p-3.5"
          >
            {panel}
          </aside>
        )}
      </div>
      {mode === 'canvas' && !desktop && (
        <div className="mt-3">
          <details className="rounded-xl border border-border bg-card p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a step</summary>
            <Palette onAdd={addStep} className="mt-3 max-h-72" />
          </details>
        </div>
      )}

      {!desktop && (
        <Dialog
          open={!!selectedNode}
          onOpenChange={(o) => !o && setSelection(null)}
          title={selectedNode ? nodeTitle(selectedNode) : ''}
          description="Change this step. Changes apply as you type."
        >
          <div className="overflow-y-auto px-5 pb-5">
            {selectedNode && panel}
            <Button className="mt-4 w-full" onClick={() => setSelection(null)}>
              Done
            </Button>
          </div>
        </Dialog>
      )}
      {!desktop && !selectedNode && (
        <details className="mt-3 rounded-xl border border-border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">
            <LayoutList className="mr-1 inline h-4 w-4" aria-hidden />
            Workflow settings
          </summary>
          <div className="mt-3">{panel}</div>
        </details>
      )}

      <TestDialog open={testing} onOpenChange={setTesting} workflow={workflow} />
      <p className="mt-3 text-xs text-muted-foreground">
        Runs while LifeTrack is open on one of your devices.{' '}
        <Link to="/automation/history" className="underline underline-offset-2">
          See what has run
        </Link>
        .
      </p>
    </div>
  )
}

/** /automation/new (optionally ?template=key) and /automation/:id. */
export default function WorkflowEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { workflows, loading, error, refetch } = useAutomationData()
  const live = id === 'new' ? null : (workflows.find((w) => w.id === id) ?? null)
  const seed = useMemo(() => {
    if (id === 'new') return fromTemplate(params.get('template')) ?? blankWorkflow()
    return live
  }, [id, params, live?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <DataGate loading={loading} error={error} onRetry={refetch} cards={2}>
      {seed ? (
        <EditorBody key={id === 'new' ? `new-${params.get('template') ?? ''}` : id} seed={seed} live={live} />
      ) : (
        <div className="mx-auto max-w-md py-16 text-center" role="alert">
          <p className="text-sm font-semibold">That workflow does not exist</p>
          <p className="mt-1 text-[13px] text-muted-foreground">It may have been deleted on another device.</p>
          <Link to="/automation" className="mt-4 inline-block text-sm font-medium text-mod-text underline underline-offset-2">
            Back to Automation Studio
          </Link>
        </div>
      )}
    </DataGate>
  )
}
