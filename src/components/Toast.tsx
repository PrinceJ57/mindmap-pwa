import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react'

type ToastType = 'success' | 'warning' | 'error'

type ToastMessage = {
  id: number
  type: ToastType
  text: string
}

type ToastContextValue = {
  showToast: (type: ToastType, text: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastId = 0

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback((type: ToastType, text: string) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, type, text }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastMessage[]
  onRemove: (id: number) => void
}) {
  return (
    <>
      {toasts.map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={onRemove}
          offset={index * 56}
        />
      ))}
    </>
  )
}

function ToastItem({
  toast,
  onRemove,
  offset,
}: {
  toast: ToastMessage
  onRemove: (id: number) => void
  offset: number
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
    }, 3500)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        onRemove(toast.id)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [visible, toast.id, onRemove])

  return (
    <div
      className={`toast toast--${toast.type}`}
      style={{
        bottom: `calc(${24 + offset}px + var(--safe-bottom))`,
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}
      role="status"
      aria-live="polite"
    >
      {toast.text}
    </div>
  )
}
