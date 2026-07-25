# -*- coding: utf-8 -*-
"""
page-brief — spec-driven renderer for per-page product briefs.

Reads a project-agnostic board spec (JSON) describing a catalog of page-briefs and
renders each one as a self-contained card using the v2 3-block layout:

    Purpose      (Responsibilities · Checklist)
    Connections  (Appears in journeys · Connects to)
    Validation   (Acceptance criteria — factual + qualitative/cotton test)

plus a reading-key footer. The board also carries two shared pages, rendered once:

    · JTBD definitions   — the job set (statement + persona). Cards carry code
                           pills only, so the definitions are never repeated.
    · Job → pages index   — the reverse view: pick a job, see it laid out across
                           the pages it passes through, with the tasks on each.

Output: SVG, a combined HTML wrapper, and optionally a rasterized PNG for the
self-verify (Read the PNG) loop.

This engine carries NO project content. All page/job data comes from the spec file.
See ../references/spec-schema.md for the schema and ../references/examples/ for a
worked example spec.

Usage:
    python page-brief.py board.json --out ./out --rasterize
    python page-brief.py board.json --out ./out --columns 2
    python page-brief.py board.json --out ./out --cards-only
"""
import argparse
import html
import json
import os
import sys

# ---------------------------------------------------------------------------
# Palette. Neutral chrome is fixed; job (JTBD) colours are assigned from a
# distinct-hue palette in spec order unless the spec pins a colour per job.
# ---------------------------------------------------------------------------
C = dict(
    ink="#1E1E1E", sub="#6B7280", white="#FFFFFF", line="#D9DCE1", card="#FFFFFF",
    head="#1A5FB4", headbg="#E8F1FF", guide="#6B7280", flag="#9A6B12",
    jrnbg="#DCE9FF", jrntx="#14396F", page="#EEF1F5", group="#F8F9FB",
    grpline="#ECEEF1", grplbl="#9AA1AB", rowline="#EEF0F3", cotton="#7A4E9B",
    cottonbg="#F4EDFA",
)
# 8 distinct hues, reused cyclically if a project has more jobs.
JOB_PALETTE = ["#2E7D32", "#1A5FB4", "#8E44AD", "#B8860B", "#0E7C7B",
               "#C0392B", "#00695C", "#5D4037"]


def esc(s):
    return html.escape(str(s), quote=True)


def short_job(code):
    """Display short form of a job code for inline pills.
    JTBD-1 -> J1 (the common convention); otherwise the code is left as-is so
    arbitrary project code schemes still render legibly."""
    c = str(code)
    if c.upper().startswith("JTBD-"):
        return "J" + c[5:]
    return c


def wrap(t, size, maxw):
    """Greedy word-wrap sized to an approximate glyph width."""
    cpl = max(4, int(maxw / (size * 0.55)))
    out, cur = [], ""
    for w in str(t).split():
        if len(cur) + len(w) + 1 <= cpl:
            cur = (cur + " " + w).strip()
        else:
            out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out or [""]


class Jobs:
    """Resolves a job code to its colour, statement and persona from the spec.

    The spec's `jtbds` map is optional; unknown codes still render (grey, no
    statement) so a half-specified board is never a hard failure."""

    def __init__(self, spec):
        raw = spec.get("jtbds", {}) or {}
        self.statement = {}
        self.persona = {}
        self.color = {}
        self.order = []
        pi = 0
        for code, val in raw.items():
            if isinstance(val, str):
                stmt, persona, color = val, "", None
            else:
                # `desc` accepted as a v1 alias for `statement`
                stmt = val.get("statement", val.get("desc", ""))
                persona = val.get("persona", "")
                color = val.get("color")
            self.statement[code] = stmt
            self.persona[code] = persona
            if not color:
                color = JOB_PALETTE[pi % len(JOB_PALETTE)]
                pi += 1
            self.color[code] = color
            self.order.append(code)

    def col(self, code):
        return self.color.get(code, C["sub"])


