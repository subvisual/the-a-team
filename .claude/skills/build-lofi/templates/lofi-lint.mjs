#!/usr/bin/env node
// Enforce the lo-fi color contract while preserving declared design tokens.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASELINE_COLORS = new Set([
  'white', 'black',
  'gray-50', 'gray-100', 'gray-200', 'gray-300', 'gray-400',
  'gray-500', 'gray-600', 'gray-700', 'gray-800', 'gray-900', 'gray-950',
  'neutral-50', 'neutral-100', 'neutral-200', 'neutral-300', 'neutral-400',
  'neutral-500', 'neutral-600', 'neutral-700', 'neutral-800', 'neutral-900', 'neutral-950',
  'transparent', 'current', 'inherit',
]);

// These are the roles emitted by design-system's canonical scale.ts contract.
const CONTRACT_TYPE_ROLES = new Set(['caption', 'body', 'h3', 'h2', 'h1']);
const BUILTIN_TYPE_ROLES = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
]);
const TEXT_BEHAVIORS = new Set([
  'left', 'right', 'center', 'justify', 'start', 'end', 'ellipsis', 'clip',
  'wrap', 'nowrap', 'balance', 'pretty',
]);
const BUILTIN_LINE_HEIGHTS = new Set(['none', 'tight', 'snug', 'normal', 'relaxed', 'loose']);

const RAW_COLOR = /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])|\b(?:rgba?|hsla?|oklch)\((?!\s*var\()/gi;
const HAS_RAW_COLOR = /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])|\b(?:rgba?|hsla?|oklch)\((?!\s*var\()/i;
const CSS_NAMED_COLORS = new Set(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
  blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
  crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
  darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
  dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
  gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
  lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
  magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
  mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
  seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
  steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/));
const COLOR_DECLARATION = /\b(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|inline|block))?(?:-color)?|outline(?:-color)?|text-decoration-color|fill|stroke|caret-color|accent-color|box-shadow|text-shadow)\s*:\s*([^;"'}`]+)/gi;
const QUOTED_COLOR_DECLARATION = /\b(?:color|backgroundColor|borderColor|outlineColor|fill|stroke)\s*:\s*(["'])([^"']*)\1/gi;
const PRESENTATION_ATTRIBUTE = /\b(?:color|fill|stroke)\s*=\s*(["'])([^"']*)\1/gi;

const errors = [];
const targetColors = new Set();
const targetTypeRoles = new Set(CONTRACT_TYPE_ROLES);
const targetLineHeights = new Set();

function tokenBound(value) {
  if (typeof value !== 'string' || !/\bvar\(\s*--[a-zA-Z0-9_-]+/.test(value)) return false;
  if (HAS_RAW_COLOR.test(value) || namedColorsInValue(value).length) return false;

  for (const match of value.matchAll(/\bvar\(/gi)) {
    const close = matchingParen(value, match.index + match[0].length - 1);
    if (close === -1) return false;
    const fallback = topLevelFallback(value.slice(match.index + match[0].length, close));
    if (fallback !== null && !tokenBound(fallback)) return false;
  }
  return true;
}

function mergeConfig(base, extension) {
  if (extension === undefined) return base;
  if (!base || typeof base !== 'object' || !extension || typeof extension !== 'object')
    return extension;
  const merged = { ...base };
  for (const [key, value] of Object.entries(extension))
    merged[key] = mergeConfig(base[key], value);
  return merged;
}

function collectColorBindings(value, path = []) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const next = key === 'DEFAULT' ? path : [...path, key];
    if (tokenBound(child) && next.length) targetColors.add(next.join('-'));
    else collectColorBindings(child, next);
  }
}

function collectTypeRoles(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) targetTypeRoles.add(key);
}

function collectLineHeights(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) targetLineHeights.add(key);
}

async function loadTargetContract() {
  const configName = ['tailwind.config.mjs', 'tailwind.config.js', 'tailwind.config.cjs']
    .find((name) => existsSync(resolve(name)));
  if (!configName) return;

  try {
    const loaded = await import(pathToFileURL(resolve(configName)).href);
    const config = loaded.default ?? loaded;
    collectColorBindings(mergeConfig(config?.theme?.colors ?? {}, config?.theme?.extend?.colors));
    collectTypeRoles(config?.theme?.fontSize);
    collectTypeRoles(config?.theme?.extend?.fontSize);
    collectLineHeights(config?.theme?.lineHeight);
    collectLineHeights(config?.theme?.extend?.lineHeight);
  } catch (error) {
    errors.push({
      file: configName,
      line: 1,
      rule: 'lofi/config-load',
      value: error instanceof Error ? error.message : String(error),
    });
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(astro|css|html|js|ts|tsx|jsx)$/.test(entry)) check(full);
  }
}

function matchingParen(value, open) {
  let depth = 0;
  for (let index = open; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')' && --depth === 0) return index;
  }
  return -1;
}

function topLevelFallback(value) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') depth -= 1;
    else if (value[index] === ',' && depth === 0) return value.slice(index + 1).trim();
  }
  return null;
}

