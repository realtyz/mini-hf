import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Logo } from "@/components/shared/Logo";
import { landingContent } from "@/constants/landing";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          <Logo />
          <nav className="flex gap-6">
            {landingContent.footer.links.map((link, index) => (
              <a
                key={index}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <p className="text-sm text-muted-foreground">
              {landingContent.footer.copyright}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
