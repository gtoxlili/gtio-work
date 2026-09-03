import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { chapters } from '../chapters'
import { nav, site } from '../content/copy'
import { type Lang, useLang, useT } from '../lang'

export function Header() {
  const { lang, setLang } = useLang()
  const t = useT()
  return (
    <header className="top">
      <a className="mark" href="/">
        gtio<span>.work</span>
      </a>
      <span className="counter" id="chapter-counter" aria-live="off">
        01 / {String(chapters.length).padStart(2, '0')}
      </span>
      <nav className="top-nav">
        <ToggleGroup
          className="lang"
          aria-label={t(nav.langLabel)}
          value={[lang]}
          onValueChange={v => {
            const next = v[0] as Lang | undefined
            if (next && next !== lang) setLang(next)
          }}
        >
          <Toggle value="zh" className="lang-btn" aria-label="中文">
            中
          </Toggle>
          <Toggle value="en" className="lang-btn" aria-label="English">
            EN
          </Toggle>
        </ToggleGroup>
        <a className="top-link" href={site.github} target="_blank" rel="noopener">
          {nav.github}
        </a>
      </nav>
    </header>
  )
}

export function Rail() {
  const t = useT()
  return (
    <nav className="rail" aria-label={t({ en: 'Chapters', zh: '章节' })}>
      {chapters.map((c, i) => (
        <a
          key={c.slug}
          href={`#c-${c.slug}`}
          data-rail={i}
          data-active={i === 0 ? '' : undefined}
          title={c.kind === 'work' ? t(c.work.name) : c.slug}
        >
          <span />
        </a>
      ))}
    </nav>
  )
}
