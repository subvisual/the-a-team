#!/usr/bin/env python3
"""
wireflow.py — a reusable, spec-driven wireflow layout engine.

Turns a compact JSON board spec (journeys of lanes + nodes + edges) into:
  - one clean SVG per journey (HORIZONTAL layout: swimlanes stacked, flow left->right)
  - OR one shared MATRIX SVG (owner lanes as horizontal rows spanning ALL journeys,
    journeys as vertical columns — read down a column = one journey, read across a
    row = one owner across every journey)
  - a self-contained combined HTML (deliverable + legend + JTBD x Journey matrix)
  - optional PNGs (via cairosvg) so the agent can Read its own output and self-verify

Two orientations, chosen with board["layout"] or --layout:
  * "horizontal" (default) — best for the deliverable and a DEEP spine; each journey
    is its own diagram, readable end-to-end as a story.
  * "matrix" — best as a board-level OVERVIEW: shared owner rows make the owner-path
    readable across journeys and enforce one lane vocabulary; it compresses per-step depth.

The engine encodes the layout rules learned the hard way (see references/layout-engine.md):
  * lane bands AUTO-SIZE to their contents (never spill "out of swimlane")
  * a geometry router (horizontal: 3 cases; matrix: vertical-elbow)
  * edge labels ride the line on a white chip, wrapping when long
  * glyph sanitising (emoji/dingbats become tofu boxes in cairosvg)

Usage:
    python wireflow.py board.json --out ./out --rasterize
    python wireflow.py board.json --out ./out --layout matrix --rasterize
    python wireflow.py --print-example        # runnable example spec

Spec schema: see references/spec-schema.md (or `python wireflow.py --print-example`).
"""
from __future__ import annotations
import argparse
import html
import json
import os
import sys
from dataclasses import dataclass, field

# ----------------------------------------------------------------------------
# Geometry — horizontal mode
# ----------------------------------------------------------------------------
NODE_W = 188
NODE_H = 62
GUTTER = 92
COL_PITCH = NODE_W + GUTTER
ROW_PITCH = NODE_H + 40
LANE_PAD = 22
LANE_LABEL_W = 132
MARGIN_X = 28
MARGIN_TOP = 96
MARGIN_BOTTOM = 34
FONT = "Inter, 'Helvetica Neue', Arial, sans-serif"

# Geometry — matrix mode
NODE_W_M = 152
NODE_H_M = 50
MINI_GUT = 30
MINI_PITCH = NODE_W_M + MINI_GUT
ROW_SUB = NODE_H_M + 16
SLOT_GUT = 44
MATRIX_TOP = 92
MATRIX_LABEL_W = 128

# ----------------------------------------------------------------------------
# Node-type palette  (fill, stroke, text, shape, dashed)
# ----------------------------------------------------------------------------
TYPES = {
    "start":            dict(fill="#E6F4EA", stroke="#34A853", text="#155724", shape="pill"),
    "outcome":          dict(fill="#CDEBD6", stroke="#1E7E34", text="#0B3D1B", shape="pill"),
    "screen":           dict(fill="#E8F0FE", stroke="#1A73E8", text="#0B3D91", shape="rect"),
    "external_site":    dict(fill="#F1F3F4", stroke="#9AA0A6", text="#3C4043", shape="rect", dashed=True),
    "external_product": dict(fill="#F3E8FD", stroke="#8E44AD", text="#4A235A", shape="rect", dashed=True),
    "system":           dict(fill="#ECEFF1", stroke="#546E7A", text="#263238", shape="system"),
    "agent":            dict(fill="#E0F2F1", stroke="#00897B", text="#004D40", shape="rect"),
    "decision":         dict(fill="#FEF7E0", stroke="#F9AB00", text="#7A5900", shape="diamond"),
    "stop":             dict(fill="#FCE8E6", stroke="#D93025", text="#7A1E17", shape="stop"),
}
LEGEND = [
    ("start", "Start (the struggle)"),
    ("screen", "CRM / own screen (links live route)"),
    ("external_site", "External site (view-only)"),
    ("external_product", "External product"),
    ("system", "System / engine (no UI)"),
    ("agent", "Agent node"),
    ("decision", "Decision"),
    ("stop", "Stop — locked cut / non-path"),
    ("outcome", "Outcome (the job done)"),
]

