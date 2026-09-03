"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force"
import { cn } from "@/lib/cn"
import {
  FILTERABLE,
  KIND_STYLE,
  LEGEND,
  connectionsOf,
  type HiveGraph,
  type HiveLink,
  type HiveNode,
  type NodeKind,
} from "@/lib/hivemind"

/* d3-force mutates the objects it is handed, so the simulation gets its own
   copies rather than the imported JSON. */
type SimNode = HiveNode & { x: number; y: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null }
type SimLink = Omit<HiveLink, "source" | "target"> & { source: SimNode; target: SimNode }

const WIDTH = 1100
const HEIGHT = 760
/* Lanes sit on a ring around the PM; routines on an inner one. Anchoring
   them is what turns the hairball into seven readable islands. */
const LANE_RING_X = 350
const LANE_RING_Y = 250
const ROUTINE_RING_X = 150
const ROUTINE_RING_Y = 108

/** How hard each edge pulls. `contains` is the skeleton, so it pulls tightest. */
const LINK_DISTANCE: Record<HiveLink["rel"], number> = {
  contains: 55,
  loads: 130,
  fires: 100,
  feeds: 110,
}

function shapePath(kind: NodeKind, r: number): string {
  const { shape } = KIND_STYLE[kind]
  if (shape === "diamond") return `M0,${-r * 1.25} L${r * 1.15},0 L0,${r * 1.25} L${-r * 1.15},0 Z`
  if (shape === "square") {
    const s = r * 0.95
    return `M${-s},${-s} h${s * 2} a2,2 0 0 1 2,2 v${s * 2 - 4} a2,2 0 0 1 -2,2 h${-s * 2} a2,2 0 0 1 -2,-2 v${-s * 2 + 4} a2,2 0 0 1 2,-2 Z`
  }
  return "" // circles render as <circle>, which is crisper than a path
}

