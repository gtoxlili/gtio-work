import { hydrateRoot } from 'react-dom/client'
import { App } from './App'
import { langFromDocument } from './lang'

const root = document.getElementById('root')!
hydrateRoot(root, <App initialLang={langFromDocument()} />)

// If the entrance animation never runs (script error, slow device), don't leave things hidden.
window.setTimeout(() => document.documentElement.classList.add('anim-done'), 2800)

// view-source && console = best UX.
;(() => {
  if (!window.console?.log) return
  const note = [
    `thanks for popping the hood. build ${__APP_VERSION__}.`,
    '',
    'the city is one photograph displaced by its depth map, lit in a WebGPU',
    'shader; scrolling drives the camera over it.',
    '',
    'if something on a *.gtio.work subdomain is on fire, the operator',
    'answers slow but answers, at:',
    `  mailto:${atob('Z3RveGxpbGlAb3V0bG9vay5jb20=')}`,
  ].join('\n')
  console.log(`%c${note}`, 'color:#5C5A55;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.5')
})()
