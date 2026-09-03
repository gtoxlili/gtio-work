import { useCallback, useState } from 'react'
import '@fontsource-variable/archivo/wdth.css'
import './styles/global.css'
import { chapters } from './chapters'
import { After } from './components/After'
import { Chapter } from './components/Chapter'
import { Header, Rail } from './components/Header'
import { Stage } from './components/Stage'
import { type Lang, LangContext } from './lang'

export function App({ initialLang }: { initialLang: Lang }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
      // The one cookie on this site. nginx reads it to pick the prerendered
      // shell (deploy/www.conf); CookieStore would be async and isn't in Safari.
      // biome-ignore lint/suspicious/noDocumentCookie: deliberate, see above
      document.cookie = `lang=${next}; path=/; max-age=31536000; SameSite=Lax`
    }
  }, [])

  return (
    <LangContext value={{ lang, setLang }}>
      <Header />
      <Stage />
      <main>
        {chapters.map((c, i) => (
          <Chapter key={c.slug} chapter={c} index={i} count={chapters.length} />
        ))}
        <After />
      </main>
      <Rail />
    </LangContext>
  )
}
