import { useState, useEffect } from 'react'

export function useElapsedTimer(running: boolean, startTime: number | null): number {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!running || !startTime) return

    setElapsed(Date.now() - startTime)
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTime)
    }, 1000)

    return () => clearInterval(timer)
  }, [running, startTime])

  return elapsed
}
