import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { landingContent } from "@/constants/landing";
import * as LucideIcons from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

export function FeaturesSection() {
  const iconMap = LucideIcons;
  const [containerRef, isVisible] = useReveal<HTMLDivElement>({
    threshold: 0.1,
  });

  const featureColors = [
    {
      bg: "bg-primary/10",
      icon: "text-primary",
      hover: "group-hover:bg-primary/20",
    },
    {
      bg: "bg-primary/10",
      icon: "text-primary",
      hover: "group-hover:bg-primary/20",
    },
    {
      bg: "bg-primary/10",
      icon: "text-primary",
      hover: "group-hover:bg-primary/20",
    },
    {
      bg: "bg-primary/10",
      icon: "text-primary",
      hover: "group-hover:bg-primary/20",
    },
  ];

  return (
    <section id="features" className="relative py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            核心功能
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            全面的模型缓存解决方案，满足您的所有需求
          </p>
        </div>

        <div
          ref={containerRef}
          className={`mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4 transition-all duration-500 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          {landingContent.features.map((feature, index) => {
            const Icon = iconMap[
              feature.icon as keyof typeof iconMap
            ] as LucideIcons.LucideIcon;
            const colors = featureColors[index % featureColors.length];

            return (
              <Card
                key={index}
                className={`group h-full border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <CardHeader>
                  <div
                    className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${colors.bg} transition-all duration-300 group-hover:scale-110 ${colors.hover}`}
                  >
                    {Icon && <Icon className={`h-7 w-7 ${colors.icon}`} />}
                  </div>
                  <CardTitle className="group-hover:text-primary transition-colors">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
