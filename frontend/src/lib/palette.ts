import { useAppState } from '../state/AppState'

// Validated categorical palette (see dataviz skill references/palette.md).
// Fixed hue order — never cycled arbitrarily; slot N always maps to series N.
const CATEGORICAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

const CHART_INK_LIGHT = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
}

const CHART_INK_DARK = {
  primary: '#ffffff',
  secondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
}

const SEQUENTIAL_BLUE_LIGHT = '#2a78d6'
const SEQUENTIAL_BLUE_DARK = '#3987e5'

export const STATUS = {
  good: '#0ca30c',
  critical: '#d03b3b',
}

export function useChartPalette() {
  const { theme } = useAppState()
  const dark = theme === 'dark'
  return {
    categorical: dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT,
    ink: dark ? CHART_INK_DARK : CHART_INK_LIGHT,
    sequentialBlue: dark ? SEQUENTIAL_BLUE_DARK : SEQUENTIAL_BLUE_LIGHT,
  }
}
