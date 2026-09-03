import { renderToString } from 'react-dom/server'
import { App } from './App'
import { site } from './content/copy'
import type { Lang } from './lang'

export function render(lang: Lang) {
  return renderToString(<App initialLang={lang} />)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export function head(lang: Lang) {
  const title = site.title[lang]
  const desc = site.description[lang]
  const locale = lang === 'zh' ? 'zh_CN' : 'en_US'
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${site.url}" />`,
    `<link rel="alternate" hreflang="en" href="${site.url}en/" />`,
    `<link rel="alternate" hreflang="zh-CN" href="${site.url}zh/" />`,
    `<link rel="alternate" hreflang="x-default" href="${site.url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${site.url}" />`,
    `<meta property="og:image" content="${site.url}img/og.jpg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${locale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<link rel="preload" as="fetch" href="/gpu/city.webp" crossorigin="anonymous" fetchpriority="high" />`,
  ].join('\n    ')
}
