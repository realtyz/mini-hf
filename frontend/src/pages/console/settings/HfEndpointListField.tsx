import { memo, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import type { ConfigFieldSchema } from "@/lib/api/types";

interface HfEndpointListFieldProps {
  className?: string;
  field: ConfigFieldSchema;
  value: unknown;
  form: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export const HfEndpointListField = memo(function HfEndpointListField({
  className,
  field,
  value,
  form,
  onChange,
}: HfEndpointListFieldProps) {
  const endpoints = useMemo(
    () => (Array.isArray(value) ? value.map(String) : []),
    [value],
  );

  function updateEndpoints(next: string[]) {
    onChange(field.key, next);
    const nonEmpty = next.filter((e) => e.trim() !== "");
    const defaultEndpoint = String(form.hf_default_endpoint ?? "");
    if (nonEmpty.length > 0 && !nonEmpty.includes(defaultEndpoint)) {
      onChange("hf_default_endpoint", nonEmpty[0]);
    }
  }

  function handleChange(index: number, newValue: string) {
    const next = [...endpoints];
    next[index] = newValue;
    updateEndpoints(next);
  }

  function handleRemove(index: number) {
    const next = endpoints.filter((_, i) => i !== index);
    updateEndpoints(next);
  }

  function handleAdd() {
    updateEndpoints([...endpoints, ""]);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-medium text-foreground/80">
        {field.label}
      </Label>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {endpoints.map((endpoint, index) => (
            <motion.div
              key={`endpoint-${index}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="flex gap-2"
            >
              <Input
                value={endpoint}
                placeholder="https://huggingface.co"
                className="transition-all duration-200 focus-visible:ring-primary/20"
                onChange={(event) => handleChange(index, event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(index)}
                disabled={endpoints.length <= 1}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="gap-1.5 mt-1"
      >
        <Plus className="size-3.5" />
        添加 Endpoint
      </Button>
    </div>
  );
});
