import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Section } from "@/components/shared/Section";
import { landingContent } from "@/constants/landing";
import { TrendingUp, Zap, Database } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { useCounter, parseMetricValue } from "@/hooks/useCounter";

const icons = [TrendingUp, Zap, Database];

const metricColors = [
  { bg: "bg-primary/10", icon: "text-primary", text: "text-primary" },
  { bg: "bg-primary/10", icon: "text-primary", text: "text-primary" },
  { bg: "bg-primary/10", icon: "text-primary", text: "text-primary" },
];

function AnimatedMetric({
  value,
  isVisible,
  index,
}: {
  value: string;
  isVisible: boolean;
  index: number;
}) {
  const { num, suffix } = parseMetricValue(value);
  const count = useCounter({
    end: num,
    duration: 2000,
    delay: index * 200,
    enabled: isVisible,
  });
  const colors = metricColors[index % metricColors.length];

  return (
    <CardTitle className={`${colors.text} text-5xl font-bold`}>
      {count}
      {suffix}
    </CardTitle>
  );
}

export function BenefitsSection() {
  const [containerRef, isVisible] = useReveal<HTMLDivElement>({
    threshold: 0.2,
  });

  return (
    <Section id="benefits" className="relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute left-1/4 bottom-1/4 -z-10 w-80 h-80 bg-muted/50 rounded-full blur-3xl" />
      <div className="absolute right-1/4 top-1/4 -z-10 w-96 h-96 bg-muted/30 rounded-full blur-3xl" />

      <div ref={containerRef} className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {landingContent.benefits.title}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            看看 mini-hf 能为您带来什么
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {landingContent.benefits.metrics.map((metric, index) => {
            const Icon = icons[index];
            const colors = metricColors[index % metricColors.length];

            return (
              <Card
                key={index}
                className={`group h-full border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                <CardHeader className="text-center">
                  <div
                    className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${colors.bg} transition-all duration-300 group-hover:scale-110`}
                  >
                    <Icon className={`h-8 w-8 ${colors.icon}`} />
                  </div>
                  <AnimatedMetric
                    value={metric.value}
                    isVisible={isVisible}
                    index={index}
                  />
                  <CardTitle className="mt-2 text-xl">{metric.label}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <CardDescription className="text-base leading-relaxed">
                    {metric.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
