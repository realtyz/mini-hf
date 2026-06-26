import { useState } from "react";
import { Link, useLocation } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import { CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Logo } from "@/components/shared/Logo";
import { SpotlightCard } from "@/components/shared/SpotlightCard";
import { springConfig } from "./spring-config";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

// --- Main Page Component ---
export function AuthPage() {
  const location = useLocation();
  const [isFlipped, setIsFlipped] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const mode: "login" | "register" | "forgot" =
    location.pathname === "/register"
      ? "register"
      : location.pathname === "/forgot-password"
        ? "forgot"
        : "login";

  const isAuthPage = mode === "login" || mode === "register";

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-linear-to-br from-background via-muted/40 to-background">
      {/* Animated Background Elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-1/4 -top-1/4 h-150 w-150 rounded-full bg-primary/5 blur-3xl"
          animate={{
            y: shouldReduceMotion ? 0 : [0, -20, 0],
            x: shouldReduceMotion ? 0 : [0, 10, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute -bottom-1/4 -right-1/4 h-125 w-125 rounded-full bg-primary/8 blur-3xl"
          animate={{
            y: shouldReduceMotion ? 0 : [0, 20, 0],
            x: shouldReduceMotion ? 0 : [0, -10, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2,
          }}
        />
        <div className="absolute left-1/2 top-1/2 h-200 w-200 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-radial from-primary/5 via-transparent to-transparent opacity-60" />

        {/* Grid Pattern */}
        <div className="tech-grid absolute inset-0 opacity-[0.03]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex h-16 items-center justify-between px-6 md:px-10">
        <Link to="/" className="shrink-0 group">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex flex-1 items-center justify-center p-4 md:p-8">
        {isAuthPage ? (
          <div className="w-full max-w-md" style={{ perspective: 1000 }}>
            {/* 3D Flip Card Container */}
            <motion.div
              className="relative h-150 w-full"
              style={{ transformStyle: "preserve-3d" }}
              animate={{
                rotateY: isFlipped ? 180 : 0,
              }}
              transition={{
                type: "spring",
                ...springConfig.smooth,
              }}
            >
              {/* Front Face - Login */}
              <div
                className="absolute inset-0"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                <SpotlightCard>
                  <CardContent className="flex h-full flex-col p-8">
                    <LoginForm onFlip={() => setIsFlipped(true)} />
                  </CardContent>
                </SpotlightCard>
              </div>

              {/* Back Face - Register */}
              <div
                className="absolute inset-0"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <SpotlightCard>
                  <CardContent className="flex h-full flex-col p-8">
                    <RegisterForm onFlip={() => setIsFlipped(false)} />
                  </CardContent>
                </SpotlightCard>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="w-full max-w-md">
            <SpotlightCard>
              <CardContent className="flex h-full flex-col p-8">
                <ForgotPasswordForm />
              </CardContent>
            </SpotlightCard>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link
            to="/"
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            返回首页
          </Link>
          <span className="text-muted-foreground/30">|</span>
          <p className="text-sm text-muted-foreground/70">
            &copy; {new Date().getFullYear()}{" "}
            <a
              href="https://github.com/realtyz/mini-hf"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-primary"
            >
              mini-hf
            </a>{" "}
            All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default AuthPage;