# ----------------------------------------------------------------------------
# Lane (owner) colours — used ONLY to tint cross-lane arrows by their destination
# lane, so you can trace where a pathway hands off at a glance. Node fills still
# encode TYPE (see TYPES); this is a separate channel on the otherwise-neutral
# edges, so it does not clash with the "colour = node type" rule.
# ----------------------------------------------------------------------------
EDGE_GRAY = "#5f6368"  # same-lane edges stay neutral
LANE_COLORS = ["#1A73E8", "#00897B", "#8E44AD", "#E8710A", "#C5221F",
               "#546E7A", "#B8860B", "#0B8043", "#D01884"]


def lane_color_map(lanes: list[str]) -> dict[str, str]:
    """Stable owner->colour map; same owner keeps its colour across journeys."""
    return {ln: LANE_COLORS[i % len(LANE_COLORS)] for i, ln in enumerate(lanes)}


def marker_id(color: str) -> str:
    return "arrow_" + color.lstrip("#")


def edge_color(s: "Node", t: "Node", lcmap: dict[str, str]) -> str:
    """Cross-lane edges take the DESTINATION lane's colour; same-lane stay gray."""
    if s.lane != t.lane:
        return lcmap.get(t.lane, EDGE_GRAY)
    return EDGE_GRAY

GLYPH_MAP = {
    "⛔": "×", "✦": "*", "✧": "*", "⚙": "", "↺": "<-", "↻": "->",
    "▶": ">", "⬆": "^", "⬇": "v", "⬅": "<", "→": "->",
    "✓": "ok", "✗": "x", "✅": "", "❌": "x", "\ud83d": "", "\ud83e": "",
}


def sanitize(text: str) -> str:
    if not text:
        return ""
    out = []
    for ch in text:
        if ch in GLYPH_MAP:
            out.append(GLYPH_MAP[ch])
        elif ord(ch) >= 0x1F000 or (0x2190 <= ord(ch) <= 0x27BF and ch not in "→↗↘"):
            out.append("")
        else:
            out.append(ch)
    return "".join(out)


def wrap(text: str, max_chars: int) -> list[str]:
    words = sanitize(text).split()
    lines, cur = [], ""
    for w in words:
        if not cur:
            cur = w
        elif len(cur) + 1 + len(w) <= max_chars:
            cur += " " + w
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def esc(s: str) -> str:
    return html.escape(sanitize(s), quote=True)


# ----------------------------------------------------------------------------
# Model
# ----------------------------------------------------------------------------
@dataclass
class Node:
    id: str
    col: int
    lane: str
    type: str
    text: str
    row: int = 0
    href: str | None = None
    x: float = 0
    y: float = 0

    @property
    def cx(self): return self.x + NODE_W / 2
    @property
    def cy(self): return self.y + NODE_H / 2
    @property
    def left(self): return (self.x, self.cy)
    @property
    def right(self): return (self.x + NODE_W, self.cy)
    @property
    def top(self): return (self.cx, self.y)
    @property
    def bottom(self): return (self.cx, self.y + NODE_H)


@dataclass
class Journey:
    id: str
    title: str
    actor: str = ""
    jtbd: str = ""
    start: str = ""
    outcome: str = ""
    lanes: list[str] = field(default_factory=list)
    nodes: list[Node] = field(default_factory=list)
    edges: list[dict] = field(default_factory=list)
    jtbds: list[str] = field(default_factory=list)


def load_journey(d: dict) -> Journey:
    nodes = [Node(**{k: v for k, v in n.items() if k in Node.__annotations__}) for n in d["nodes"]]
    lanes = d.get("lanes") or []
    if not lanes:
        seen = []
        for n in nodes:
            if n.lane not in seen:
                seen.append(n.lane)
        lanes = seen
    return Journey(
        id=d.get("id", d.get("title", "J")), title=d.get("title", ""),
        actor=d.get("actor", ""), jtbd=d.get("jtbd", ""),
        start=d.get("start", ""), outcome=d.get("outcome", ""),
        lanes=lanes, nodes=nodes, edges=d.get("edges", []), jtbds=d.get("jtbds", []),
    )


