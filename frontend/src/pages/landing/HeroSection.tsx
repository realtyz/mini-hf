import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { landingContent } from "@/lib/constants/landing";
import { config } from "@/lib/runtime-config";
import {
  containerVariants,
  itemVariants,
  springSnappy,
} from "@/lib/animations/motion-config";
import { TechBackground } from "./TechBackground";

const COPY_RESET_MS = 1800;

/**
 * HF_ENDPOINT derived from runtime config (same source the docs pages use),
 * so the hero always matches the actually-deployed HF server URL.
 */
function resolveHfEndpoint(): string {
  return `export HF_ENDPOINT=${config.HF_SERVER_URL}`;
}

/**
 * Signature element: the product's literal onboarding step, presented as a
 * copy-paste terminal line. Honesty over decoration — this is how the tool
 * is actually wired in.
 */
function EndpointBlock() {
  const endpoint = useState(resolveHfEndpoint)[0];
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard unavailable (older browser / no permission) — ignore.
    }
  };

  return (
    <div className="mx-auto mt-12 w-full max-w-xl">
      <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-left">
        <span
          aria-hidden
          className="select-none font-mono text-xs text-muted-foreground/60"
        >
          $
        </span>
        <code className="flex-1 truncate font-mono text-[13px] text-foreground/90">
          {endpoint}
          <span
            aria-hidden
            className="ml-0.5 inline-block w-1.75 -mb-px h-3.5 translate-y-0.5 bg-foreground/70 animate-blink"
          />
        </code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="复制 HF_ENDPOINT"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <Check className="size-3.5 text-status-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient depth: the project's signature animated tech grid with
          flowing light streaks. Pure CSS keyframes + -webkit-filter, so it
          renders identically across mainstream browsers. Sits behind content
          and fades at the edges to keep the centre calm. */}
      <TechBackground variant="hero" fadeTop fadeBottom />

      <div className="mx-auto max-w-3xl px-4 py-28 text-center sm:py-36">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Eyebrow with live status dot */}
          <motion.div
            variants={itemVariants}
            className="flex items-center justify-center gap-2"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-success/60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-status-success" />
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              局域网模型缓存 · HuggingFace &amp; ModelScope
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={itemVariants}
            className="mt-6 text-4xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-5xl md:text-6xl"
          >
            {landingContent.hero.headline}
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={itemVariants}
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            {landingContent.hero.subheadline}
          </motion.p>

          {/* CTAs */}
          <motion.div
            variants={itemVariants}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <motion.div
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={springSnappy}
            >
              <Button asChild size="lg" className="cursor-pointer">
                <Link to="/login" viewTransition>
                  {landingContent.hero.primaryCta}
                </Link>
              </Button>
            </motion.div>
            <motion.div
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={springSnappy}
            >
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="cursor-pointer"
              >
                <Link to="/docs" viewTransition>
                  {landingContent.hero.secondaryCta}
                </Link>
              </Button>
            </motion.div>
          </motion.div>

          {/* Signature: endpoint config block */}
          <motion.div variants={itemVariants}>
            <EndpointBlock />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
