import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  disabled = false,
  className,
}: OTPInputProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 初始化 refs 数组
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  // 处理输入
  const handleChange = useCallback(
    (index: number, inputValue: string) => {
      // 只允许数字
      const digit = inputValue.replace(/\D/g, "").slice(-1);

      if (digit === "" && inputValue !== "") {
        return; // 非数字输入，忽略
      }

      const newValue = value.split("");
      newValue[index] = digit;
      const result = newValue.join("");

      // 只保留前 length 位数字
      const cleanedValue = result.replace(/\D/g, "").slice(0, length);
      onChange(cleanedValue);

      // 自动跳转到下一个输入框
      if (digit && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [value, onChange, length],
  );

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        // 如果当前框为空，跳到前一个框并删除
        if (!value[index] && index > 0) {
          const newValue = value.split("");
          newValue[index - 1] = "";
          onChange(newValue.join("").slice(0, length));
          inputRefs.current[index - 1]?.focus();
        } else {
          // 删除当前框的内容
          const newValue = value.split("");
          newValue[index] = "";
          onChange(newValue.join("").slice(0, length));
        }
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && index > 0) {
        inputRefs.current[index - 1]?.focus();
        e.preventDefault();
      } else if (e.key === "ArrowRight" && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
        e.preventDefault();
      }
    },
    [value, onChange, length],
  );

  // 处理粘贴
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
      onChange(pastedData);

      // 聚焦到粘贴内容末尾或最后一个输入框
      const focusIndex = Math.min(pastedData.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
    },
    [onChange, length],
  );

  // 处理焦点
  const handleFocus = useCallback((index: number) => {
    setFocusedIndex(index);
    // 选中当前输入框的内容
    inputRefs.current[index]?.select();
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedIndex(null);
  }, []);

  // 将 value 转换为数组，每个元素对应一个输入框
  const valueArray = value.split("").concat(Array(length - value.length).fill(""));

  return (
    <div className={cn("flex gap-2 justify-center", className)} onPaste={handlePaste}>
      {valueArray.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={() => handleFocus(index)}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn(
            "w-10 h-12 text-center text-lg font-semibold",
            "border rounded-lg",
            "transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary/20",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            focusedIndex === index
              ? "border-primary bg-background shadow-sm"
              : "border-input/50 bg-muted/30 hover:border-input",
          )}
        />
      ))}
    </div>
  );
}
