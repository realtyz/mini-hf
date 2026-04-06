import { Button } from "@/components/ui/button";
import { landingContent } from "@/constants/landing";
import { Zap, Database, ArrowRight, BookOpen } from "lucide-react";
import { TechBackground } from "./TechBackground";
import { NodeNetwork } from "./NodeNetwork";
import { Link } from "react-router";
import { useTypewriter } from "@/hooks/use-typewriter";

// Floating particle component
function FloatingParticle({
  delay,
  size,
  x,
  y,
  tx,
  ty,
}: {
  delay: number;
  size: number;
  x: string;
  y: string;
  tx: string;
  ty: string;
}) {
  return (
    <div
      className="absolute rounded-full bg-primary/20 animate-particle pointer-events-none"
      style={{
        width: size,
        height: size,
        left: x,
        top: y,
        animationDelay: `${delay}s`,
        ["--tx" as string]: tx,
        ["--ty" as string]: ty,
      }}
    />
  );
}

const particles = [
  { delay: 0, size: 4, x: "20%", y: "30%", tx: "12px", ty: "-80px" },
  { delay: 1.5, size: 3, x: "70%", y: "20%", tx: "-30px", ty: "-120px" },
  { delay: 3, size: 5, x: "85%", y: "60%", tx: "40px", ty: "-60px" },
  { delay: 4.5, size: 3, x: "15%", y: "70%", tx: "-20px", ty: "-100px" },
  { delay: 6, size: 4, x: "50%", y: "80%", tx: "25px", ty: "-140px" },
  { delay: 7.5, size: 3, x: "35%", y: "45%", tx: "-45px", ty: "-90px" },
  { delay: 2, size: 4, x: "60%", y: "35%", tx: "10px", ty: "-110px" },
];

export function HeroSection() {
  const { displayText } = useTypewriter({
    text: "On-Premises Model/Dataset Cache",
    speed: 60,
    delay: 300,
    loop: false,
  });

  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      {/* Tech grid + light streaks */}
      <TechBackground variant="hero" fadeTop={false} />

      {/* Node network overlay */}
      <NodeNetwork className="absolute inset-0 pointer-events-none" nodeCount={42} />

      {/* Floating particles */}
      {particles.map((p, i) => (
        <FloatingParticle key={i} {...p} />
      ))}

      <div className="container mx-auto px-4 max-w-4xl text-center relative">
        {/* Floating badges with staggered entrance */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 hidden md:flex gap-3">
          <div className="flex items-center justify-center gap-2 w-36 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm animate-float">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              10x 速度提升
            </span>
          </div>
          <div
            className="flex items-center justify-center gap-2 w-36 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm animate-float"
            style={{ animationDelay: "1s" }}
          >
            <Database className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">智能缓存</span>
          </div>
        </div>

        {/* Animated headline with blinking cursor */}
        <h1 className="relative text-5xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="text-foreground">{displayText}</span>
          <span className="inline-block w-4 h-[1em] bg-primary ml-1 animate-blink align-middle" />
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

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            className="cursor-pointer group transition-all duration-300"
            onClick={() => {
              document
                .getElementById("getting-started")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {landingContent.hero.primaryCta}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="cursor-pointer border-2 hover:bg-muted/50 transition-all duration-300"
            asChild
          >
            <Link to="/docs">
              <BookOpen className="mr-2 h-4 w-4" />
              {landingContent.hero.secondaryCta}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
