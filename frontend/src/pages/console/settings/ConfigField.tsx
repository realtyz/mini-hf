import { memo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { HfEndpointListField } from "./HfEndpointListField";
import type { ConfigFieldSchema } from "@/lib/api/types";

interface ConfigFieldProps {
  field: ConfigFieldSchema;
  value: unknown;
  form: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export const ConfigField = memo(function ConfigField({
  field,
  value,
  form,
  onChange,
}: ConfigFieldProps) {
  const id = `config-${field.key}`;
  const className = cn(field.ui.col_span === 2 && "sm:col-span-2");

  if (field.ui.widget === "hf_endpoint_list") {
    return (
      <HfEndpointListField
        className={className}
        field={field}
        value={value}
        form={form}
        onChange={onChange}
        defaultEndpointKey={field.ui.default_endpoint_key}
        placeholder={field.ui.placeholder}
      />
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground/80">
        {field.label}
      </Label>

      {field.ui.widget === "switch" ? (
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(field.key, checked)}
        />
      ) : field.ui.widget === "textarea" ? (
        <Textarea
          id={id}
          value={String(value ?? "")}
          rows={field.ui.rows}
          placeholder={field.ui.placeholder}
          className="transition-all duration-200 focus-visible:ring-primary/20"
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={field.ui.input_type || "text"}
          value={String(value ?? "")}
          min={field.min_value ?? undefined}
          max={field.max_value ?? undefined}
          placeholder={
            field.sensitive && field.has_value
              ? "已设置，留空保持不变"
              : field.ui.placeholder
          }
          className="transition-all duration-200 focus-visible:ring-primary/20"
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}

      {field.ui.helper_text ? (
        <p className="text-xs text-muted-foreground/80">
          {field.ui.helper_text}
        </p>
      ) : null}
    </div>
  );
});
