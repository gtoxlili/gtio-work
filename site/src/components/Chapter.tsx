import type { Chapter as ChapterT } from '../chapters'
import { dayJob, hero, nav, operator, site, worksCopy } from '../content/copy'
import { districts } from '../content/works'
import { useLang, useT } from '../lang'

export function Chapter({ chapter, index, count }: { chapter: ChapterT; index: number; count: number }) {
  return (
    <section className={`chapter chapter-${chapter.kind}`} data-chapter={index} id={`c-${chapter.slug}`}>
      <div className="panel">
        {chapter.kind === 'hero' && <HeroPanel />}
        {chapter.kind === 'work' && <WorkPanel chapter={chapter} index={index} count={count} />}
        {chapter.kind === 'day' && <DayPanel />}
        {chapter.kind === 'operator' && <OperatorPanel />}
      </div>
    </section>
  )
}

function HeroPanel() {
  const t = useT()
  const { lang } = useLang()
  return (
    <div className="hero">
      <p className="epigraph">
        <span>{t(hero.epigraph)}</span> <small>{t(hero.epigraphBy)}</small>
      </p>
      <h1 className={`display display-${lang}`}>
        {t(hero.title).map((line, i) => (
          <span className="line" key={i}>
            {line}
          </span>
        ))}
      </h1>
      <p className="lede">{t(hero.lede)}</p>
      <p className="meta">{t(hero.meta)}</p>
      <a className="scroll-cue" href="#c-jianghu">
        {t(nav.scroll)}
      </a>
    </div>
  )
}

function WorkPanel({
  chapter,
  index,
  count,
}: {
  chapter: Extract<ChapterT, { kind: 'work' }>
  index: number
  count: number
}) {
  const t = useT()
  const { lang } = useLang()
  const w = chapter.work
  const d = districts.find(x => x.id === w.district)!
  const other = lang === 'zh' ? 'en' : 'zh'
  const alt = w.name[other] !== w.name[lang] ? w.name[other] : null
  const hostOf = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <article className="work">
      <p className="kicker">
        <span className="kicker-district">{t(d.label)}</span>
        <span className="kicker-i">
          {String(index + 1).padStart(2, '0')}/{String(count).padStart(2, '0')}
        </span>
      </p>
      <h2 className="work-name">
        {t(w.name)}
        {alt && <span className="work-alt">{alt}</span>}
      </h2>
      <p className="work-tagline">{t(w.tagline)}</p>
      <p className="work-detail">{t(w.detail)}</p>
      <p className="work-stack">
        <span className="work-stack-label">{t(worksCopy.builtWith)}</span> {w.stack.join(', ')}
        {w.stars ? ` · ${w.stars.toLocaleString('en-US')} ${t(worksCopy.stars)}` : ''}
        {w.year < 2026 ? ` · ${w.year}` : ''}
      </p>
      <p className="work-links">
        {w.live && (
          <a href={w.live} target="_blank" rel="noopener">
            {hostOf(w.live)}
          </a>
        )}
        {w.source && (
          <a href={w.source} target="_blank" rel="noopener">
            {t(worksCopy.source)}
          </a>
        )}
      </p>
    </article>
  )
}

function DayPanel() {
  const t = useT()
  return (
    <article className="day">
      <p className="kicker">
        <span className="kicker-district">{t(dayJob.title)}</span>
      </p>
      <h2 className="work-name">{t(dayJob.lead)}</h2>
      <p className="work-detail">{t(dayJob.body)}</p>
      <dl className="floors">
        {dayJob.floors.map((f, i) => (
          <div className="floor" key={i}>
            <dt>{t(f.name)}</dt>
            <dd>{t(f.items)}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

function OperatorPanel() {
  const t = useT()
  const write = () => {
    window.location.href = `mailto:${atob('Z3RveGxpbGlAb3V0bG9vay5jb20=')}`
  }
  return (
    <article className="operator">
      <p className="kicker">
        <span className="kicker-district">{t(operator.title)}</span>
      </p>
      {t(operator.body).map((p, i) => (
        <p className={i === 0 ? 'work-tagline' : 'work-detail'} key={i}>
          {p}
        </p>
      ))}
      <p className="work-links">
        <button type="button" className="linkish" onClick={write}>
          {t(operator.write)}
        </button>
        <a href={site.github} target="_blank" rel="noopener">
          {t(operator.github)}
        </a>
      </p>
    </article>
  )
}
