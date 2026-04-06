import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Section } from "@/components/shared/Section";
import { landingContent } from "@/constants/landing";
import { ChevronRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

export function HowItWorksSection() {
  const [containerRef, isVisible] = useReveal<HTMLDivElement>({
    threshold: 0.1,
  });

  return (
    <Section id="how-it-works" className="relative">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {landingContent.howItWorks.title}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            简单四步，即可开始享受高速模型访问
          </p>
        </div>

        <div ref={containerRef} className="mt-12 space-y-6">
          {landingContent.howItWorks.steps.map((step, index) => {
            return (
              <div key={index} className="relative">
                <Card
                  className={`border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-500 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 ${
                    isVisible
                      ? "opacity-100 translate-x-0"
                      : "opacity-0 -translate-x-6"
                  }`}
                  style={{ transitionDelay: `${index * 150}ms` }}
                >
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-lg shadow-lg shadow-primary/20">
                        {step.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-xl md:text-2xl">
                          {step.title}
                        </CardTitle>
                        <CardDescription className="mt-2 text-base leading-relaxed">
                          {step.description}
                        </CardDescription>
                      </div>
                      <div className="hidden md:flex items-center justify-center">
                        <ChevronRight className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
