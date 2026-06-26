// Landing page (public, unauthenticated). The `./landing/` subdirectory holds
// private sub-components consumed only by this file — not a routed page.
import { HeroSection } from "./landing/HeroSection";
import { TrendingSection } from "./landing/TrendingSection";

export function LandingPage() {
  return (
    <main>
      <HeroSection />
      <TrendingSection />
    </main>
  );
}

export default LandingPage;
