#!/usr/bin/env node
// Reject color utilities other than greys/black/white.
// Greyscale enforces flow-validity testing without aesthetic distraction.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED_COLORS = new Set([
  'white', 'black',
  'gray-50', 'gray-100', 'gray-200', 'gray-300', 'gray-400',
  'gray-500', 'gray-600', 'gray-700', 'gray-800', 'gray-900', 'gray-950',
  // A-Team extension: token-bound neutral utilities (near-greyscale by
  // construction — chroma 0.01–0.03) are the materialised equivalent of gray-*.
  'neutral-50', 'neutral-100', 'neutral-200', 'neutral-300', 'neutral-400',
  'neutral-500', 'neutral-600', 'neutral-700', 'neutral-800', 'neutral-900', 'neutral-950',
  'transparent', 'current', 'inherit',
]);

// A-Team extension: no raw color literals in screens — color reaches a screen
// only through token CSS variables. src/styles/ is exempt (tokens.css and
// variant blocks legitimately hold OKLCH values).
const RAW_COLOR = /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])|\brgba?\(|\bhsla?\(|\boklch\((?!var\()/g;

// Tailwind color utility prefix → matches `bg-`, `text-`, `border-`, etc.
const PREFIXES = ['bg', 'text', 'border', 'ring', 'outline', 'divide', 'placeholder', 'caret', 'accent', 'fill', 'stroke', 'from', 'via', 'to'];
const COLOR_UTILITY = new RegExp(
  `\\b(?:${PREFIXES.join('|')})-([a-z]+(?:-[0-9]{2,3})?)`,
  'g',
);

const errors = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(astro|css|html|js|ts|tsx|jsx)$/.test(entry)) check(full);
  }
}

function check(file) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const inStyles = /[\\/]src[\\/]styles[\\/]/.test(file) || file.includes('src/styles/');
  lines.forEach((line, i) => {
    if (!inStyles) {
      for (const match of line.matchAll(RAW_COLOR)) {
        errors.push({ file, line: i + 1, utility: `raw color ${match[0]}` });
      }
    }
    for (const match of line.matchAll(COLOR_UTILITY)) {
      const value = match[1];
      // Skip arbitrary values like text-[12px] (no color suffix expected)
      if (/^\[/.test(value)) continue;
      if (ALLOWED_COLORS.has(value)) continue;
      // Allow grey-related semantic placeholders if literally `bg-current` etc.
      if (['current', 'inherit', 'transparent'].includes(value)) continue;
      // Allow size-only utilities (e.g. text-sm, text-base — these have non-numeric suffix)
      if (/^(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|left|right|center|justify)$/.test(value)) continue;
      // A-Team fix: upstream regex also caught non-color utilities (border-t,
      // ring-offset, text-ellipsis…) — skip side/width/behavior suffixes.
      if (/^(t|b|l|r|x|y|s|e|none|solid|dashed|dotted|double|hidden|collapse|separate|offset|opacity|ellipsis|clip|wrap|nowrap|balance|pretty|full|screen|auto)$/.test(value)) continue;
      errors.push({ file, line: i + 1, utility: match[0] });
    }
  });
}

walk('./src');

if (errors.length) {
  console.error('lofi-lint: color leakage detected. Lo-fi must remain greyscale.');
  for (const e of errors) {
    console.error(`  ${e.file}:${e.line}  ${e.utility}`);
  }
  process.exit(1);
} else {
  console.log('lofi-lint: clean — greyscale only.');
}