export function HivemindGraph({ graph }: { graph: HiveGraph }) {
  const [hidden, setHidden] = useState<Set<NodeKind>>(() => new Set<NodeKind>(["script", "reference"]))
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [showTable, setShowTable] = useState(false)
  const [settled, setSettled] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)
  const nodesRef = useRef<SimNode[]>([])
  const linksRef = useRef<SimLink[]>([])
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null)
  // Positions live in the simulation's own objects; this counter is what tells
  // React a tick happened, so no array is rebuilt 60 times a second.
  const [, bumpFrame] = useState(0)

  /* ---------------------------------------------------------------- data */

  const visibleKinds = useMemo(
    () => new Set(Object.keys(KIND_STYLE).filter((k) => !hidden.has(k as NodeKind)) as NodeKind[]),
    [hidden]
  )

  /* Stable ring order — recomputed only when the graph itself changes, so a
     filter toggle never re-shuffles which lane sits where. */
  const laneIds = useMemo(
    () => graph.nodes.filter((n) => n.kind === "lane").map((n) => n.id),
    [graph]
  )
  const routineIds = useMemo(
    () => graph.nodes.filter((n) => n.kind === "routine" || n.kind === "pipeline").map((n) => n.id),
    [graph]
  )

  const { nodes, links } = useMemo(() => {
    const keep = graph.nodes.filter((n) => visibleKinds.has(n.kind))
    const ids = new Set(keep.map((n) => n.id))
    return {
      nodes: keep,
      links: graph.links.filter((l) => ids.has(l.source) && ids.has(l.target)),
    }
  }, [graph, visibleKinds])

  /* Adjacency for the hover/select highlight — built once per filter change. */
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const link of links) {
      if (!map.has(link.source)) map.set(link.source, new Set())
      if (!map.has(link.target)) map.set(link.target, new Set())
      map.get(link.source)!.add(link.target)
      map.get(link.target)!.add(link.source)
    }
    return map
  }, [links])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return new Set(
      nodes
        .filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            n.blurb?.toLowerCase().includes(q) ||
            n.source?.toLowerCase().includes(q)
        )
        .map((n) => n.id)
    )
  }, [nodes, query])

  /* ---------------------------------------------------- the simulation */

  useEffect(() => {
    // Carry positions across a filter change so the map doesn't jump.
    const previous = new Map(nodesRef.current.map((n) => [n.id, n]))
    const simNodes: SimNode[] = nodes.map((n) => {
      const old = previous.get(n.id)
      return { ...n, x: old?.x ?? WIDTH / 2 + (Math.random() - 0.5) * 200, y: old?.y ?? HEIGHT / 2 + (Math.random() - 0.5) * 200 }
    })
    const byId = new Map(simNodes.map((n) => [n.id, n]))
    const simLinks: SimLink[] = links.flatMap((l) => {
      const source = byId.get(l.source)
      const target = byId.get(l.target)
      return source && target ? [{ rel: l.rel, source, target }] : []
    })

    nodesRef.current = simNodes
    linksRef.current = simLinks

    /* Every node gets an anchor before the simulation runs. A plain
       force-directed layout of these 81 nodes is a hairball — the lanes are
       the story, so each one owns a slice of the ring and pulls its members
       into it. The forces then only have to resolve local crowding. */
    const laneIndex = new Map(laneIds.map((id, i) => [id, i]))
    const anchorOf = (n: SimNode): { x: number; y: number; strength: number } => {
      if (n.kind === "root") return { x: WIDTH / 2, y: HEIGHT / 2, strength: 1 }
      if (n.kind === "routine" || n.kind === "pipeline") {
        const i = routineIds.indexOf(n.id)
        const a = (i / Math.max(1, routineIds.length)) * Math.PI * 2 - Math.PI / 2
        return {
          x: WIDTH / 2 + Math.cos(a) * ROUTINE_RING_X,
          y: HEIGHT / 2 + Math.sin(a) * ROUTINE_RING_Y,
          strength: 0.22,
        }
      }
      const lane = n.kind === "lane" ? n.id : n.lane
      const i = lane ? laneIndex.get(lane) : undefined
      if (i === undefined) return { x: WIDTH / 2, y: HEIGHT / 2, strength: 0.05 }
      const a = (i / laneIds.length) * Math.PI * 2 - Math.PI / 2
      /* Commands sit in a band just outside their own lane rather than mixed
         into it. Left to the forces they drifted to the far edge — few edges,
         full repulsion — and read as debris. Out here they read as what they
         are: the ways in to the lane they belong to. */
      const spread = n.kind === "command" ? 1.5 : 1
      return {
        x: WIDTH / 2 + Math.cos(a) * LANE_RING_X * spread,
        y: HEIGHT / 2 + Math.sin(a) * LANE_RING_Y * spread,
        strength: n.kind === "lane" ? 0.5 : n.kind === "command" ? 0.3 : 0.16,
      }
    }

    // Seed unseen nodes at their anchor rather than at random: the settle
    // then reads as the map arranging itself, not as an explosion.
    for (const n of simNodes) {
      if (!previous.has(n.id)) {
        const a = anchorOf(n)
        n.x = a.x + (Math.random() - 0.5) * 60
        n.y = a.y + (Math.random() - 0.5) * 60
      }
    }
    const root = simNodes.find((n) => n.kind === "root")
    if (root) {
      root.fx = WIDTH / 2
      root.fy = HEIGHT / 2
    }

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => LINK_DISTANCE[l.rel])
          .strength((l) => (l.rel === "contains" ? 0.7 : 0.14))
      )
      .force(
        "charge",
        forceManyBody<SimNode>().strength((d) =>
          d.kind === "root" ? -1400 : d.kind === "lane" ? -700 : d.kind === "script" || d.kind === "reference" ? -90 : -300
        )
      )
      .force(
        "collide",
        forceCollide<SimNode>((d) =>
          // Labelled kinds carry text beside them, so they claim more space.
          d.kind === "script" || d.kind === "reference" ? KIND_STYLE[d.kind].radius + 10 : KIND_STYLE[d.kind].radius + 22
        ).strength(0.9)
      )
      .force("x", forceX<SimNode>((d) => anchorOf(d).x).strength((d) => anchorOf(d).strength))
      .force("y", forceY<SimNode>((d) => anchorOf(d).y).strength((d) => anchorOf(d).strength))
      .stop()

    simRef.current = sim
    setSettled(false)

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    if (reduced) {
      // No settling animation: run it out and paint the answer once.
      sim.tick(300)
      bumpFrame((n) => n + 1)
      setSettled(true)
      return () => sim.stop()
    }

    let frame = 0
    const step = () => {
      // Three ticks a frame: the layout resolves in about a second of
      // wall clock instead of five, and still reads as settling.
      sim.tick(3)
      bumpFrame((n) => n + 1)
      if (sim.alpha() > sim.alphaMin()) {
        frame = requestAnimationFrame(step)
      } else {
        setSettled(true)
      }
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      sim.stop()
    }
  }, [nodes, links, laneIds, routineIds])

  /* --------------------------------------------------------- fit to frame */

  // Set once the viewer pans or zooms: after that the map is theirs and a
  // settle must never yank it back.
  const touchedRef = useRef(false)

  const fit = useCallback(() => {
    const list = nodesRef.current
    if (list.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of list) {
      const r = KIND_STYLE[n.kind].radius + 30 // room for the label beside it
      minX = Math.min(minX, n.x - r)
      maxX = Math.max(maxX, n.x + r)
      minY = Math.min(minY, n.y - r)
      maxY = Math.max(maxY, n.y + r)
    }
    const k = Math.min(4, Math.max(0.35, Math.min(WIDTH / (maxX - minX), HEIGHT / (maxY - minY))))
    setView({
      k,
      x: WIDTH / 2 - ((minX + maxX) / 2) * k,
      y: HEIGHT / 2 - ((minY + maxY) / 2) * k,
    })
  }, [])

  useEffect(() => {
    if (settled && !touchedRef.current) fit()
  }, [settled, fit])

  /* -------------------------------------------------- pan, zoom, drag */

  const dragRef = useRef<{ id: string | null; pointer: number; ox: number; oy: number } | null>(null)

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      // The viewBox letterboxes inside the element; scale accordingly.
      const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT)
      const px = (clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale
      const py = (clientY - rect.top - (rect.height - HEIGHT * scale) / 2) / scale
      return { x: (px - view.x) / view.k, y: (py - view.y) / view.k }
    },
    [view]
  )

  const onNodePointerDown = (event: ReactPointerEvent, node: SimNode) => {
    event.stopPropagation()
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    const world = toWorld(event.clientX, event.clientY)
    dragRef.current = { id: node.id, pointer: event.pointerId, ox: world.x - node.x, oy: world.y - node.y }
    node.fx = node.x
    node.fy = node.y
    simRef.current?.alphaTarget(0.25).restart()
    setSettled(false)
    const sim = simRef.current
    if (sim) {
      const pump = () => {
        sim.tick()
        bumpFrame((n) => n + 1)
        if (dragRef.current) requestAnimationFrame(pump)
      }
      requestAnimationFrame(pump)
    }
  }

  const onBackgroundPointerDown = (event: ReactPointerEvent) => {
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
    dragRef.current = { id: null, pointer: event.pointerId, ox: event.clientX - view.x, oy: event.clientY - view.y }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointer !== event.pointerId) return
    if (drag.id === null) {
      touchedRef.current = true
      setView((v) => ({ ...v, x: event.clientX - drag.ox, y: event.clientY - drag.oy }))
      return
    }
    const node = nodesRef.current.find((n) => n.id === drag.id)
    if (!node) return
    const world = toWorld(event.clientX, event.clientY)
    node.fx = world.x - drag.ox
    node.fy = world.y - drag.oy
  }

  const endDrag = () => {
    const drag = dragRef.current
    if (drag?.id) {
      const node = nodesRef.current.find((n) => n.id === drag.id)
      // Released nodes stay put — a map you arranged should keep its shape.
      if (node) {
        node.fx = node.x
        node.fy = node.y
      }
      simRef.current?.alphaTarget(0)
    }
    dragRef.current = null
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    // Non-passive so the page doesn't scroll while zooming the map.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      touchedRef.current = true
      const rect = svg.getBoundingClientRect()
      const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT)
      const px = (event.clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale
      const py = (event.clientY - rect.top - (rect.height - HEIGHT * scale) / 2) / scale
      setView((v) => {
        const k = Math.min(4, Math.max(0.35, v.k * Math.exp(-event.deltaY * 0.0015)))
        // Keep the point under the cursor fixed while the scale changes.
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k }
      })
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [])

  /* ------------------------------------------------------------ focus */

  const ordered = useMemo(
    () =>
      [...nodes].sort(
        (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)
      ),
    [nodes]
  )
  const [focusIndex, setFocusIndex] = useState(0)
  useEffect(() => {
    setFocusIndex((i) => Math.min(i, Math.max(0, ordered.length - 1)))
  }, [ordered.length])

  const onGraphKeyDown = (event: React.KeyboardEvent) => {
    if (ordered.length === 0) return
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    if (step) {
      event.preventDefault()
      const next = (focusIndex + step + ordered.length) % ordered.length
      setFocusIndex(next)
      setSelected(ordered[next].id)
      return
    }
    if (event.key === "Escape") setSelected(null)
  }

  /* ----------------------------------------------------------- render */

  const active = selected ?? hovered
  const activeSet = active
    ? new Set<string>([active].concat(Array.from(neighbours.get(active) ?? [])))
    : null

  const dim = (id: string) => {
    if (matches && !matches.has(id)) return true
    if (activeSet && !activeSet.has(id)) return true
    return false
  }

  const selectedNode = selected ? graph.nodes.find((n) => n.id === selected) ?? null : null
  const connections = selectedNode ? connectionsOf(selectedNode.id, graph) : []

  const simNodes = nodesRef.current
  const simLinks = linksRef.current

  /* Labels carry a surface halo, so whichever mark paints last wins an
     overlap. The lane names are the map's signposts and must never be the
     ones that lose, so painting runs from detail up to structure — with the
     node you're actually looking at on top of everything. */
  const PAINT_RANK: Record<NodeKind, number> = {
    script: 0, reference: 0, command: 1, pipeline: 2, routine: 2,
    skill: 3, agent: 4, lane: 5, root: 6,
  }
  const painted = simNodes
    .map((node, i) => ({ node, i }))
    .sort((a, b) => {
      const aLive = a.node.id === active ? 1 : 0
      const bLive = b.node.id === active ? 1 : 0
      if (aLive !== bLive) return aLive - bLive
      return PAINT_RANK[a.node.kind] - PAINT_RANK[b.node.kind] || a.i - b.i
    })
    .map((entry) => entry.node)

  return (
    <div className="flex flex-col gap-3">
      {/* Controls — one row above the chart, per the interaction rules. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">Search the map</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills, agents, files…"
            className="h-8 w-56 rounded-lg border border-tk-slate/15 bg-white px-3 text-[13px] text-tk-onyx placeholder:text-tk-slate/45 focus:border-tk-teal focus:outline-none focus:ring-2 focus:ring-tk-teal/25"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Show or hide node kinds">
          {FILTERABLE.map((kind) => {
            const on = !hidden.has(kind)
            const style = KIND_STYLE[kind]
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev)
                    if (next.has(kind)) next.delete(kind)
                    else next.add(kind)
                    return next
                  })
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  on
                    ? "border-tk-slate/20 bg-white text-tk-onyx"
                    : "border-dashed border-tk-slate/20 bg-transparent text-tk-slate/45"
                )}
              >
                <Swatch kind={kind} muted={!on} />
                {style.label}
                <span className="tabular-nums text-tk-slate/45">{graph.counts[kind] ?? 0}</span>
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              touchedRef.current = false
              fit()
            }}
            className="rounded-lg border border-tk-slate/15 bg-white px-2.5 py-1 text-[11.5px] font-medium text-tk-slate hover:border-tk-slate/30"
          >
            Fit
          </button>
          <button
            type="button"
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              showTable
                ? "border-tk-teal bg-tk-teal text-white"
                : "border-tk-slate/15 bg-white text-tk-slate hover:border-tk-slate/30"
            )}
          >
            Table
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* The map */}
        <div className="relative overflow-hidden rounded-xl border border-tk-slate/12 bg-white shadow-card">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-[min(70vh,700px)] w-full touch-none select-none"
            role="group"
            aria-label={`Hive mind map: ${nodes.length} nodes. Use arrow keys to move between them.`}
            tabIndex={0}
            onKeyDown={onGraphKeyDown}
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={(e) => {
              if (e.target === svgRef.current) setSelected(null)
            }}
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              <g>
                {simLinks.map((link, i) => {
                  const lit = Boolean(activeSet && activeSet.has(link.source.id) && activeSet.has(link.target.id))
                  return (
                    <line
                      key={i}
                      x1={link.source.x}
                      y1={link.source.y}
                      x2={link.target.x}
                      y2={link.target.y}
                      stroke={lit ? "var(--viz-edge-strong)" : "var(--viz-edge)"}
                      strokeWidth={lit ? 1.75 : link.rel === "contains" ? 1.25 : 1}
                      strokeDasharray={link.rel === "loads" ? "4 3" : link.rel === "fires" ? "1 3" : undefined}
                      strokeLinecap="round"
                      opacity={activeSet && !lit ? 0.25 : 1}
                    />
                  )
                })}
              </g>

              <g>
                {painted.map((node) => {
                  const style = KIND_STYLE[node.kind]
                  const r = style.radius
                  const faded = dim(node.id)
                  const isSelected = selected === node.id
                  const structural =
                    node.kind === "root" ||
                    node.kind === "lane" ||
                    node.kind === "agent" ||
                    node.kind === "skill"
                  const detail = node.kind === "script" || node.kind === "reference"
                  const showLabel =
                    structural ||
                    isSelected ||
                    hovered === node.id ||
                    Boolean(matches?.has(node.id)) ||
                    Boolean(activeSet?.has(node.id)) ||
                    (view.k >= 1.15 && !detail) ||
                    view.k >= 2

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x},${node.y})`}
                      opacity={faded ? 0.16 : 1}
                      className="cursor-pointer"
                      tabIndex={ordered[focusIndex]?.id === node.id ? 0 : -1}
                      role="button"
                      aria-label={`${style.label}: ${node.label}`}
                      aria-pressed={isSelected}
                      onPointerDown={(e) => onNodePointerDown(e, node)}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelected((cur) => (cur === node.id ? null : node.id))
                        setFocusIndex(Math.max(0, ordered.findIndex((n) => n.id === node.id)))
                      }}
                      onMouseEnter={() => setHovered(node.id)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(node.id)}
                      onBlur={() => setHovered(null)}
                    >
                      {isSelected ? (
                        <circle r={r + 6} fill="none" stroke="var(--viz-edge-strong)" strokeWidth={1.5} />
                      ) : null}
                      {/* A surface ring keeps overlapping marks legible. */}
                      {style.shape === "circle" || style.shape === "dot" ? (
                        <circle r={r} fill={style.color} stroke="rgb(var(--card-rgb))" strokeWidth={2} />
                      ) : (
                        <path d={shapePath(node.kind, r)} fill={style.color} stroke="rgb(var(--card-rgb))" strokeWidth={2} />
                      )}
                      {showLabel ? (
                        <text
                          /* Labels radiate outward from the centre. Always
                             hanging them to the right stacked the left-hand
                             nodes' text straight over their neighbours. */
                          x={node.x < WIDTH / 2 ? -(r + 6) : r + 6}
                          textAnchor={node.x < WIDTH / 2 ? "end" : "start"}
                          y={3.5}
                          className="pointer-events-none font-ui"
                          /* `fill-*` is NOT one of the channels tailwind.config
                             remaps onto the appearance tokens — `fill-tk-onyx`
                             paints literal onyx and disappears on the dark
                             card. Always paint SVG from the var directly. */
                          fill={
                            node.kind === "script" || node.kind === "reference"
                              ? "rgb(var(--ink-3-rgb))"
                              : "rgb(var(--ink-rgb))"
                          }
                          style={{
                            fontSize: node.kind === "root" ? 14 : node.kind === "lane" ? 12.5 : 10.5,
                            fontWeight: node.kind === "root" || node.kind === "lane" ? 700 : 500,
                          }}
                          // A halo, so a label crossing an edge stays readable.
                          stroke="rgb(var(--card-rgb))"
                          strokeWidth={3.5}
                          paintOrder="stroke"
                        >
                          {node.label}
                        </text>
                      ) : null}
                    </g>
                  )
                })}
              </g>
            </g>
          </svg>

          {!settled ? (
            <p className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10.5px] text-tk-slate/45">
              settling…
            </p>
          ) : null}
          <p className="pointer-events-none absolute bottom-2 right-3 font-mono text-[10.5px] text-tk-slate/40">
            scroll to zoom · drag to move
          </p>
        </div>

        {/* Inspector */}
        <aside className="rounded-xl border border-tk-slate/12 bg-white p-4 shadow-card" aria-live="polite">
          {selectedNode ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-tk-slate/55">
                  <Swatch kind={selectedNode.kind} />
                  {KIND_STYLE[selectedNode.kind].label}
                </p>
                <h3 className="mt-1 break-words font-ui text-[15px] font-semibold text-tk-onyx">
                  {selectedNode.label}
                </h3>
              </div>
              {selectedNode.blurb ? (
                <p className="text-[12.5px] leading-relaxed text-tk-slate/80">{selectedNode.blurb}</p>
              ) : null}
              {selectedNode.meta && Object.keys(selectedNode.meta).length ? (
                <dl className="flex flex-col gap-1.5 border-t border-tk-slate/10 pt-3">
                  {Object.entries(selectedNode.meta).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/50">{key}</dt>
                      <dd className="text-[12px] text-tk-slate/85">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {selectedNode.source ? (
                <p className="break-all border-t border-tk-slate/10 pt-3 font-mono text-[11px] text-tk-slate/60">
                  {selectedNode.source}
                </p>
              ) : null}
              {connections.length ? (
                <div className="border-t border-tk-slate/10 pt-3">
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/50">
                    {connections.length} connection{connections.length === 1 ? "" : "s"}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {connections.map(({ node, rel, out }) => (
                      <li key={`${node.id}-${rel}-${out}`}>
                        <button
                          type="button"
                          onClick={() => setSelected(node.id)}
                          className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[12px] text-tk-slate/85 hover:bg-tk-linen"
                        >
                          <Swatch kind={node.kind} />
                          <span className="truncate">{node.label}</span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-tk-slate/45">
                            {out ? rel : `${rel} by`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] leading-relaxed text-tk-slate/70">
                Pick a node to read what it is, where it lives in the repo, and what it
                talks to. Hover to light up its neighbours.
              </p>
              <div className="border-t border-tk-slate/10 pt-3">
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/50">
                  Legend
                </p>
                <ul className="flex flex-col gap-1.5">
                  {LEGEND.map((group) => (
                    <li key={group.label} className="flex items-center gap-2 text-[12px] text-tk-slate/80">
                      <span className="flex items-center gap-1">
                        {group.kinds.map((k) => (
                          <Swatch key={k} kind={k} />
                        ))}
                      </span>
                      {group.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-tk-slate/10 pt-3">
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/50">
                  Edges
                </p>
                <ul className="flex flex-col gap-1 font-mono text-[11px] text-tk-slate/70">
                  <li>─── contains</li>
                  <li>- - - loads</li>
                  <li>· · · fires</li>
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* The table view — the relief the light-mode contrast WARN obligates,
          and the linear read for anyone not driving a force graph by pointer. */}
      {showTable ? (
        <div className="overflow-x-auto rounded-xl border border-tk-slate/12 bg-white shadow-card">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <caption className="sr-only">Every node in the hive mind map</caption>
            <thead>
              <tr className="border-b border-tk-slate/12 text-[10.5px] uppercase tracking-wide text-tk-slate/55">
                <th scope="col" className="px-3 py-2 font-semibold">Kind</th>
                <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                <th scope="col" className="px-3 py-2 font-semibold">What it is</th>
                <th scope="col" className="px-3 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tk-slate/8">
              {ordered
                .filter((n) => !matches || matches.has(n.id))
                .map((node) => (
                  <tr
                    key={node.id}
                    className={cn("align-top", selected === node.id && "bg-tk-linen")}
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="flex items-center gap-1.5 text-tk-slate/75">
                        <Swatch kind={node.kind} />
                        {KIND_STYLE[node.kind].label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelected(node.id)}
                        className="font-medium text-tk-onyx hover:text-tk-teal hover:underline"
                      >
                        {node.label}
                      </button>
                    </td>
                    <td className="max-w-[46ch] px-3 py-2 text-tk-slate/75">{node.blurb}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-tk-slate/55">{node.source}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

/** The mark, at legend size — same hue and shape language as the map. */
function Swatch({ kind, muted }: { kind: NodeKind; muted?: boolean }) {
  const style = KIND_STYLE[kind]
  return (
    <svg width="10" height="10" viewBox="-6 -6 12 12" aria-hidden className="shrink-0">
      {style.shape === "circle" || style.shape === "dot" ? (
        <circle r={style.shape === "dot" ? 3 : 4.5} fill={muted ? "var(--viz-sub)" : style.color} />
      ) : (
        <path d={shapePath(kind, 4.5)} fill={muted ? "var(--viz-sub)" : style.color} />
      )}
    </svg>
  )
}
