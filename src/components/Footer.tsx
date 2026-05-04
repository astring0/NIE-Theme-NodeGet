import { useEffect, useState } from 'react'

const NODEGET_REPO = 'https://github.com/NodeSeekDev/NodeGet-StatusShow'
const NIE_REPO = 'https://github.com/3257085208/NodeGet-StatusShow'
const PKG_URL = 'https://raw.githubusercontent.com/NodeSeekDev/NodeGet-StatusShow/main/package.json'

export function Footer({ text }: { text?: string }) {
  const [latest, setLatest] = useState<string | null>(null)

  useEffect(() => {
    fetch(PKG_URL)
      .then(r => (r.ok ? r.json() : null))
      .then(j => j?.version && setLatest(String(j.version)))
      .catch(() => {})
  }, [])

  const outdated = latest != null && latest !== __APP_VERSION__
  const normalizedText = text?.trim()
  const useDefaultCredit = !normalizedText || normalizedText === 'Powered by NodeGet' || normalizedText === 'Powered by NodeGet & NIE'

  return (
    <footer className="border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-end gap-4 text-xs text-muted-foreground">
        {useDefaultCredit ? (
          <span>
            Powered by{' '}
            <a href={NODEGET_REPO} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
              NodeGet
            </a>{' '}
            &{' '}
            <a href={NIE_REPO} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
              NIE
            </a>
          </span>
        ) : (
          <span>{normalizedText}</span>
        )}
        <span>
          v{__APP_VERSION__}
          {outdated && (
            <a href={`${NODEGET_REPO}/releases`} target="_blank" rel="noreferrer" className="ml-1 text-destructive">
              (Need Update)
            </a>
          )}
        </span>
      </div>
    </footer>
  )
}
