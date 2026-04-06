import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Section } from "@/components/shared/Section";
import { landingContent } from "@/constants/landing";
import { Terminal, Copy, Check, Play } from "lucide-react";
import { useState, useEffect } from "react";
import { useReveal } from "@/hooks/useReveal";

const lines = landingContent.codeExample.code
  .split("\n")
  .filter((line) => line.trim() !== "");

export function CodeExampleSection() {
  const [copied, setCopied] = useState(false);
  const [containerRef, isVisible] = useReveal<HTMLDivElement>({
    threshold: 0.1,
  });
  const [typedLines, setTypedLines] = useState<number[]>([]);

  useEffect(() => {
    if (!isVisible) return;

    // Type each line with delay
    lines.forEach((_, index) => {
      setTimeout(() => {
        setTypedLines((prev) => [...prev, index]);
      }, index * 200);
    });
  }, [isVisible]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(landingContent.codeExample.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightCode = (line: string): string => {
    // Apply regex only to text nodes, not inside HTML tags added by previous passes
    const replaceText = (html: string, regex: RegExp, replacement: string) =>
      html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) =>
        tag ? tag : text ? text.replace(regex, replacement) : match,
      );

    let result = line;
    result = replaceText(
      result,
      /(#.*$)/,
      '<span class="text-muted-foreground">$1</span>',
    );
    result = replaceText(
      result,
      /(export|const|let|var|function|return|if|else|for|while)/g,
      '<span class="text-purple-400">$1</span>',
    );
    result = replaceText(
      result,
      /(".*?"|'.*?'|`.*?`)/g,
      '<span class="text-green-400">$1</span>',
    );
    result = replaceText(
      result,
      /\b(\d+)\b/g,
      '<span class="text-orange-400">$1</span>',
    );
    return result;
  };

  return (
    <Section id="getting-started" className="relative">
      {/* Background glow */}
      <div className="absolute right-1/4 top-1/2 -z-10 w-80 h-80 bg-muted/50 rounded-full blur-3xl -translate-y-1/2" />

      <div ref={containerRef} className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {landingContent.codeExample.title}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {landingContent.codeExample.description}
          </p>
        </div>

        <Card
          className={`mt-12 border-border/50 bg-card/80 backdrop-blur-sm shadow-xl shadow-primary/5 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>终端</CardTitle>
                <CardDescription>复制并运行以下命令</CardDescription>
              </div>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-primary rounded-lg hover:bg-primary/5"
              title={copied ? "已复制" : "复制"}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span>已复制</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>复制</span>
                </>
              )}
            </button>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-slate-900 to-slate-950 border border-slate-800">
              {/* Terminal header */}
              <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 bg-slate-900/50">
                <div className="flex gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <div className="h-3 w-3 rounded-full bg-green-500/80" />
                </div>
                <span className="ml-2 text-xs text-slate-500 font-mono">
                  bash
                </span>
                <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                  <Play className="h-3 w-3" />
                  <span>mini-hf</span>
                </div>
              </div>

              {/* Code content with scan beam effect */}
              <div className="relative p-6">
                {/* Scan beam */}
                <div className="absolute inset-x-0 h-px bg-linear-to-r from-transparent via-cyan-500/50 to-transparent animate-scan pointer-events-none" />

                <pre className="overflow-x-auto text-sm leading-relaxed font-mono">
                  {lines.map((line, index) => (
                    <div
                      key={index}
                      className={`transition-all duration-300 ${
                        typedLines.includes(index)
                          ? "opacity-100 translate-x-0"
                          : "opacity-0 -translate-x-2"
                      }`}
                    >
                      <code
                        className="text-slate-300"
                        dangerouslySetInnerHTML={{
                          __html: highlightCode(line) || "\u00A0",
                        }}
                      />
                    </div>
                  ))}
                  {/* Blinking cursor */}
                  {typedLines.length >= lines.length && (
                    <span className="inline-block w-2 h-4 bg-cyan-400 ml-1 animate-blink" />
                  )}
                </pre>
              </div>

              {/* Bottom shimmer effect */}
              <div className="absolute bottom-0 inset-x-0 h-1 bg-linear-to-r from-transparent via-cyan-500/20 to-transparent animate-shimmer" />
            </div>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
