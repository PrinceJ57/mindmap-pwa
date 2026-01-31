import TagChips from './TagChips'

type ParsedInput = {
  title: string
  type?: string
  status?: string
  context?: string
  due_at?: string
  tags: string[]
}

type LinkInfo = {
  url: string
  hostname: string
  domainTag: string
  suggestedTitle: string
}

type ValidationResult = {
  errors: string[]
  warnings: string[]
}

type CapturePreviewProps = {
  parsed: ParsedInput
  body: string
  linkInfo: LinkInfo | null
  suggestedTags: string[]
  validation: ValidationResult
  onApplySuggestedTags: () => void
  onApplySuggestedTitle: () => void
}

export default function CapturePreview({
  parsed,
  body,
  linkInfo,
  suggestedTags,
  validation,
  onApplySuggestedTags,
  onApplySuggestedTitle,
}: CapturePreviewProps) {
  return (
    <div className="capturePreview">
      <div className="row row--wrap">
        <span className="chip chip--compact">{parsed.type ?? 'idea'}</span>
        <span className="chip chip--compact">{parsed.status ?? 'inbox'}</span>
        {parsed.context && <span className="chip chip--compact">@{parsed.context}</span>}
        {parsed.due_at && <span className="chip chip--compact">due {parsed.due_at}</span>}
        {linkInfo && <span className="chip chip--compact">link detected</span>}
      </div>
      <div style={{ fontWeight: 600 }}>
        {parsed.title.trim() ? parsed.title.trim() : <span className="muted">Title required…</span>}
      </div>
      {parsed.tags.length > 0 && <TagChips tags={parsed.tags} compact />}
      {linkInfo && (
        <div className="row row--wrap" style={{ fontSize: 12 }}>
          <span className="muted">{linkInfo.hostname}</span>
          {suggestedTags.length > 0 && (
            <button type="button" onClick={onApplySuggestedTags} className="chip chip--compact chip--clickable">
              Add #{suggestedTags.join(' #')}
            </button>
          )}
          {!parsed.title.trim() && (
            <button type="button" onClick={onApplySuggestedTitle} className="chip chip--compact chip--clickable">
              Use suggested title
            </button>
          )}
        </div>
      )}
      {body && (
        <div className="muted" style={{ fontSize: 12 }}>
          Notes: {body.slice(0, 120)}{body.length > 120 ? '…' : ''}
        </div>
      )}
      {validation.errors.length > 0 && (
        <div className="captureErrors" role="alert">
          <strong>Errors</strong>
          {validation.errors.map(message => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="captureWarnings" role="status" aria-live="polite">
          <strong>Warnings</strong>
          {validation.warnings.map(message => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}
    </div>
  )
}
