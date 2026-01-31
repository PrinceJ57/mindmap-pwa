type EmptyStateProps = {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px 24px',
        gap: 12,
      }}
    >
      <p className="muted" style={{ fontSize: 14 }}>{title}</p>
      {description && (
        <p className="muted" style={{ fontSize: 12 }}>{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="button button--primary"
          style={{ marginTop: 8 }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
