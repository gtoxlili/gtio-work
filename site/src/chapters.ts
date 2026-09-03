import { type Work, works } from './content/works'

export type Chapter =
  | { kind: 'hero'; slug: 'hero' }
  | { kind: 'work'; slug: string; work: Work; nth: number; total: number }
  | { kind: 'day'; slug: 'section' }
  | { kind: 'operator'; slug: 'figure' }

function buildChapters(): Chapter[] {
  const list: Chapter[] = [{ kind: 'hero', slug: 'hero' }]
  const counts: Record<string, number> = {}
  for (const w of works) counts[w.district] = (counts[w.district] ?? 0) + 1
  const seen: Record<string, number> = {}
  for (const w of works) {
    seen[w.district] = (seen[w.district] ?? 0) + 1
    list.push({ kind: 'work', slug: w.slug, work: w, nth: seen[w.district], total: counts[w.district] })
  }
  list.push({ kind: 'day', slug: 'section' })
  list.push({ kind: 'operator', slug: 'figure' })
  return list
}

export const chapters = buildChapters()
