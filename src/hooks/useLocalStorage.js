import { useState, useCallback } from 'react'

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item !== null ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback(
    (value) => {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value
        try {
          localStorage.setItem(key, JSON.stringify(valueToStore))
        } catch (error) {
          console.warn(`useLocalStorage: error saving "${key}"`, error)
        }
        return valueToStore
      })
    },
    [key]
  )

  const removeValue = useCallback(() => {
    try {
      localStorage.removeItem(key)
      setStoredValue(initialValue)
    } catch (error) {
      console.warn(`useLocalStorage: error removing "${key}"`, error)
    }
  }, [key, initialValue])

  return [storedValue, setValue, removeValue]
}
