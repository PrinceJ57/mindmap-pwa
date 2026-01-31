export default function LoadingSpinner({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
      {text}
    </div>
  )
}
