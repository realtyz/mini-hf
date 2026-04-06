import * as React from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  validate?: (tag: string) => { valid: boolean; message?: string };
  description?: string;
  label?: string;
  id?: string;
}

export function TagInput({
  value,
  onChange,
  placeholder,
  validate,
  description,
  label,
  id,
}: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [inputError, setInputError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;

    // Check for duplicates
    if (value.includes(trimmed)) {
      setInputError("该 pattern 已存在");
      return;
    }

    // Validate if validator provided
    if (validate) {
      const result = validate(trimmed);
      if (!result.valid) {
        setInputError(result.message || "无效的 pattern");
        return;
      }
    }

    onChange([...value, trimmed]);
    setInputValue("");
    setInputError(null);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
    setInputError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      // Remove last tag when backspace is pressed on empty input
      removeTag(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setInputValue("");
      setInputError(null);
      inputRef.current?.blur();
    }
  };

  const handleBlur = () => {
    // Don't auto-add on blur to avoid accidental tags
    setInputError(null);
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <div
        className={cn(
          "flex flex-wrap gap-2 min-h-[40px] p-2 rounded-md border bg-background",
          "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
          "transition-[color,box-shadow]",
          inputError && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20"
        )}
        onClick={handleContainerClick}
      >
        {value.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="gap-1 pr-1 text-sm animate-in fade-in zoom-in-95 duration-150"
          >
            <span className="max-w-[200px] truncate">{tag}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
              aria-label={`移除 ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setInputError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {inputError ? (
        <p className="text-xs text-destructive">{inputError}</p>
      ) : description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export default TagInput;