function maskUrlContents(line) {
  const masked = [...line];
  for (const match of line.matchAll(/\burl\s*\(/gi)) {
    const open = match.index + match[0].lastIndexOf('(');
    let depth = 1;
    let quote = null;
    let index = open + 1;
    for (; index < line.length && depth > 0; index += 1) {
      const character = line[index];
      if (character === '\\') {
        masked[index] = ' ';
        if (index + 1 < line.length) masked[index += 1] = ' ';
      } else if (quote) {
        masked[index] = ' ';
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
        masked[index] = ' ';
      } else if (character === '(') {
        depth += 1;
        masked[index] = ' ';
      } else if (character === ')') {
        depth -= 1;
      } else {
        masked[index] = ' ';
      }
    }
  }
  return masked.join('');
}

function namedColorsInValue(value) {
  const colors = [];
  for (const match of value.matchAll(/-?[_a-zA-Z][-_a-zA-Z0-9]*/g)) {
    const identifier = match[0];
    const after = value.slice(match.index + identifier.length).match(/^\s*/)[0].length;
    if (value[match.index + identifier.length + after] === '(') continue;
    if (CSS_NAMED_COLORS.has(identifier.toLowerCase()))
      colors.push({ value: identifier, index: match.index });
  }
  return colors;
}

function recordNamedColors(file, content) {
  const masked = maskUrlContents(content);
  const patterns = [
    { regex: COLOR_DECLARATION, group: 1 },
    { regex: QUOTED_COLOR_DECLARATION, group: 2 },
    { regex: PRESENTATION_ATTRIBUTE, group: 2 },
  ];
  for (const { regex, group } of patterns) {
    for (const match of masked.matchAll(regex)) {
      const value = match[group];
      const valueStart = match.index + match[0].lastIndexOf(value);
      for (const color of namedColorsInValue(value)) {
        const line = content.slice(0, valueStart + color.index).split('\n').length;
        errors.push({ file, line, rule: 'lofi/no-named-color', value: color.value });
      }
    }
  }
}

function stripVariants(candidate) {
  let depth = 0;
  let split = -1;
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] === '[') depth += 1;
    else if (candidate[index] === ']') depth = Math.max(0, depth - 1);
    else if (candidate[index] === ':' && depth === 0) split = index;
  }
  return candidate.slice(split + 1).replace(/^!/, '').replace(/^-/, '');
}

function splitColorUtility(utility) {
  let match = utility.match(/^(ring-offset)-(.+)$/);
  if (match) return { prefix: match[1], value: match[2] };

  match = utility.match(/^(border-(?:t|r|b|l|x|y|s|e))-(.+)$/);
  if (match) return { prefix: match[1], value: match[2] };

  match = utility.match(/^(divide-(?:x|y))-(.+)$/);
  if (match) return { prefix: match[1], value: match[2] };

  match = utility.match(/^(bg|text|border|ring|outline|divide|placeholder|caret|accent|fill|stroke|from|via|to|decoration|shadow)-(.+)$/);
  return match ? { prefix: match[1], value: match[2] } : null;
}

