import { landingContent } from '@/constants/landing'
import { Sparkles } from 'lucide-react'
import { useReveal } from '@/hooks/useReveal'
import { TechBackground } from './TechBackground'

export function CTASection() {
  const [containerRef, isVisible] = useReveal<HTMLDivElement>({ threshold: 0.2 })

  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      {/* Tech grid + light streaks */}
      <TechBackground variant="cta" fadeBottom={false} />

      {/* Animated rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10">
        <div className="w-96 h-96 rounded-full border border-primary/10 animate-pulse-ring" />
        <div className="w-96 h-96 rounded-full border border-primary/10 animate-pulse-ring absolute top-0 left-0" style={{ animationDelay: '0.5s' }} />
        <div className="w-96 h-96 rounded-full border border-primary/10 animate-pulse-ring absolute top-0 left-0" style={{ animationDelay: '1s' }} />
      </div>

      <div ref={containerRef} className="container mx-auto px-4 max-w-4xl text-center relative">
        {/* Decorative icon with floating animation */}
        <div
          className={`relative z-10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-lg shadow-primary/20 animate-float transition-all duration-700 ${
            isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
          }`}
        >
          <Sparkles className="h-8 w-8 text-primary animate-pulse" />
        </div>

        <h2
          className={`text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
          style={{ transitionDelay: '100ms' }}
        >
          <span className="text-foreground">
            {landingContent.cta.headline}
          </span>
        </h2>

        <p
          className={`mt-6 text-lg text-muted-foreground md:text-xl leading-relaxed transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
          style={{ transitionDelay: '200ms' }}
        >
          {landingContent.cta.subheadline}
        </p>

        {/* Trust badges */}
        <div
          className={`mt-10 flex items-center justify-center gap-6 text-sm text-muted-foreground transition-all duration-700 ${
            isVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ transitionDelay: '400ms' }}
        >
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>开源免费</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.5s' }} />
            <span>易于部署</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '1s' }} />
            <span>社区支持</span>
          </div>
        </div>
      </div>

    </section>
  )
}
