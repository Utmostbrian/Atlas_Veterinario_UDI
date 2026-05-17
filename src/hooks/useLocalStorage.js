import { useState, useCallback, useEffect, useRef } from 'react'

export function useLocalStorage(key, initialValue) {
  // M-03: leer del nuevo key cuando cambie, no quedarse con el inicial.
  const read = useCallback(() => {
    try {
      const item = localStorage.getItem(key)
      return item !== null ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  }, [key, initialValue])

  const [storedValue, setStoredValue] = useState(read)

  // Re-hidrata cuando key cambia (ej. rotación de cuenta en la misma pestaña).
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key
      setStoredValue(read())
    }
  }, [key, read])

  const setValue = useCallback(
    (value) => {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value
        try {
          localStorage.setItem(key, JSON.stringify(valueToStore))
        } catch (error) {
          // M-04: cuota llena, modo privado en Safari, etc. — no romper la app.
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