# ----------------------------------------------------------------------------
# Shared node drawing (works for both modes — geometry from n.x/n.y + w/h)
# ----------------------------------------------------------------------------
def draw_node(n: Node, w: float, h: float, fs: float = 12.5) -> str:
    st = TYPES.get(n.type, TYPES["screen"])
    fill, stroke, tcol, shape = st["fill"], st["stroke"], st["text"], st["shape"]
    dash = ' stroke-dasharray="6 4"' if st.get("dashed") else ""
    x, y = n.x, n.y
    cx, cy = x + w / 2, y + h / 2
    parts = []
    if shape == "diamond":
        pts = f"{cx},{y} {x+w},{cy} {cx},{y+h} {x},{cy}"
        parts.append(f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')
        maxc = int(w / 9.5)
    elif shape == "pill":
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" ry="{h/2}" '
                     f'fill="{fill}" stroke="{stroke}" stroke-width="1.8"/>')
        maxc = int(w / 7.2)
    elif shape == "stop":
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" ry="8" '
                     f'fill="{fill}" stroke="{stroke}" stroke-width="2.2"{dash}/>')
        parts.append(f'<text x="{x+14}" y="{cy+5}" font-size="17" font-weight="700" '
                     f'fill="{stroke}" font-family="{FONT}">&#215;</text>')
        maxc = int(w / 7.6)
    elif shape == "system":
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" ry="4" '
                     f'fill="{fill}" stroke="{stroke}" stroke-width="1.6"{dash}/>')
        parts.append(f'<line x1="{x+10}" y1="{y}" x2="{x+10}" y2="{y+h}" stroke="{stroke}" stroke-width="1.2"/>')
        maxc = int(w / 7.6)
    else:  # rect
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" ry="8" '
                     f'fill="{fill}" stroke="{stroke}" stroke-width="1.8"{dash}/>')
        maxc = int(w / 7.2)

    lines = wrap(n.text, max(8, maxc))
    total = len(lines)
    lh = fs + 1.5
    start_y = cy - (total - 1) * (lh / 2) + fs * 0.35
    text_x = cx if shape != "stop" else cx + 7
    for i, ln in enumerate(lines):
        parts.append(f'<text x="{text_x}" y="{start_y + i*lh:.1f}" text-anchor="middle" '
                     f'font-size="{fs}" fill="{tcol}" font-family="{FONT}">{esc(ln)}</text>')
    inner = "".join(parts)
    if n.href:
        return (f'<a href="{esc(n.href)}" target="_blank">{inner}'
                f'<title>{esc(n.text)} — {esc(n.href)}</title></a>')
    return inner


def label_chip(lx: float, ly: float, label: str) -> str:
    lines = wrap(label, 22)
    chip_w = max(len(l) for l in lines) * 6.4 + 12
    chip_h = len(lines) * 13 + 6
    ry0 = ly - chip_h / 2
    out = [f'<rect x="{lx-chip_w/2:.1f}" y="{ry0:.1f}" width="{chip_w:.1f}" height="{chip_h:.1f}" '
           f'rx="4" fill="#ffffff" stroke="#dadce0" stroke-width="0.8"/>']
    for i, l in enumerate(lines):
        out.append(f'<text x="{lx:.1f}" y="{ry0 + 13 + i*13:.1f}" text-anchor="middle" '
                   f'font-size="10.5" fill="#3c4043" font-family="{FONT}">{esc(l)}</text>')
    return "".join(out)


