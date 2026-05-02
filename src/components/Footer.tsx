const REPO = 'https://github.com/NodeSeekDev/NodeGet-StatusShow'

export function Footer({ text }: { text?: string }) {
  return (
    <footer className="border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-end text-xs text-muted-foreground">
        <a
          href={REPO}
          target="_blank"
          rel="noreferrer"
          className="hover:text-primary transition-colors"
        >
          {text || 'Powered by NodeGet'}
        </a>
      </div>
    </footer>
  )
}
