import { createContext, useContext } from 'react'

export type Lang = 'en' | 'zh'
export type Bi<T = string> = { en: T; zh: T }

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'en',
  setLang: () => {},
})

export function useLang() {
  return useContext(LangContext)
}

/** Pick the current language's variant of a bilingual value. */
export function useT() {
  const { lang } = useLang()
  return <T,>(v: Bi<T>): T => v[lang]
}

export function langFromDocument(): Lang {
  if (typeof document === 'undefined') return 'en'
  return document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
