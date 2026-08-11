#!/usr/bin/env node
// Token generation helpers used by the `design-system` skill.
// Two subcommands:
//   typography <base> <ratio>                 → JSON scale + lineHeights + spacing + warnings
//   color <kind> <hue> <chroma> [lAdjust]     → JSON 10-step OKLCH scale with hex fallback
//   contrast <hex1> <hex2>                    → JSON contrast ratio (WCAG)
//
// Self-contained — no dependencies.

const L_CURVE = [0.985, 0.965, 0.92, 0.85, 0.74, 0.62, 0.52, 0.42, 0.32, 0.22];
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const CHROMA_TAPER = [0.30, 0.50, 0.75, 0.90, 1.00, 1.00, 1.00, 0.95, 0.85, 0.70];

// --- OKLCH ↔ sRGB ---

function oklchToLinearSrgb(L, C, H) {
  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function linearToGammaSrgb(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function gammaToLinearSrgb(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function srgbLinearToHex(linearRgb) {
  const toByte = (v) =>
    Math.round(linearToGammaSrgb(v) * 255).toString(16).padStart(2, '0');
  return `#${toByte(linearRgb[0])}${toByte(linearRgb[1])}${toByte(linearRgb[2])}`;
}

function hexToLinearSrgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length !== 3) throw new Error(`Bad hex: ${hex}`);
  return m.map((h) => gammaToLinearSrgb(parseInt(h, 16) / 255));
}

// --- WCAG contrast ---

function relativeLuminance(linearRgb) {
  const [r, g, b] = linearRgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(linearA, linearB) {
  const La = relativeLuminance(linearA);
  const Lb = relativeLuminance(linearB);
  const [lighter, darker] = La > Lb ? [La, Lb] : [Lb, La];
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Color scale ---

function generateColorScale(hue, chroma, lAdjust = 0) {
  return STEPS.map((step, i) => {
    const L = Math.max(0.02, Math.min(0.99, L_CURVE[i] + lAdjust));
    const C = chroma * CHROMA_TAPER[i];
    const linear = oklchToLinearSrgb(L, C, hue);
    return {
      step,
      L: Number(L.toFixed(3)),
      C: Number(C.toFixed(3)),
      H: Number(hue.toFixed(1)),
      oklch: `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue.toFixed(1)})`,
      hex: srgbLinearToHex(linear),
    };
  });
}

// --- Typography scale ---

const snap4 = (x) => Math.round(x / 4) * 4;
const snap8 = (x) => Math.round(x / 8) * 8;

function generateTypeScale(base, ratio) {
  const raw = {
    caption: base / ratio,
    body: base,
    h3: base * ratio,
    h2: base * ratio ** 2,
    h1: base * ratio ** 3,
  };

  const sizes = {};
  for (const k of Object.keys(raw)) sizes[k] = snap4(raw[k]);

  // Anti-collision: body anchor, walk above then below.
  const bumps = { caption: 0, body: 0, h3: 0, h2: 0, h1: 0 };

  let prev = sizes.body;
  for (const lvl of ['h3', 'h2', 'h1']) {
    while (sizes[lvl] <= prev) {
      sizes[lvl] += 4;
      bumps[lvl]++;
    }
    prev = sizes[lvl];
  }

  prev = sizes.body;
  for (const lvl of ['caption']) {
    while (sizes[lvl] >= prev) {
      sizes[lvl] -= 4;
      bumps[lvl]++;
    }
    if (sizes[lvl] < 8) {
      sizes[lvl] = 8; // floor; warning surfaces in collision check
    }
    prev = sizes[lvl];
  }

  // Per-size line-height: tighter for headings, generous for body.
  const lhRatio = (k) => (k === 'body' ? 1.5 : k === 'caption' ? 1.4 : 1.25);
  const lineHeights = {};
  for (const k of Object.keys(sizes)) lineHeights[k] = snap8(sizes[k] * lhRatio(k));

  const spacing = { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48 };

  const warnings = [];
  for (const lvl of Object.keys(bumps)) {
    if (bumps[lvl] >= 2) {
      warnings.push(
        `Level "${lvl}" required ${bumps[lvl]} bumps at base=${base}, ratio=${ratio}. Consider a wider ratio or a larger base.`,
      );
    }
  }

  return { base, ratio, sizes, lineHeights, spacing, warnings };
}

// --- CLI ---

const [mode, ...args] = process.argv.slice(2);

try {
  if (mode === 'typography') {
    const [base, ratio] = args.map(Number);
    if (!base || !ratio) throw new Error('Usage: typography <base> <ratio>');
    console.log(JSON.stringify(generateTypeScale(base, ratio), null, 2));
  } else if (mode === 'color') {
    const kind = args[0];
    const hue = Number(args[1]);
    const chroma = Number(args[2]);
    const lAdjust = args[3] ? Number(args[3]) : 0;
    if (!kind || Number.isNaN(hue) || Number.isNaN(chroma)) {
      throw new Error('Usage: color <kind> <hue> <chroma> [lAdjust]');
    }
    console.log(JSON.stringify(
      { kind, hue, chroma, lAdjust, scale: generateColorScale(hue, chroma, lAdjust) },
      null,
      2,
    ));
  } else if (mode === 'contrast') {
    const [a, b] = args;
    if (!a || !b) throw new Error('Usage: contrast <hex1> <hex2>');
    const linA = hexToLinearSrgb(a);
    const linB = hexToLinearSrgb(b);
    const ratio = contrastRatio(linA, linB);
    console.log(JSON.stringify({
      a, b,
      ratio: Number(ratio.toFixed(3)),
      passes_AA_body: ratio >= 4.5,
      passes_AA_large: ratio >= 3.0,
      passes_AAA_body: ratio >= 7.0,
    }, null, 2));
  } else {
    console.error([
      'generate-scale.mjs — token generation helpers for the design-system skill',
      '',
      'Subcommands:',
      '  typography <base> <ratio>              Type scale (size + lineHeights + spacing + warnings)',
      '  color <kind> <hue> <chroma> [lAdj]     10-step OKLCH scale with hex fallback',
      '  contrast <hex1> <hex2>                 WCAG contrast ratio + pass flags',
    ].join('\n'));
    process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
