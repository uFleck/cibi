import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Parses the Ink tokens out of index.css and checks WCAG contrast for the pairs the UI uses.
// Light tokens live in :root, dark overrides in .dark (both on <html>), and the Tailwind names
// map onto them through @theme / @theme inline.

type Theme = 'light' | 'dark'
type Rgba = { r: number; g: number; b: number; a: number }

const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

function declarations(selector: RegExp): Map<string, string> {
  const map = new Map<string, string>()
  const match = selector.exec(css)
  if (!match) throw new Error(`Block not found: ${selector}`)
  for (const decl of match[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(decl[1], decl[2].trim())
  }
  return map
}

const themeTokens = declarations(/@theme\s*\{([^}]*)\}/)
const inlineTokens = declarations(/@theme inline\s*\{([^}]*)\}/)
const rootTokens = declarations(/:root\s*\{([^}]*)\}/)
const darkTokens = declarations(/\.dark\s*\{([^}]*)\}/)

function tokensFor(theme: Theme): Map<string, string> {
  return new Map([
    ...themeTokens,
    ...inlineTokens,
    ...rootTokens,
    ...(theme === 'dark' ? darkTokens : []),
  ])
}

function evaluate(value: string, tokens: Map<string, string>, depth = 0): string {
  if (depth > 10) throw new Error(`Token cycle near ${value}`)
  return value
    .replace(/var\(--([\w-]+)\)/g, (_, name: string) => {
      const raw = tokens.get(name)
      if (raw === undefined) throw new Error(`Unknown token --${name}`)
      return evaluate(raw, tokens, depth + 1)
    })
    .replace(/calc\(\s*(-?[\d.]+)\s*\*\s*(-?[\d.]+)\s*\)/g, (_, a: string, b: string) =>
      String(Number(a) * Number(b)),
    )
}

function encode(linear: number): number {
  const c = Math.min(1, Math.max(0, linear))
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 }
  }
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/.exec(value)
  if (!ok) throw new Error(`Unsupported color: ${value}`)
  const L = Number(ok[1])
  const C = Number(ok[2])
  const h = (Number(ok[3]) * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: ok[4] === undefined ? 1 : Number(ok[4]),
  }
}

function luminance(c: Rgba): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

function contrast(fg: Rgba, bg: Rgba): number {
  const opaque = mix(fg, bg, fg.a)
  const [hi, lo] = [luminance(opaque), luminance(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** fg drawn at `alpha` over bg (sRGB space, like the browser). */
function mix(fg: Rgba, bg: Rgba, alpha: number): Rgba {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  }
}

type Check = { label: string; ratio: number; min: number }

const TEXT = 4.5
const UI = 3

function checksFor(theme: Theme): Check[] {
  const tokens = tokensFor(theme)
  const color = (name: string): Rgba => parseColor(evaluate(tokens.get(`color-${name}`) ?? '', tokens))
  const check = (label: string, fg: string, bg: string, min: number): Check => ({
    label: `${label}: ${fg} on ${bg}`,
    ratio: contrast(color(fg), color(bg)),
    min,
  })

  const checks: Check[] = []
  const surfaces = ['background', 'surface', 'surface-2', 'surface-3']
  for (const fg of ['foreground', 'muted-foreground', 'faint']) {
    for (const bg of surfaces) checks.push(check('text', fg, bg, TEXT))
  }
  for (const fg of ['pos', 'neg', 'hl', 'warn', 'destructive']) {
    for (const bg of ['background', 'surface', 'surface-2']) checks.push(check('status text', fg, bg, TEXT))
  }
  checks.push(
    check('button', 'primary-foreground', 'primary', TEXT),
    check('button', 'destructive-foreground', 'destructive', TEXT),
    check('button', 'secondary-foreground', 'secondary', TEXT),
    check('button', 'accent-foreground', 'accent', TEXT),
  )
  for (const bg of ['background', 'surface']) {
    checks.push(check('input border', 'input', bg, UI), check('focus ring', 'ring', bg, UI))
  }

  // Check widget verdict card: tint fills the card; bg/60 boxes sit on top of it.
  const verdicts = ['yes', 'no', 'wait'] as const
  const risks = ['low', 'medium', 'high', 'blocked'] as const
  for (const v of verdicts) {
    const tint = `verdict-${v}-tint`
    checks.push(check('verdict', `verdict-${v}`, tint, TEXT))
    for (const r of risks) checks.push(check('risk badge', `risk-${r}`, tint, TEXT))
    for (const fg of ['foreground', 'muted-foreground']) checks.push(check('card text', fg, tint, TEXT))
    const boxed = mix(color('background'), color(tint), 0.6)
    checks.push({
      label: `card box text: muted-foreground on background/60 over ${tint}`,
      ratio: contrast(color('muted-foreground'), boxed),
      min: TEXT,
    })
  }
  const waitBox = mix(color('background'), color('verdict-wait-tint'), 0.6)
  checks.push({
    label: 'wait box text: foreground/80 on background/60 over verdict-wait-tint',
    ratio: contrast({ ...color('foreground'), a: 0.8 }, waitBox),
    min: TEXT,
  })
  return checks
}

describe('Ink contrast (WCAG AA)', () => {
  const rows = (['light', 'dark'] as const).flatMap((theme) =>
    checksFor(theme).map((c) => [
      `${theme} ${c.ratio.toFixed(2)}:1 (min ${c.min}) ${c.label}`,
      c,
    ] as const),
  )

  it.each(rows)('%s', (_name, c) => {
    expect(c.ratio).toBeGreaterThanOrEqual(c.min)
  })
})
