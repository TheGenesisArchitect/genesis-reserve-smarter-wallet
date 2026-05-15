'use client'

import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'genesis_codex_progress_v1'

export function useCodexProgress() {
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set())
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored) as { readKeys: string[] }
        setReadKeys(new Set(data.readKeys))
      }
    } catch { /* ignore parse errors */ }
    setHydrated(true)
  }, [])

  const markRead = useCallback((key: string) => {
    setReadKeys(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ readKeys: [...next] }))
      } catch { /* ignore quota errors */ }
      return next
    })
  }, [])

  const isRead = useCallback((key: string) => readKeys.has(key), [readKeys])

  return { isRead, markRead, readKeys, hydrated }
}
