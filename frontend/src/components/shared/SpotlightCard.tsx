import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  /**
   * `interactive` (default) tracks the pointer and renders a radial spotlight
   * glow on hover — the original AuthPage behavior. `static` is a plain card
   * surface with a hover shadow, matching the former SettingsComponents copy.
   */
  variant?: "interactive" | "static";
}

export function SpotlightCard({
  children,
  className,
  variant = "interactive",
}: SpotlightCardProps) {
  if (variant === "static") {
    return (
      <StaticSpotlightCard className={className}>
        {children}
      </StaticSpotlightCard>
    );
  }
  return (
    <InteractiveSpotlightCard className={className}>
      {children}
    </InteractiveSpotlightCard>
  );
}

function StaticSpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card shadow-sm transition-shadow duration-200",
        "hover:shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

function InteractiveSpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative h-full overflow-hidden rounded-2xl border border-border/50",
        "bg-card/95 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.08),0_2px_8px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25),0_2px_8px_rgb(0,0,0,0.15)]",
        className,
      )}
    >
      {/* Spotlight effect - Liquid Glass style */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500"
        animate={{ opacity: isHovered ? 1 : 0 }}
        style={{
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, hsla(var(--primary-h), var(--primary-s), var(--primary-l), 0.08), transparent 40%)`,
        }}
      />
      {/* Inner glow line */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]" />
      {children}
    </div>
  );
}
