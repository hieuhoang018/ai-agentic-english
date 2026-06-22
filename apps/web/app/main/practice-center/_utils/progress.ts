export function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value))
}

export function progressLabel(value: number) {
  return `${clampProgress(value)}%`
}
