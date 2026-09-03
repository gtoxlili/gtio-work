import { footer, ledger, worksCopy } from '../content/copy'
import { shelf } from '../content/works'
import { useT } from '../lang'

/** Everything after the last chapter: plain flow, the canvas fades behind it. */
export function After() {
  const t = useT()
  return (
    <div className="after">
      <section className="ledger" aria-labelledby="ledger-h">
        <h2 id="ledger-h" className="h2">
          {t(ledger.title)}
        </h2>
        <dl className="ledger-rows">
          {ledger.rows.map((r, i) => (
            <div className="ledger-row" key={i}>
              <dt>{t(r.label)}</dt>
              <dd>{typeof r.value === 'string' ? r.value : t(r.value)}</dd>
            </div>
          ))}
        </dl>
        <p className="note">{t(ledger.note)}</p>
      </section>

      <section className="shelf" aria-labelledby="shelf-h">
        <h2 id="shelf-h" className="h2">
          {t(worksCopy.shelfTitle)}
        </h2>
        <ul className="shelf-list">
          {shelf.map(s => (
            <li key={s.name}>
              <a href={s.href} target="_blank" rel="noopener">
                {s.name}
              </a>
              <span>{t(s.note)}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="foot">
        <p>
          <span className="mark">
            gtio<span>.work</span>
          </span>{' '}
          <span className="foot-rev">{footer.date}</span>
        </p>
        <p className="foot-colophon">{t(footer.colophon)}</p>
        <p className="foot-nogpu">{t(footer.noGpu)}</p>
        <p className="foot-privacy">{t(footer.privacy)}</p>
      </footer>
    </div>
  )
}
