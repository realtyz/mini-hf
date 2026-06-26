import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getPasswordStrength } from "./password-strength";

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({
  password,
}: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const strength = getPasswordStrength(password);

  return (
    <motion.div
      className="space-y-1.5"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
    >
      <div className="flex h-1 gap-1">
        {[1, 2, 3, 4].map((level) => (
          <motion.div
            key={level}
            className={cn(
              "flex-1 rounded-full transition-colors duration-300",
              strength.score >= level ? strength.color : "bg-muted",
            )}
            initial={false}
            animate={{
              scale: strength.score >= level ? [1, 1.1, 1] : 1,
            }}
            transition={{ duration: 0.2 }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">密码强度</span>
        <span className={cn("font-medium", strength.textColor)}>
          {strength.label}
        </span>
      </div>
    </motion.div>
  );
}
