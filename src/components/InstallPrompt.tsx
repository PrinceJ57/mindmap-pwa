type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallPromptProps = {
  installPrompt: BeforeInstallPromptEvent | null
  isIos: boolean
  onInstalled: () => void
  onDismiss: () => void
}

export default function InstallPrompt({
  installPrompt,
  isIos,
  onInstalled,
  onDismiss,
}: InstallPromptProps) {
  return (
    <div className="card installHint">
      <div className="stack-sm">
        <strong>Install Mindmap</strong>
        {installPrompt && (
          <span className="muted" style={{ fontSize: 12 }}>
            Install this app for a fast, standalone experience.
          </span>
        )}
        {installPrompt && (
          <div className="row row--wrap">
            <button
              type="button"
              onClick={async () => {
                await installPrompt.prompt()
                const choice = await installPrompt.userChoice
                if (choice.outcome === 'accepted') {
                  onInstalled()
                }
              }}
              className="button button--primary"
            >
              Install
            </button>
            <button type="button" onClick={onDismiss} className="button button--ghost">
              Not now
            </button>
          </div>
        )}
        {!installPrompt && isIos && (
          <div className="stack-sm">
            <span className="muted" style={{ fontSize: 12 }}>
              On iOS: tap Share, then "Add to Home Screen".
            </span>
            <button type="button" onClick={onDismiss} className="button button--ghost">
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export type { BeforeInstallPromptEvent }
