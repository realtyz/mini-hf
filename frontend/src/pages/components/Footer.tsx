import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { landingContent } from "@/constants/landing";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
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
          <ThemeToggle />
          <p className="text-sm text-muted-foreground">
            {landingContent.footer.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}
