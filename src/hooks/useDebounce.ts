import { useEffect, useState } from 'react'

/**
 * Debounce a value by the specified delay in milliseconds.
 * The debounced value only updates after the specified delay
 * has passed without the input value changing.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
