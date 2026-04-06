/** Reusable animated tech-grid background with flowing light streaks */

interface StreakH {
  top: string;
  width: string;
  duration: string;
  delay: string;
}

interface StreakV {
  left: string;
  height: string;
  duration: string;
  delay: string;
}

const HERO_STREAKS_H: StreakH[] = [
  { top: "12%", width: "32%", duration: "7s", delay: "0s" },
  { top: "28%", width: "22%", duration: "11s", delay: "2.5s" },
  { top: "48%", width: "38%", duration: "6s", delay: "1s" },
  { top: "65%", width: "26%", duration: "9s", delay: "4s" },
  { top: "82%", width: "18%", duration: "13s", delay: "0.5s" },
];

const HERO_STREAKS_V: StreakV[] = [
  { left: "18%", height: "28%", duration: "9s", delay: "1s" },
  { left: "62%", height: "22%", duration: "7s", delay: "3.5s" },
  { left: "88%", height: "32%", duration: "11s", delay: "0s" },
];

const CTA_STREAKS_H: StreakH[] = [
  { top: "20%", width: "28%", duration: "8s", delay: "0s" },
  { top: "50%", width: "36%", duration: "6s", delay: "2s" },
  { top: "78%", width: "20%", duration: "10s", delay: "4s" },
];

const CTA_STREAKS_V: StreakV[] = [
  { left: "25%", height: "30%", duration: "8s", delay: "1.5s" },
  { left: "55%", height: "24%", duration: "6s", delay: "0s" },
  { left: "78%", height: "28%", duration: "10s", delay: "3s" },
  { left: "92%", height: "20%", duration: "7s", delay: "5s" },
];

function HStreak({ top, width, duration, delay }: StreakH) {
  return (
    <div
      className="absolute left-0 right-0 overflow-hidden pointer-events-none"
      style={{ top, height: "1px" }}
    >
      <div
        className="absolute h-full animate-streak-h"
        style={{
          width,
          animationDuration: duration,
          animationDelay: delay,
          background:
            "linear-gradient(to right, transparent, hsl(var(--primary) / 0.9), transparent)",
          filter: "blur(0.5px)",
          boxShadow: "0 0 8px 2px hsl(var(--primary) / 0.5)",
        }}
      />
    </div>
  );
}

function VStreak({ left, height, duration, delay }: StreakV) {
  return (
    <div
      className="absolute top-0 bottom-0 overflow-hidden pointer-events-none"
      style={{ left, width: "1px" }}
    >
      <div
        className="absolute w-full animate-streak-v"
        style={{
          height,
          animationDuration: duration,
          animationDelay: delay,
          background:
            "linear-gradient(to bottom, transparent, hsl(var(--primary) / 0.75), transparent)",
          filter: "blur(0.5px)",
          boxShadow: "0 0 8px 2px hsl(var(--primary) / 0.35)",
        }}
      />
    </div>
  );
}

interface TechBackgroundProps {
  variant?: "hero" | "cta";
  fadeTop?: boolean;
  fadeBottom?: boolean;
}

export function TechBackground({
  variant = "hero",
  fadeTop = true,
  fadeBottom = true,
}: TechBackgroundProps) {
  const hStreaks = variant === "hero" ? HERO_STREAKS_H : CTA_STREAKS_H;
  const vStreaks = variant === "hero" ? HERO_STREAKS_V : CTA_STREAKS_V;

  return (
    <div className="absolute inset-0 -z-10 pointer-events-none tech-grid opacity-[0.35] dark:opacity-[0.35]">
      {/* Horizontal light streaks */}
      <div className="absolute inset-0 overflow-hidden">
        {hStreaks.map((s, i) => (
          <HStreak key={`h-${i}`} {...s} />
        ))}
      </div>

      {/* Vertical light streaks */}
      <div className="absolute inset-0 overflow-hidden">
        {vStreaks.map((s, i) => (
          <VStreak key={`v-${i}`} {...s} />
        ))}
      </div>

      {fadeTop && (
        <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-background to-transparent" />
      )}
      {fadeBottom && (
        <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-background to-transparent" />
      )}
    </div>
  );
}