def arrow_defs(colors: "list[str] | None" = None) -> str:
    seen, markers = [], []
    for c in [EDGE_GRAY, *(colors or [])]:
        if c in seen:
            continue
        seen.append(c)
        markers.append(f'<marker id="{marker_id(c)}" viewBox="0 0 10 10" refX="9" refY="5" '
                       'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                       f'<path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>')
    return "<defs>" + "".join(markers) + "</defs>"


# ============================================================================
# HORIZONTAL mode
# ============================================================================
def layout_h(j: Journey):
    by_lane = {ln: [] for ln in j.lanes}
    for n in j.nodes:
        by_lane.setdefault(n.lane, []).append(n)
        if n.lane not in j.lanes:
            j.lanes.append(n.lane)
    lane_geo = {}
    y = MARGIN_TOP
    for ln in j.lanes:
        max_row = max((n.row for n in by_lane.get(ln, [])), default=0)
        h = LANE_PAD * 2 + (max_row + 1) * NODE_H + max_row * (ROW_PITCH - NODE_H)
        lane_geo[ln] = (y, h)
        for n in by_lane.get(ln, []):
            n.x = MARGIN_X + LANE_LABEL_W + n.col * COL_PITCH
            n.y = y + LANE_PAD + n.row * ROW_PITCH
        y += h
    total_h = y + MARGIN_BOTTOM
    max_col = max((n.col for n in j.nodes), default=0)
    total_w = MARGIN_X + LANE_LABEL_W + (max_col + 1) * COL_PITCH - GUTTER + MARGIN_X
    return lane_geo, total_w, total_h


def route_h(s: Node, t: Node):
    if s.col == t.col:
        p = [s.bottom, t.top] if t.cy >= s.cy else [s.top, t.bottom]
        mid = ((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2)
        return p, (mid[0], mid[1], False)
    gx = t.x - GUTTER / 2
    sx, sy = s.right if t.col > s.col else s.left
    p = [(sx, sy), (gx, sy), (gx, t.cy), t.left]
    return p, (gx, (sy + t.cy) / 2, True)


def edge_svg_h(s: Node, t: Node, label: str, lcmap: "dict[str, str] | None" = None) -> str:
    pts, (lx, ly, _) = route_h(s, t)
    col = edge_color(s, t, lcmap or {})
    d = "M " + " L ".join(f"{px:.1f} {py:.1f}" for px, py in pts)
    out = [f'<path d="{d}" fill="none" stroke="{col}" stroke-width="1.5" '
           f'marker-end="url(#{marker_id(col)})"/>']
    if label:
        out.append(label_chip(lx, ly, label))
    return "".join(out)


def journey_svg(j: Journey, lcmap: "dict[str, str] | None" = None) -> str:
    lane_geo, W, H = layout_h(j)
    lcmap = lcmap or lane_color_map(j.lanes)
    nb = {n.id: n for n in j.nodes}
    S = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" '
         f'viewBox="0 0 {W:.0f} {H:.0f}" font-family="{FONT}">',
         arrow_defs(list(lcmap.values())),
         f'<rect x="0" y="0" width="{W:.0f}" height="{H:.0f}" fill="#ffffff"/>']
    for i, ln in enumerate(j.lanes):
        y0, h = lane_geo[ln]
        tint = "#fbfbfd" if i % 2 == 0 else "#f4f6f9"
        S.append(f'<rect x="{MARGIN_X}" y="{y0:.1f}" width="{W-2*MARGIN_X:.1f}" height="{h:.1f}" '
                 f'fill="{tint}" stroke="#e6e8eb" stroke-width="1"/>')
        lc = lcmap.get(ln, EDGE_GRAY)
        S.append(f'<rect x="{MARGIN_X}" y="{y0:.1f}" width="4" height="{h:.1f}" fill="{lc}"/>')
        wl = wrap(ln, 16)
        for k, l in enumerate(wl):
            S.append(f'<text x="{MARGIN_X+12}" y="{y0 + h/2 - (len(wl)-1)*8 + k*15:.1f}" '
                     f'font-size="12.5" font-weight="600" fill="{lc}" font-family="{FONT}">{esc(l)}</text>')
    S.append(f'<text x="{MARGIN_X}" y="34" font-size="19" font-weight="700" fill="#202124" '
             f'font-family="{FONT}">{esc(j.id)} · {esc(j.title)}</text>')
    sub = " · ".join(x for x in [f"Actor: {j.actor}" if j.actor else "", f"JTBD: {j.jtbd}" if j.jtbd else ""] if x)
    if sub:
        S.append(f'<text x="{MARGIN_X}" y="56" font-size="12.5" fill="#5f6368" font-family="{FONT}">{esc(sub)}</text>')
    flow = " · ".join(x for x in [f"Start = {j.start}" if j.start else "", f"Outcome = {j.outcome}" if j.outcome else ""] if x)
    if flow:
        S.append(f'<text x="{MARGIN_X}" y="74" font-size="11.5" fill="#80868b" font-style="italic" '
                 f'font-family="{FONT}">{esc(flow)}</text>')
    for e in j.edges:
        s, t = nb.get(e["from"]), nb.get(e["to"])
        if s and t:
            S.append(edge_svg_h(s, t, e.get("label", ""), lcmap))
    for n in j.nodes:
        S.append(draw_node(n, NODE_W, NODE_H))
    S.append('</svg>')
    return "\n".join(S)


# ============================================================================
# MATRIX mode — owner rows across all journeys; journeys = vertical columns
# ============================================================================
def shared_lanes(board: dict, journeys: list[Journey]) -> list[str]:
    lanes = list(board.get("lanes") or [])
    if not lanes:
        for j in journeys:
            for ln in (j.lanes or []):
                if ln not in lanes:
                    lanes.append(ln)
            for n in j.nodes:
                if n.lane not in lanes:
                    lanes.append(n.lane)
    return lanes


def layout_matrix(board: dict, journeys: list[Journey]):
    lanes = shared_lanes(board, journeys)
    # row band heights: per lane, max intra-lane row across ALL journeys
    row_geo = {}
    y = MATRIX_TOP
    for ln in lanes:
        maxrow = 0
        for j in journeys:
            for n in j.nodes:
                if n.lane == ln:
                    maxrow = max(maxrow, n.row)
        h = LANE_PAD * 2 + (maxrow + 1) * NODE_H_M + maxrow * (ROW_SUB - NODE_H_M)
        row_geo[ln] = (y, h)
        y += h
    total_h = y + 28
    # journey slots left->right
    slot = {}
    x = MARGIN_X + MATRIX_LABEL_W
    for j in journeys:
        maxcol = max((n.col for n in j.nodes), default=0)
        w = LANE_PAD * 2 + (maxcol + 1) * MINI_PITCH - MINI_GUT
        slot[j.id] = (x, w)
        x += w + SLOT_GUT
    total_w = x - SLOT_GUT + MARGIN_X
    for j in journeys:
        sx, _ = slot[j.id]
        for n in j.nodes:
            y0, _h = row_geo[n.lane]
            n.x = sx + LANE_PAD + n.col * MINI_PITCH
            n.y = y0 + LANE_PAD + n.row * ROW_SUB
    return lanes, row_geo, slot, total_w, total_h


def route_m(s: Node, t: Node):
    w, h = NODE_W_M, NODE_H_M
    scx, scy = s.x + w / 2, s.y + h / 2
    tcx, tcy = t.x + w / 2, t.y + h / 2
    if abs(scy - tcy) < 4:  # same row -> horizontal
        p = [(s.x + w, scy), (t.x, tcy)] if tcx >= scx else [(s.x, scy), (t.x + w, tcy)]
        return p, ((p[0][0] + p[1][0]) / 2, scy - 9)
    sy = s.y + h if tcy > scy else s.y
    ty = t.y if tcy > scy else t.y + h
    midY = (sy + ty) / 2
    p = [(scx, sy), (scx, midY), (tcx, midY), (tcx, ty)]
    return p, ((scx + tcx) / 2, midY - 8)


def edge_svg_m(s: Node, t: Node, label: str, lcmap: "dict[str, str] | None" = None) -> str:
    pts, (lx, ly) = route_m(s, t)
    col = edge_color(s, t, lcmap or {})
    d = "M " + " L ".join(f"{px:.1f} {py:.1f}" for px, py in pts)
    out = [f'<path d="{d}" fill="none" stroke="{col}" stroke-width="1.4" '
           f'marker-end="url(#{marker_id(col)})"/>']
    if label:
        out.append(label_chip(lx, ly, label))
    return "".join(out)


def matrix_svg(board: dict, journeys: list[Journey]) -> str:
    lanes, row_geo, slot, W, H = layout_matrix(board, journeys)
    lcmap = lane_color_map(lanes)
    S = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" '
         f'viewBox="0 0 {W:.0f} {H:.0f}" font-family="{FONT}">',
         arrow_defs(list(lcmap.values())),
         f'<rect x="0" y="0" width="{W:.0f}" height="{H:.0f}" fill="#ffffff"/>']
    # owner rows (full width) + labels
    for i, ln in enumerate(lanes):
        y0, h = row_geo[ln]
        tint = "#fbfbfd" if i % 2 == 0 else "#f4f6f9"
        S.append(f'<rect x="{MARGIN_X}" y="{y0:.1f}" width="{W-2*MARGIN_X:.1f}" height="{h:.1f}" '
                 f'fill="{tint}" stroke="#e6e8eb" stroke-width="1"/>')
        lc = lcmap.get(ln, EDGE_GRAY)
        S.append(f'<rect x="{MARGIN_X}" y="{y0:.1f}" width="4" height="{h:.1f}" fill="{lc}"/>')
        wl = wrap(ln, 15)
        for k, l in enumerate(wl):
            S.append(f'<text x="{MARGIN_X+12}" y="{y0 + h/2 - (len(wl)-1)*8 + k*15:.1f}" '
                     f'font-size="12" font-weight="600" fill="{lc}" font-family="{FONT}">{esc(l)}</text>')
    # journey column headers + dividers
    for j in journeys:
        sx, w = slot[j.id]
        S.append(f'<line x1="{sx-SLOT_GUT/2:.1f}" y1="{MATRIX_TOP-6}" x2="{sx-SLOT_GUT/2:.1f}" '
                 f'y2="{H-14}" stroke="#e0e0e0" stroke-width="1" stroke-dasharray="3 4"/>')
        hd = wrap(f"{j.id} · {j.title}", int(w / 8))
        for k, l in enumerate(hd):
            S.append(f'<text x="{sx + w/2:.1f}" y="{54 + k*15:.1f}" text-anchor="middle" '
                     f'font-size="13" font-weight="700" fill="#202124" font-family="{FONT}">{esc(l)}</text>')
        if j.jtbd:
            S.append(f'<text x="{sx + w/2:.1f}" y="{54 + len(hd)*15:.1f}" text-anchor="middle" '
                     f'font-size="10" fill="#80868b" font-family="{FONT}">{esc("JTBD: "+j.jtbd)}</text>')
    S.append(f'<text x="{MARGIN_X}" y="30" font-size="18" font-weight="700" fill="#202124" '
             f'font-family="{FONT}">{esc(board.get("title","Wireflow"))} — matrix view</text>')
    # edges then nodes
    for j in journeys:
        nb = {n.id: n for n in j.nodes}
        for e in j.edges:
            s, t = nb.get(e["from"]), nb.get(e["to"])
            if s and t:
                S.append(edge_svg_m(s, t, e.get("label", ""), lcmap))
    for j in journeys:
        for n in j.nodes:
            S.append(draw_node(n, NODE_W_M, NODE_H_M, fs=11))
    S.append('</svg>')
    return "\n".join(S)


