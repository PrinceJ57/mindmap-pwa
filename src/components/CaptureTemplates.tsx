import type { RefObject } from 'react'

export const CAPTURE_TEMPLATES = [
  { label: 'Task', token: 'type:task !active ' },
  { label: 'Idea', token: 'type:idea ' },
  { label: 'Note', token: 'type:idea ' },
  { label: 'Waiting', token: '!waiting ' },
  { label: 'Someday', token: '!someday ' },
] as const

type CaptureTemplatesProps = {
  onApply: (token: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}

export default function CaptureTemplates({ onApply, inputRef }: CaptureTemplatesProps) {
  return (
    <div className="captureTemplates">
      {CAPTURE_TEMPLATES.map(template => (
        <button
          key={template.label}
          type="button"
          className="button button--ghost"
          onClick={() => {
            onApply(template.token)
            inputRef.current?.focus()
          }}
        >
          {template.label}
        </button>
      ))}
    </div>
  )
}