function isNonColorUtility(prefix, value) {
  if (/^(?:bg|text|border|ring|divide|placeholder)$/.test(prefix)
      && /^opacity-(?:\d{1,3}|\[(?:\d*\.)?\d+\])$/.test(value)) return true;
  if (prefix === 'text') {
    const [role, leading, extra] = value.split('/');
    const typeRole = BUILTIN_TYPE_ROLES.has(role) || targetTypeRoles.has(role);
    const lineHeight = leading === undefined || BUILTIN_LINE_HEIGHTS.has(leading)
      || targetLineHeights.has(leading) || /^\d+$|^\[.+\]$/.test(leading);
    return (!extra && typeRole && lineHeight) || TEXT_BEHAVIORS.has(value);
  }
  if (prefix === 'bg')
    return /^(?:none|auto|cover|contain|fixed|local|scroll|clip-(?:border|padding|content|text)|origin-(?:border|padding|content)|(?:bottom|center|left(?:-bottom|-top)?|right(?:-bottom|-top)?|top)|(?:no-)?repeat|repeat-(?:x|y|round|space)|gradient-to-(?:t|tr|r|br|b|bl|l|tl))$/.test(value);
  if (prefix === 'border')
    return /^(?:[trblxyse]|0|2|4|8|none|solid|dashed|dotted|double|hidden|collapse|separate|spacing(?:-[xy])?(?:-.+)?)$/.test(value);
  if (/^border-[trblxyse]$/.test(prefix))
    return /^(?:0|2|4|8|none|solid|dashed|dotted|double|hidden)$/.test(value);
  if (prefix === 'ring') return /^(?:0|1|2|4|8|inset)$/.test(value);
  if (prefix === 'ring-offset') return /^(?:0|1|2|4|8)$/.test(value);
  if (prefix === 'outline') return /^(?:0|1|2|4|8|none|dashed|dotted|double|solid|offset-.+)$/.test(value);
  if (prefix === 'divide') return /^(?:x|y|x-reverse|y-reverse|solid|dashed|dotted|double|none)$/.test(value);
  if (/^divide-[xy]$/.test(prefix)) return /^(?:0|2|4|8|reverse)$/.test(value);
  if (prefix === 'fill') return value === 'none';
  if (prefix === 'stroke') return /^(?:0|1|2|none)$/.test(value);
  if (prefix === 'decoration') return /^(?:auto|from-font|0|1|2|4|8|solid|double|dotted|dashed|wavy)$/.test(value);
  if (prefix === 'shadow') return /^(?:sm|md|lg|xl|2xl|inner|none)$/.test(value);
  if (/^(?:from|via|to)$/.test(prefix)) return /^(?:\d{1,3}%?)$/.test(value);
  return false;
}

function arbitraryIsAllowed(prefix, value) {
  if (!(value.startsWith('[') && value.endsWith(']'))) return false;
  const inner = value.slice(1, -1);

  // Color values must be routed through a custom property. Ambiguous utility
  // families may also carry explicitly typed non-color arbitrary values.
  if (/^(?:color:)?(?:var\(\s*--[\w-]+\)|(?:oklch|rgba?|hsla?)\(\s*var\(\s*--[\w-]+\)[^)]*\))$/.test(inner)) return true;
  if (prefix === 'text' && /^(?:length:)?(?:-?(?:\d*\.)?\d+(?:px|rem|em|ch|vw|vh)|var\(\s*--[\w-]+\))$/.test(inner)) return true;
  if (/^(?:border(?:-[trblxyse])?|ring|ring-offset|outline)$/.test(prefix)
      && /^(?:length:)?(?:-?(?:\d*\.)?\d+(?:px|rem|em)|var\(\s*--[\w-]+\))$/.test(inner)) return true;
  if (/^(?:from|via|to)$/.test(prefix) && /^(?:position:)?(?:\d{1,3}%|var\(\s*--[\w-]+\))$/.test(inner)) return true;
  return false;
}

function checkUtility(file, line, candidate) {
  const utility = stripVariants(candidate);
  const parsed = splitColorUtility(utility);
  if (!parsed) return;

  const value = parsed.value.replace(/\/(?:\d{1,3}|\[[^\]]+\])$/, '');
  if (BASELINE_COLORS.has(value) || targetColors.has(value)) return;
  if (isNonColorUtility(parsed.prefix, value)) return;
  if (arbitraryIsAllowed(parsed.prefix, value)) return;

  errors.push({ file, line, rule: 'lofi/no-color-utility', value: candidate });
}

function check(file) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const inStyles = /[\\/]src[\\/]styles[\\/]/.test(file) || file.includes('src/styles/');
  recordNamedColors(file, content);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (!inStyles) {
      for (const match of line.matchAll(RAW_COLOR))
        errors.push({ file, line: lineNumber, rule: 'lofi/no-raw-color', value: match[0] });
    }
    for (const match of line.matchAll(/[^\s"'`=<>]+/g)) {
      const candidate = match[0].replace(/^[({,]+/, '').replace(/[;,}]+$/, '');
      checkUtility(file, lineNumber, candidate);
    }
  });
}

await loadTargetContract();
if (existsSync('./src')) walk('./src');

if (errors.length) {
  console.error('lofi-lint: color leakage detected. Lo-fi must remain greyscale.');
  for (const error of errors)
    console.error(`  ${error.file}:${error.line}  ${error.rule}  ${error.value}`);
  process.exit(1);
} else {
  console.log('lofi-lint: clean — greyscale and token-bound colors only.');
}