# ----------------------------------------------------------------------------
# Combined HTML  (legend + JTBD x Journey matrix + the deliverable svgs)
# ----------------------------------------------------------------------------
def legend_html() -> str:
    rows = []
    for t, label in LEGEND:
        st = TYPES[t]
        border = f"2px {'dashed' if st.get('dashed') else 'solid'} {st['stroke']}"
        rows.append(f'<div style="display:flex;align-items:center;gap:8px;margin:4px 0">'
                    f'<span style="width:26px;height:16px;background:{st["fill"]};border:{border};'
                    f'border-radius:{"8px" if st["shape"] in ("pill","stop") else "3px"};display:inline-block"></span>'
                    f'<span style="font-size:13px;color:#3c4043">{html.escape(label)}</span></div>')
    return ('<div style="border:1px solid #e6e8eb;border-radius:10px;padding:14px 18px;'
            'background:#fff;min-width:280px"><h3 style="margin:0 0 8px;font-size:14px;color:#202124">'
            'Node types</h3>' + "".join(rows) + '</div>')


def matrix_table_html(jtbds: list[str], journeys: list[Journey]) -> str:
    if not jtbds:
        return ""
    head = "".join(f'<th style="padding:6px 10px;font-size:12px;color:#5f6368;'
                   f'border-bottom:2px solid #e6e8eb">{html.escape(j.id)}</th>' for j in journeys)
    rows = []
    for jt in jtbds:
        cells = []
        for j in journeys:
            hit = jt in j.jtbds or (j.jtbd and jt.lower() in j.jtbd.lower())
            cells.append(f'<td style="text-align:center;padding:6px 10px;font-size:14px;'
                         f'color:{"#1e7e34" if hit else "#dadce0"}">{"●" if hit else "·"}</td>')
        rows.append(f'<tr><td style="padding:6px 10px;font-size:12.5px;color:#3c4043">{html.escape(jt)}</td>{"".join(cells)}</tr>')
    return ('<div style="border:1px solid #e6e8eb;border-radius:10px;padding:14px 18px;background:#fff;overflow:auto">'
            '<h3 style="margin:0 0 8px;font-size:14px;color:#202124">JTBD × Journey coverage</h3>'
            f'<table style="border-collapse:collapse"><tr><th></th>{head}</tr>{"".join(rows)}</table></div>')


