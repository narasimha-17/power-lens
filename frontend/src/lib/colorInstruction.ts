// "Change the color of this graph" is a pure styling request — it has no SQL/data
// meaning, so routing it through the LLM chat-modify pipeline can never do anything (the
// query and chart_spec it returns are identical). Detect and apply these client-side
// instead, matching the same names shown in the palette skill's categorical order.
const NAMED_COLORS: Record<string, string> = {
  blue: '#2a78d6',
  orange: '#eb6834',
  green: '#1baf7a',
  yellow: '#eda100',
  gold: '#eda100',
  pink: '#e87ba4',
  red: '#e34948',
  purple: '#4a3aa7',
  violet: '#4a3aa7',
  teal: '#0ca3a3',
  black: '#0b0b0b',
  gray: '#898781',
  grey: '#898781',
}

const ROTATION = Object.values(NAMED_COLORS).filter(
  (v, i, arr) => arr.indexOf(v) === i,
)

const COLOR_INTENT = /\b(colou?r|colou?red)\b/i

export function isColorInstruction(text: string): boolean {
  return COLOR_INTENT.test(text)
}

/** Returns the requested hex color, or the next rotation color if none was named. */
export function resolveColorInstruction(text: string, currentColor: string | undefined): string {
  const lower = text.toLowerCase()
  for (const [name, hex] of Object.entries(NAMED_COLORS)) {
    if (lower.includes(name)) return hex
  }
  // Index 0 (blue) is the chart's un-overridden default — starting the rotation there
  // would silently no-op on the very first "change the color" request, since nothing
  // visually differs from not having an override at all.
  const currentIndex = currentColor ? ROTATION.indexOf(currentColor) : 0
  return ROTATION[(currentIndex + 1) % ROTATION.length]
}
