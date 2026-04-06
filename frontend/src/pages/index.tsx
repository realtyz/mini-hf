import { HeroSection } from './components/HeroSection'
import { FeaturesSection } from './components/FeaturesSection'
import { HowItWorksSection } from './components/HowItWorksSection'
import { CodeExampleSection } from './components/CodeExampleSection'
import { BenefitsSection } from './components/BenefitsSection'
import { CTASection } from './components/CTASection'

export function LandingPage() {
  return (
    <main>
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CodeExampleSection />
      <BenefitsSection />
      <CTASection />
    </main>
  )
}

export default LandingPage
