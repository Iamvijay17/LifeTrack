import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Waypoints } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { FirstUseHint } from '@/components/shared/FirstUseHint'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button, buttonVariants } from '@/components/ui/button'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { bounds, buildMap, autoLayout, filterMap, mapStats, NODE_H, NODE_W } from '@/domain/lifeMap'
import { linkNodes, saveMapPosition, saveMapPositions } from '@/services/api'
import { useHabits } from '@/features/habits/useHabits'
import { Inspector } from './Inspector'
import { MapCanvas } from './MapCanvas'
import { MapToolbar } from './MapToolbar'
import { NodeDialog } from './NodeDialog'
import { useViewport } from './useViewport'

const FILTERS = { query: '', category: '', hideDone: false, kinds: null, tasks: 'linked', focus: null }

export default function LifeMapPage() {
  const today = useToday()
  const { settings } = useSettings()
  const { data, loading, error, refetch } = useTables(
    'goals',
    'milestones',
    'tasks',
    'study_sessions',
    'life_map_nodes',
    'life_map_links',
    'life_map_positions',
  )
  const { stats, loading: habitsLoading } = useHabits(today, settings.week_starts_on)
  const [f, setF] = useState(FILTERS)
  const [selected, setSelected] = useState(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [dialog, setDialog] = useState({ open: false, node: null, kind: 'project' })
  const vp = useViewport()
  const { view, fit, centerOn, setView: vpSetView, zoomAt: vpZoomAt } = vp
  // Until the person pans or zooms themselves, the map keeps fitting the canvas (it settles after the first layout and after a resize).
  const touched = useRef(!!view)
  const setView = useCallback(
    (v) => {
      touched.current = true
      vpSetView(v)
    },
    [vpSetView],
  )
  const zoomAt = useCallback(
    (...a) => {
      touched.current = true
      vpZoomAt(...a)
    },
    [vpZoomAt],
  )

  const map = useMemo(
    () =>
      buildMap(
        {
          goals: data.goals,
          milestones: data.milestones,
          tasks: data.tasks,
          habits: stats.map((s) => s.habit),
          habitStats: stats,
          customNodes: data.life_map_nodes,
          links: data.life_map_links,
          positions: data.life_map_positions,
          sessions: data.study_sessions,
        },
        { today, tasks: f.tasks },
      ),
    [data, stats, today, f.tasks],
  )
  const vis = useMemo(() => filterMap(map, f), [map, f])
  const summary = useMemo(() => mapStats(map), [map])
  const counts = useMemo(() => map.nodes.reduce((a, n) => ({ ...a, [n.kind]: (a[n.kind] ?? 0) + 1 }), {}), [map])

  // The first time the map is drawn with nothing remembered about the view, show all of it.
  const fitAll = useCallback(() => {
    const shown = map.nodes.filter((n) => vis.visible.has(n.key))
    fit(bounds(shown), size)
  }, [map, vis.visible, fit, size])
  useEffect(() => {
    if (touched.current || !size.w || loading || habitsLoading || !map.nodes.length) return
    fit(bounds(map.nodes.filter((n) => vis.visible.has(n.key))), size)
  }, [size, loading, habitsLoading, map.nodes, vis.visible, fit])

  // A selection that no longer exists (deleted elsewhere) quietly closes.
  useEffect(() => {
    if (selected?.type === 'node' && !map.byKey.has(selected.key)) setSelected(null)
    if (selected?.type === 'edge' && !map.edges.some((e) => e.key === selected.key)) setSelected(null)
    if (f.focus && !map.byKey.has(f.focus)) setF((s) => ({ ...s, focus: null }))
  }, [map, selected, f.focus])

  const onMove = useCallback(
    (key, x, y) => saveMapPosition(key, x, y).catch((e) => toast.error(e.message || "Couldn't save the position")),
    [],
  )
  const onLink = useCallback(
    async (from, to) => {
      try {
        await linkNodes(map, from, to)
        toast.success('Connected')
      } catch (e) {
        toast.error(e.message || "Couldn't connect those")
      }
    },
    [map],
  )
  const tidy = async () => {
    const pos = autoLayout(map.nodes, map.edges)
    try {
      await saveMapPositions([...pos].map(([key, p]) => ({ key, x: p.x, y: p.y })))
      requestAnimationFrame(fitAll)
      toast.success('Layout tidied and saved')
    } catch (e) {
      toast.error(e.message || "Couldn't save the layout")
    }
  }
  const center = (n) => centerOn(n.x + NODE_W / 2, n.y + NODE_H / 2, size)
  const pick = (n) => {
    setSelected({ type: 'node', key: n.key })
    center(n)
  }
  const add = (kind) => setDialog({ open: true, node: null, kind })

  const empty = !loading && !habitsLoading && map.nodes.length === 0 && f.tasks === 'linked'
  const focused = f.focus ? map.byKey.get(f.focus) : null

  return (
    <>
      <PageHeader
        title="Life Map"
        description="See how what you do every day leads to what you are working toward."
        actions={
          <Button onClick={() => add('project')}>
            <Waypoints className="h-4 w-4" aria-hidden />
            Add project
          </Button>
        }
      />
      <FirstUseHint id="lifemap" title="Connect your life areas">
        Drag nodes to arrange them and link related ones. Your layout is saved automatically.
      </FirstUseHint>
      <DataGate loading={loading || habitsLoading} error={error} onRetry={refetch}>
        {empty ? (
          <EmptyState
            icon={Waypoints}
            title="Start your map"
            description="Add a goal, a habit or a project and connect them: a habit feeds a goal, a task feeds a milestone. You will see what each day is building toward."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => add('area')}>Add an area of life</Button>
                <Link to="/goals" className={buttonVariants({ variant: 'outline' })}>
                  Create a goal
                </Link>
                <Link to="/habits" className={buttonVariants({ variant: 'outline' })}>
                  Create a habit
                </Link>
              </div>
            }
          />
        ) : (
          <div className="space-y-3">
            <MapToolbar
              map={map}
              vis={vis}
              f={f}
              setF={setF}
              onPick={pick}
              onAdd={add}
              onFit={fitAll}
              onZoom={(factor) => zoomAt(factor, size.w / 2, size.h / 2)}
              onTidy={tidy}
              counts={counts}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {summary.nodes} items · {summary.links} connections · {summary.done} done
              {summary.unlinked > 0 && ` · ${summary.unlinked} not connected yet`}
              {focused && (
                <>
                  {' · '}
                  Focused on <b className="text-foreground">{focused.title}</b>{' '}
                  <button
                    type="button"
                    className="text-mod-text underline underline-offset-2"
                    onClick={() => setF((s) => ({ ...s, focus: null }))}
                  >
                    Show everything
                  </button>
                </>
              )}
            </p>
            <div className="flex flex-col gap-3 lg:h-[calc(100dvh-17rem)] lg:min-h-[28rem] lg:flex-row">
              <div className="h-[58dvh] min-h-[22rem] min-w-0 flex-1 lg:h-auto">
                <MapCanvas
                  map={map}
                  vis={vis}
                  selected={selected}
                  onSelect={setSelected}
                  onMove={onMove}
                  onLink={onLink}
                  view={view}
                  setView={setView}
                  zoomAt={zoomAt}
                  onSize={setSize}
                  hint
                />
              </div>
              {selected && (
                <aside aria-label="Details" className="lt-card max-h-[60dvh] shrink-0 overflow-y-auto p-4 lg:max-h-none lg:w-80">
                  <Inspector
                    map={map}
                    selected={selected}
                    onSelect={setSelected}
                    onClose={() => setSelected(null)}
                    onFocus={(key) => setF((s) => ({ ...s, focus: key }))}
                    onCenter={center}
                    onEdit={(n) =>
                      setDialog({
                        open: true,
                        node: { id: n.id, kind: n.kind, title: n.title, category: n.category, notes: n.notes, color: n.color },
                        kind: n.kind,
                      })
                    }
                  />
                </aside>
              )}
            </div>
          </div>
        )}
      </DataGate>
      <NodeDialog
        open={dialog.open}
        node={dialog.node}
        defaultKind={dialog.kind}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        onSaved={(row) => row?.id && !dialog.node && setSelected({ type: 'node', key: `${row.kind}:${row.id}` })}
      />
    </>
  )
}
