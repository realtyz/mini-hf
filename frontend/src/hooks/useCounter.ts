import { useEffect, useState, useRef } from 'react';

interface UseCounterOptions {
  start?: number;
  end: number;
  duration?: number;
  delay?: number;
  suffix?: string;
  enabled?: boolean;
}

export function useCounter({
  start = 0,
  end,
  duration = 2000,
  delay = 0,
  suffix = '',
  enabled = true,
}: UseCounterOptions): string {
  const [count, setCount] = useState(start);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!enabled || hasStarted.current) return;

    hasStarted.current = true;

    const timeout = setTimeout(() => {
      const startTime = performance.now();
      const difference = end - start;

      const easeOutQuart = (t: number): number => {
        return 1 - Math.pow(1 - t, 4);
      };

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutQuart(progress);
        const currentCount = Math.floor(start + difference * easedProgress);

        setCount(currentCount);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setCount(end);
        }
      };

      requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeout);
    };
  }, [enabled, start, end, duration, delay]);

  return `${count}${suffix}`;
}

export function parseMetricValue(value: string): { num: number; suffix: string } {
  const match = value.match(/^([\d.]+)(.*)$/);
  if (match) {
    return { num: parseFloat(match[1]), suffix: match[2] || '' };
  }
  return { num: 0, suffix: value };
}
