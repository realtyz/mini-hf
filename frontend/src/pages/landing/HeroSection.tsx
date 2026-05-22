import { landingContent } from "@/lib/constants/landing";
import { NodeNetwork } from "./NodeNetwork";
import { TechBackground } from "./TechBackground";

export function HeroSection() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      {/* Node network + tech grid + light streaks */}
      <NodeNetwork className="absolute inset-0 pointer-events-none" nodeCount={42} />
      <TechBackground variant="hero" fadeTop={false} />

      <div className="container mx-auto px-4 max-w-4xl text-center relative">
        {/* Headline */}
        <h1 className="relative text-5xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="animate-fade-in-up bg-linear-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
            On-Premises Model/Dataset Cache
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mt-6 text-lg text-muted-foreground sm:text-xl md:text-2xl leading-relaxed">
          {landingContent.hero.subheadline}
        </p>

        {/* Tech stack badges */}
        <div className="mt-8 flex items-center justify-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border/50">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
              <span className="text-xs font-bold text-primary">HF</span>
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              Huggingface
            </span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border/50">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
              <span className="text-xs font-bold text-primary">MS</span>
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              Modelscope
            </span>
          </div>
        </div>

      </div>
    </section>
  );
}