def build_html(board: dict, journeys: list[Journey], svgs: dict[str, str], layout: str) -> str:
    title = board.get("title", "Wireflow")
    if layout == "matrix":
        body = (f'<section style="margin:22px 0"><div style="overflow:auto;border:1px solid #eee;'
                f'border-radius:10px;background:#fff">{svgs["__matrix__"]}</div></section>')
    else:
        body = "".join(f'<section style="margin:26px 0"><div style="overflow:auto;border:1px solid #eee;'
                       f'border-radius:10px;background:#fff">{svgs[j.id]}</div></section>' for j in journeys)
    top = (f'<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;margin-bottom:8px">'
           f'{legend_html()}{matrix_table_html(board.get("jtbds", []), journeys)}</div>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(title)}</title>'
            f'<style>body{{font-family:{FONT};margin:24px;background:#f7f8fa;color:#202124}}'
            f'h1{{font-size:24px;margin:0 0 4px}} .sub{{color:#5f6368;font-size:14px;margin-bottom:16px}}</style></head>'
            f'<body><h1>{html.escape(title)}</h1>'
            f'<div class="sub">{html.escape(board.get("subtitle",""))} — layout: {layout}</div>{top}{body}</body></html>')


# ----------------------------------------------------------------------------
# Driver
# ----------------------------------------------------------------------------
def render_board(board: dict, outdir: str, rasterize: bool = False, layout: str | None = None):
    os.makedirs(outdir, exist_ok=True)
    layout = layout or board.get("layout", "horizontal")
    journeys = [load_journey(d) for d in board["journeys"]]
    svgs = {}
    written = []
    if layout == "matrix":
        svg = matrix_svg(board, journeys)
        svgs["__matrix__"] = svg
        p = os.path.join(outdir, "wf_matrix.svg")
        open(p, "w").write(svg)
        written.append(p)
    else:
        # board-level owner->colour map so the same owner keeps its colour across
        # every per-journey diagram (falls back to union of journey lanes)
        lcmap = lane_color_map(shared_lanes(board, journeys))
        for j in journeys:
            svg = journey_svg(j, lcmap)
            svgs[j.id] = svg
            p = os.path.join(outdir, f"wf_{j.id}.svg")
            open(p, "w").write(svg)
            written.append(p)
    hp = os.path.join(outdir, "wireflow.html")
    open(hp, "w").write(build_html(board, journeys, svgs, layout))
    written.append(hp)

    pngs = []
    if rasterize:
        targets = ([("__matrix__", os.path.join(outdir, "wf_matrix.png"), 1800)]
                   if layout == "matrix" else
                   [(j.id, os.path.join(outdir, f"wf_{j.id}.png"), 1400) for j in journeys])
        for key, pp, w in targets:
            if _rasterize(svgs[key], pp, w):
                pngs.append(pp)
        if not pngs:
            print("[rasterize] skipped: no cairosvg/rsvg-convert/resvg/Chrome found. "
                  "SVG + HTML still written; install a rasterizer to self-verify.",
                  file=sys.stderr)
    return written, pngs