class Draw:
    """Shared SVG primitives with a mutable y-cursor, so cards and the board's
    shared pages (definitions, index) render through the same code path."""

    def __init__(self, x, y, W, pad=14):
        self.S = []
        # fragments that must paint beneath their group's content but above the
        # group background — flushed by group() at the right z-position
        self.under = []
        self.x = x
        self.y0 = y
        self.y = y
        self.W = W
        self.pad = pad

    # -- primitives ---------------------------------------------------------
    def T(self, x0, y0, ss, size, col, bold=False, anchor="start", italic=False):
        st = ' font-style="italic"' if italic else ''
        self.S.append(
            f'<text x="{x0}" y="{y0}" font-family="Inter,Arial" font-size="{size}" '
            f'font-weight="{"700" if bold else "400"}" fill="{col}" '
            f'text-anchor="{anchor}"{st}>{esc(ss)}</text>'
        )

    def rect(self, x0, y0, w, h, fill, rad=8, stroke=None, sw=1):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
        self.S.append(
            f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="{rad}" fill="{fill}"{st}/>')

    def line(self, x1, y1, x2, y2, col):
        self.S.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{col}" stroke-width="1"/>')

    @staticmethod
    def chip_w(txt):
        """Chip width without drawing — lets callers wrap BEFORE emitting."""
        return len(str(txt)) * 6.0 + 12

    def chip(self, x0, y0, txt, fill, tcol="#fff", rad=7):
        w = self.chip_w(txt)
        self.rect(x0, y0, w, 15, fill, rad)
        self.T(x0 + 6, y0 + 11, txt, 9.5, tcol, True)
        return w

    def job_pill(self, x0, y0, code, jobs):
        """A JOB reference. Always a filled, job-coloured, fully-rounded pill —
        visually distinct from a journey chip (Q12: kind is never ambiguous)."""
        return self.chip(x0, y0, short_job(code), jobs.col(code), "#fff", 7)

    def journey_chip(self, x0, y0, label):
        """A JOURNEY reference. Always the square-ish pale-blue chip, and always
        carrying the word 'Journey' so a bare code can't be read as a job."""
        return self.chip(x0, y0, label, C["jrnbg"], C["jrntx"], 3)

    # -- flow helpers -------------------------------------------------------
    def sec(self, t):
        self.T(self.x + self.pad, self.y + 11, t, 11, C["ink"], True)
        self.y += 19

    def hint(self, t):
        self.T(self.x + self.pad, self.y + 2, t, 9.5, C["guide"], italic=True)
        self.y += 16

    def para(self, text, col=C["ink"], size=11, indent=0, italic=False):
        for ln in wrap(text, size, self.W - 2 * self.pad - indent):
            self.T(self.x + self.pad + indent, self.y + 10, ln, size, col, italic=italic)
            self.y += 14
        self.y += 2

    def out(self):
        return "".join(self.S)

    def height(self):
        return self.y - self.y0


# ---------------------------------------------------------------------------
# Spec normalisation. Accepts the v1 shapes where they still make sense so an
# older board doesn't hard-fail, and warns about fields removed in v2.
# ---------------------------------------------------------------------------
_REMOVED = {
    "jobs_served": "removed in v2 — redundant with the checklist; 'where it enters' is wireflow-level",
    "components": "removed in v2 — the surface is design's, and this field went stale",
    "cut_log": "removed in v2 — orphaned when components were cut",
    "open": "removed in v2 — open questions live as board post-its, not as a card field",
}


def normalise(spec):
    """Return (spec, warnings) with v1 shapes upgraded in place."""
    warn = []
    seen_removed = set()
    for pg in spec.get("pages", []):
        pid = pg.get("id", "?")

        for key, why in _REMOVED.items():
            if pg.get(key) and key not in seen_removed:
                warn.append(f"{pid}: `{key}` ignored — {why}")
                seen_removed.add(key)

        # appears_in: "J3 · open lead"  ->  {journey, step}
        norm = []
        for a in pg.get("appears_in", []) or []:
            if isinstance(a, str):
                parts = [p.strip() for p in a.split("·", 1)]
                norm.append({"journey": parts[0], "step": parts[1] if len(parts) > 1 else ""})
            else:
                norm.append(a)
        if norm:
            pg["appears_in"] = norm

        # connects: `component` was renamed `trigger` (it is not a component spec)
        for c in pg.get("connects", []) or []:
            if "trigger" not in c and "component" in c:
                c["trigger"] = c.pop("component")

        # key_info -> acceptance.factual
        acc = pg.get("acceptance") or {}
        if not isinstance(acc, dict):
            acc = {}
        if pg.get("key_info"):
            acc.setdefault("factual", [])
            acc["factual"] = list(pg["key_info"]) + list(acc.get("factual") or [])
            if "key_info" not in seen_removed:
                warn.append(f"{pid}: `key_info` folded into `acceptance.factual` — "
                            "rename it, and add the qualitative/cotton-test layer (Q11)")
                seen_removed.add("key_info")
        if acc:
            pg["acceptance"] = acc

        if pg.get("acceptance") and not (pg["acceptance"].get("qualitative")):
            warn.append(f"{pid}: acceptance criteria have no qualitative layer — "
                        "the cotton test is required (Q11), and a human must run it")
    return spec, warn


# ---------------------------------------------------------------------------
# The card
# ---------------------------------------------------------------------------
def card(x, y, W, d, jobs):
    """Render one page-brief card. Returns (svg_fragment, height)."""
    g = Draw(x, y, W)
    pad = g.pad

    # --- header (id · name / route / design-ref) ---
    g.rect(x, y, W, 46, C["headbg"], 10)
    g.T(x + pad, y + 19, f'{d["id"]} · {d["name"]}', 15, C["head"], True)
    g.T(x + pad, y + 34, d.get("route", ""), 10.5, C["sub"])
    if d.get("ref"):
        g.T(x + W - pad, y + 34, "Design ref: " + d["ref"], 9.5, C["head"], False, "end")
    g.y = y + 58

    # --- field renderers ---
    def f_resp():
        g.sec("Responsibilities")
        g.para(d.get("responsibilities", ""))

    def f_checklist():
        g.sec("Checklist")
        g.hint("what this page must let you do — each task rolled up to the job it serves")
        for it in d["checklist"]:
            text, jbs = it.get("text", ""), it.get("jobs", []) or []
            flag = it.get("flag")
            bx, by = x + pad + 2, g.y - 1
            g.rect(bx, by, 10, 10, "#FFFFFF", 2, C["sub"], 1)
            reserve = 24 + max(64, sum(len(short_job(j)) * 6 + 15 for j in jbs))
            lines = wrap(text, 10, W - 2 * pad - reserve)
            for k, ln in enumerate(lines):
                g.T(bx + 16, by + 9 + k * 13, ln, 10, C["ink"])
            jx = x + W - pad
            for jt in reversed(jbs):
                jx -= (len(short_job(jt)) * 6.0 + 12) + 3
                g.job_pill(jx, by, jt, jobs)
            g.y += max(1, len(lines)) * 13 + 6
            if flag or not jbs:
                # Q5 gap-finder: a task tagged to no job is a signal, not a footnote
                msg = flag if isinstance(flag, str) else "serves an unlisted job? — check the JTBD set"
                for k, ln in enumerate(wrap("⚑ " + msg, 9.5, W - 2 * pad - 40)):
                    g.T(bx + 16, g.y + 8 + k * 12, ln, 9.5, C["flag"], italic=True)
                    g.y += 12
                g.y += 6

    def f_appears():
        g.sec("Appears in journeys")
        g.hint("which journeys / steps pass through this page (inbound)")
        ux = x + pad
        for a in d["appears_in"]:
            jn = str(a.get("journey", "")).strip()
            label = "Journey " + jn.lstrip("Jj") if jn and jn.lstrip("Jj").isdigit() else jn
            if a.get("step"):
                label += " · " + a["step"]
            if a.get("variant"):
                label += "  (variant: " + a["variant"] + ")"
            cw = g.chip_w(label)
            if ux + cw > x + W - pad and ux > x + pad:  # wrap BEFORE drawing —
                ux = x + pad                             # drawing-then-wrapping
                g.y += 20                                # duplicated the chip
            g.journey_chip(ux, g.y, label)
            ux += cw + 8
        g.y += 22

    def f_connects():
        g.sec("Connects to · other pages / jobs")
        g.hint("outbound — where this page hands off, including non-navigational handoffs")
        for c in d["connects"]:
            trig, tgt = c.get("trigger", ""), c.get("target", "")
            job, note = c.get("job"), c.get("note", "")
            kind = (c.get("kind") or "").lower()
            cw = g.job_pill(x + pad, g.y, job, jobs) if job else 0
            base = x + pad + (cw + 10 if cw else 0)
            marker = {"page": "→ ", "journey": "⇢ ", "job": "↦ ", "external": "↗ "}.get(kind, "→ ")
            prod = trig + "  " + marker + tgt
            g.T(base, g.y + 11, prod, 10, C["ink"])
            if note:
                g.T(base + len(prod) * 4.8 + 6, g.y + 11, "— " + note, 9.5, C["guide"], italic=True)
            g.y += 20

    def f_acceptance():
        acc = d["acceptance"]
        g.sec("Acceptance criteria")
        fact = acc.get("factual") or []
        qual = acc.get("qualitative") or []
        if fact:
            g.T(x + pad, g.y + 2, "factual — present and true", 9.5, C["guide"], italic=True)
            g.y += 15
            for k in fact:
                g.para("• " + k, C["ink"], 10, 4)
        if qual:
            if fact:
                g.y += 4
            box_top = g.y
            g.T(x + pad + 8, g.y + 12,
                "cotton test — show only this + the screen, and ask “can you do this?”",
                9.5, C["cotton"], bold=True)
            g.y += 22
            for q in qual:
                for ln in wrap("“" + q + "”", 10, W - 2 * pad - 26):
                    g.T(x + pad + 14, g.y + 9, ln, 10, C["ink"])
                    g.y += 13
                g.y += 3
            g.T(x + pad + 8, g.y + 9, "a person runs this — it is not self-certifiable",
                9, C["cotton"], italic=True)
            g.y += 16
            # tint behind the block — queued so it paints above the group bg but
            # below the text already emitted
            g.under.append(f'<rect x="{x + pad}" y="{box_top}" width="{W - 2 * pad}" '
                           f'height="{g.y - box_top}" rx="7" fill="{C["cottonbg"]}"/>')

    def group(title, fns):
        active = [fn for fn in fns if _has(fn, d)]
        if not active:
            return
        idx = len(g.S)
        gy = g.y
        g.y += 22
        first = True
        for fn in active:
            if not first:
                g.y += 11
            fn()
            first = False
        g.y += 8
        gh = g.y - gy
        bg = (f'<rect x="{x + 8}" y="{gy}" width="{W - 16}" height="{gh}" rx="9" '
              f'fill="{C["group"]}" stroke="{C["grpline"]}" stroke-width="1"/>')
        lbl = (f'<text x="{x + 16}" y="{gy + 15}" font-family="Inter,Arial" font-size="8.5" '
               f'font-weight="700" fill="{C["grplbl"]}" letter-spacing="0.8">'
               f'{esc(title.upper())}</text>')
        g.S.insert(idx, bg + lbl)
        if g.under:
            g.S[idx + 1:idx + 1] = g.under
            g.under = []
        g.y += 12

    group("Purpose", [f_resp, f_checklist])
    group("Connections", [f_appears, f_connects])
    group("Validation", [f_acceptance])

    g.T(x + pad, g.y + 4,
        "Reading key: coloured pill = job · blue chip = journey · dark = from the product · "
        "italic grey = our conclusion",
        8.5, C["sub"])
    g.y += 16

    H = g.height()
    frame = (f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="12" fill="{C["card"]}" '
             f'stroke="{C["line"]}" stroke-width="1.5"/>')
    return frame + g.out(), H


# Maps a field renderer to the spec key it consumes, so empty groups are skipped
# entirely (a degraded card with only responsibilities still renders cleanly).
_FIELD_KEYS = {
    "f_resp": "responsibilities", "f_checklist": "checklist",
    "f_appears": "appears_in", "f_connects": "connects",
    "f_acceptance": "acceptance",
}


def _has(fn, d):
    return bool(d.get(_FIELD_KEYS.get(fn.__name__, "")))


# ---------------------------------------------------------------------------
# Shared board pages (rendered once — Q14)
# ---------------------------------------------------------------------------
def jtbd_page(x, y, W, jobs):
    """The job set, defined once for the whole board. Cards carry pills only."""
    g = Draw(x, y, W, pad=18)
    pad = g.pad
    g.rect(x, y, W, 40, C["headbg"], 10)
    g.T(x + pad, y + 25, "Jobs to be done", 15, C["head"], True)
    g.T(x + W - pad, y + 25,
        "defined once for the whole board — cards reference these by pill", 9.5, C["sub"],
        anchor="end")
    g.y = y + 54

    for code in jobs.order:
        top = g.y
        g.job_pill(x + pad, g.y, code, jobs)
        base = x + pad + 52
        for ln in wrap(jobs.statement.get(code, ""), 11, W - pad - 52 - pad):
            g.T(base, g.y + 11, ln, 11, C["ink"])
            g.y += 15
        if jobs.persona.get(code):
            g.T(base, g.y + 10, "persona: " + jobs.persona[code], 9.5, C["guide"], italic=True)
            g.y += 15
        g.y = max(g.y, top + 20) + 8
        g.line(x + pad, g.y - 5, x + W - pad, g.y - 5, C["rowline"])

    g.y += 6
    H = g.height()
    frame = (f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="12" fill="{C["card"]}" '
             f'stroke="{C["line"]}" stroke-width="1.5"/>')
    return frame + g.out(), H


def index_page(x, y, W, jobs, pages):
    """The reverse index: job → the pages it passes through, with the tasks on
    each. Answers 'is this job actually fulfilled by the product?', which no
    single card can answer."""
    g = Draw(x, y, W, pad=18)
    pad = g.pad
    g.rect(x, y, W, 40, C["headbg"], 10)
    g.T(x + pad, y + 25, "Job → pages index", 15, C["head"], True)
    g.T(x + W - pad, y + 25,
        "pick a job and read it across the product, page by page", 9.5, C["sub"], anchor="end")
    g.y = y + 54

    # collect codes referenced anywhere, keeping declaration order first
    referenced = []
    for pg in pages:
        for it in pg.get("checklist", []) or []:
            referenced += it.get("jobs", []) or []
        for c in pg.get("connects", []) or []:
            if c.get("job"):
                referenced.append(c["job"])
    codes = [c for c in jobs.order if c in set(referenced)]
    codes += [c for c in dict.fromkeys(referenced) if c not in jobs.order]

    for code in codes:
        g.job_pill(x + pad, g.y, code, jobs)
        stmt = jobs.statement.get(code, "")
        if stmt:
            g.T(x + pad + 52, g.y + 11, wrap(stmt, 10.5, W - pad * 2 - 60)[0], 10.5, C["ink"], True)
        g.y += 22
        hit = False
        for pg in pages:
            tasks = [it.get("text", "") for it in (pg.get("checklist") or [])
                     if code in (it.get("jobs") or [])]
            links = [c for c in (pg.get("connects") or []) if c.get("job") == code]
            if not tasks and not links:
                continue
            hit = True
            g.T(x + pad + 14, g.y + 10, f'{pg.get("id", "?")} · {pg.get("name", "")}',
                10, C["head"], True)
            g.y += 15
            for t in tasks:
                for ln in wrap("· " + t, 9.5, W - pad * 2 - 44):
                    g.T(x + pad + 30, g.y + 9, ln, 9.5, C["ink"])
                    g.y += 12
            for c in links:
                g.T(x + pad + 30, g.y + 9,
                    c.get("trigger", "") + " → " + c.get("target", ""), 9.5, C["guide"],
                    italic=True)
                g.y += 12
            g.y += 4
        if not hit:
            g.T(x + pad + 14, g.y + 10,
                "no page carries a task for this job — the job is unserved, or the pages are "
                "under-specified", 10, C["flag"], italic=True)
            g.y += 18
        g.y += 6
        g.line(x + pad, g.y - 4, x + W - pad, g.y - 4, C["rowline"])
        g.y += 4

    H = g.height()
    frame = (f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="12" fill="{C["card"]}" '
             f'stroke="{C["line"]}" stroke-width="1.5"/>')
    return frame + g.out(), H


# ---------------------------------------------------------------------------
def build(spec, cards_only=False):
    jobs = Jobs(spec)
    pages = spec.get("pages", [])
    if not pages:
        raise SystemExit("spec has no `pages`")
    cols = max(1, int(spec.get("columns", 3)))
    W = int(spec.get("width", 1380))
    PAD = 24
    CW = (W - (cols + 1) * PAD) // cols

    y = 64 if spec.get("title") else PAD
    frags = []

    if not cards_only and jobs.order:
        frag, h = jtbd_page(PAD, y, W - 2 * PAD, jobs)
        frags.append(frag)
        y += h + PAD
        frag, h = index_page(PAD, y, W - 2 * PAD, jobs, pages)
        frags.append(frag)
        y += h + PAD

    # place cards row-major; each row's height is the tallest card in it
    i = 0
    while i < len(pages):
        row = pages[i:i + cols]
        heights = []
        for j, pg in enumerate(row):
            frag, h = card(PAD + j * (CW + PAD), y, CW, pg, jobs)
            frags.append(frag)
            heights.append(h)
        y += max(heights) + PAD
        i += cols

    H = y + 24
    body = f'<rect x="0" y="0" width="{W}" height="{H}" fill="{C["page"]}"/>'
    title = ""
    if spec.get("title"):
        title = (f'<text x="24" y="38" font-family="Inter,Arial" font-size="20" '
                 f'font-weight="700" fill="{C["ink"]}">{esc(spec["title"])}</text>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
           f'width="{W}" height="{H}">{body}{title}{"".join(frags)}</svg>')
    return svg, W, H


def _rasterize(svg, png_path, width, height=None):
    """Best-effort SVG→PNG so the self-verify (Read the PNG) loop always has an
    image. Tries, in order: cairosvg → rsvg-convert → resvg → headless Chrome/
    Chromium/Edge. Any one produces a PNG, so the skill isn't hostage to a single
    dependency (cairosvg's native lib is frequently missing on macOS)."""
    # 1) cairosvg (pip) — but its native cairo lib may be absent
    try:
        import cairosvg
        cairosvg.svg2png(bytestring=svg.encode(), write_to=png_path, output_width=width)
        return True
    except Exception:
        pass
    import shutil
    import subprocess
    import tempfile
    # 2) rsvg-convert / resvg on PATH
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
    # 3) headless Chrome / Chromium / Edge — screenshot the SVG wrapped in HTML
    chrome = _find_chrome()
    if chrome:
        with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as hf:
            hf.write('<!doctype html><meta charset="utf-8"><body style="margin:0">' + svg + '</body>')
            html_tmp = hf.name
        try:
            tall = int(height) + 40 if height else 4000
            subprocess.run([
                chrome, "--headless", "--disable-gpu", "--hide-scrollbars",
                "--default-background-color=FFFFFFFF",
                f"--window-size={int(width)},{tall}",
                f"--screenshot={png_path}", "file://" + html_tmp,
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return os.path.exists(png_path)
        except Exception:
            return False
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


def main():
    ap = argparse.ArgumentParser(description="Render page-brief cards from a board spec.")
    ap.add_argument("spec", help="path to the board spec JSON")
    ap.add_argument("--out", default=".", help="output directory")
    ap.add_argument("--name", default=None, help="basename for outputs (default: spec filename)")
    ap.add_argument("--columns", type=int, default=None, help="override card columns")
    ap.add_argument("--cards-only", action="store_true",
                    help="skip the JTBD definitions + job→pages index pages")
    ap.add_argument("--rasterize", action="store_true", help="also emit a PNG for self-verify")
    args = ap.parse_args()

    with open(args.spec, encoding="utf-8") as f:
        spec = json.load(f)
    if args.columns:
        spec["columns"] = args.columns

    spec, warnings = normalise(spec)
    for w in warnings:
        print("warning: " + w, file=sys.stderr)

    svg, W, H = build(spec, cards_only=args.cards_only)
    os.makedirs(args.out, exist_ok=True)
    base = args.name or os.path.splitext(os.path.basename(args.spec))[0]
    svg_path = os.path.join(args.out, base + ".svg")
    html_path = os.path.join(args.out, base + ".html")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write('<!doctype html><meta charset="utf-8"><body style="margin:0">' + svg + '</body>')
    outs = [svg_path, html_path]

    if args.rasterize:
        png_path = os.path.join(args.out, base + ".png")
        if _rasterize(svg, png_path, W, H):
            outs.append(png_path)
        else:
            print("could not rasterize to PNG (no cairosvg/rsvg-convert/resvg/Chrome found). "
                  "SVG + HTML still written; open the HTML or install a rasterizer to self-verify.",
                  file=sys.stderr)

    print(f"built {W}x{H} → " + ", ".join(outs))


if __name__ == "__main__":
    main()