def _svg_size(svg: str) -> tuple:
    import re
    mw = re.search(r'<svg[^>]*\bwidth="(\d+)', svg)
    mh = re.search(r'<svg[^>]*\bheight="(\d+)', svg)
    return (int(mw.group(1)) if mw else 0, int(mh.group(1)) if mh else 0)


def _rasterize(svg: str, png_path: str, width: int) -> bool:
    """Best-effort SVG→PNG so the self-verify (Read the PNG) loop always has an
    image. Tries, in order: cairosvg → rsvg-convert → resvg → headless Chrome/
    Chromium/Edge — same chain as page-brief.py, so neither engine is hostage
    to a single dependency (cairosvg's native lib is frequently missing on macOS)."""
    try:
        import cairosvg
        cairosvg.svg2png(bytestring=svg.encode(), write_to=png_path, output_width=width)
        return True
    except Exception:
        pass
    import shutil
    import subprocess
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False, encoding="utf-8") as tf:
        tf.write(svg)
        svg_tmp = tf.name
    try:
        if shutil.which("rsvg-convert"):
            subprocess.run(["rsvg-convert", "-w", str(width), "-o", png_path, svg_tmp], check=True)
            return True
        if shutil.which("resvg"):
            subprocess.run(["resvg", "-w", str(width), svg_tmp, png_path], check=True)
            return True
    except Exception:
        pass
    finally:
        try:
            os.unlink(svg_tmp)
        except OSError:
            pass
    chrome = _find_chrome()
    if chrome:
        with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as hf:
            hf.write('<!doctype html><meta charset="utf-8"><body style="margin:0">' + svg + '</body>')
            html_tmp = hf.name
        try:
            nat_w, nat_h = _svg_size(svg)
            # Chrome screenshots at window size and the HTML embeds the SVG at
            # its natural size — size the window to the SVG or the right edge clips.
            win_w = max(int(width), nat_w) if nat_w else int(width)
            tall = (nat_h + 40) if nat_h else 4000
            subprocess.run([
                chrome, "--headless", "--disable-gpu", "--hide-scrollbars",
                "--default-background-color=FFFFFFFF",
                f"--window-size={win_w},{tall}",
                f"--screenshot={png_path}", "file://" + html_tmp,
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return os.path.exists(png_path)
        except Exception:
            pass
        finally:
            try:
                os.unlink(html_tmp)
            except OSError:
                pass
    return False


def _find_chrome():
    """Locate a headless-capable Chromium browser across macOS/Linux/Windows."""
    import shutil
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
                 "microsoft-edge", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    for p in (
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ):
        if os.path.exists(p):
            return p
    return None


EXAMPLE = {
    "title": "Example wireflow",
    "subtitle": "two tiny journeys",
    "layout": "horizontal",
    "jtbds": ["Get started fast", "Recover from an error"],
    "lanes": ["User", "App / Own", "System"],
    "journeys": [
        {
            "id": "J1", "title": "Onboard", "actor": "New user",
            "jtbd": "Get started fast", "start": "wants to try the product",
            "outcome": "first value seen", "jtbds": ["Get started fast"],
            "lanes": ["User", "App / Own", "System"],
            "nodes": [
                {"id": "a", "col": 0, "lane": "User", "type": "start", "text": "Lands on site"},
                {"id": "b", "col": 1, "lane": "App / Own", "type": "screen", "text": "Sign-up form", "href": "/signup"},
                {"id": "c", "col": 2, "lane": "System", "type": "decision", "text": "Email valid?"},
                {"id": "d", "col": 3, "lane": "App / Own", "type": "screen", "text": "Welcome / first task"},
                {"id": "e", "col": 3, "lane": "System", "type": "stop", "text": "Blocked: invalid email"},
                {"id": "f", "col": 4, "lane": "User", "type": "outcome", "text": "First value seen"},
            ],
            "edges": [
                {"from": "a", "to": "b"}, {"from": "b", "to": "c", "label": "submit"},
                {"from": "c", "to": "d", "label": "yes"}, {"from": "c", "to": "e", "label": "no — locked cut"},
                {"from": "d", "to": "f"},
            ],
        },
        {
            "id": "J2", "title": "Recover", "actor": "Returning user",
            "jtbd": "Recover from an error", "start": "hit an error", "outcome": "back on track",
            "jtbds": ["Recover from an error"],
            "lanes": ["User", "App / Own", "System"],
            "nodes": [
                {"id": "g", "col": 0, "lane": "User", "type": "start", "text": "Sees error"},
                {"id": "h", "col": 1, "lane": "App / Own", "type": "screen", "text": "Error screen"},
                {"id": "i", "col": 2, "lane": "System", "type": "system", "text": "Retry job"},
                {"id": "k", "col": 3, "lane": "User", "type": "outcome", "text": "Back on track"},
            ],
            "edges": [
                {"from": "g", "to": "h"}, {"from": "h", "to": "i", "label": "retry"},
                {"from": "i", "to": "k"},
            ],
        },
    ],
}


def main():
    ap = argparse.ArgumentParser(description="Render a wireflow board spec to SVG/HTML/PNG.")
    ap.add_argument("spec", nargs="?", help="path to board JSON spec")
    ap.add_argument("--out", default="./wireflow-out")
    ap.add_argument("--layout", choices=["horizontal", "matrix"], default=None,
                    help="override board['layout']")
    ap.add_argument("--rasterize", action="store_true", help="also emit PNGs (needs cairosvg)")
    ap.add_argument("--print-example", action="store_true")
    a = ap.parse_args()
    if a.print_example:
        print(json.dumps(EXAMPLE, indent=2))
        return
    board = EXAMPLE if not a.spec else json.load(open(a.spec))
    written, pngs = render_board(board, a.out, a.rasterize, a.layout)
    for p in written + pngs:
        print(p)


if __name__ == "__main__":
    main()
