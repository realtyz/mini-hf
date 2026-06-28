import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowRight, LogIn } from "lucide-react";
import { toast } from "sonner";
import { config } from "@/lib/runtime-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useLogin } from "@/hooks/api/use-auth-queries";
import { useAuthStore } from "@/stores/auth-store";
import { StaggerContainer, StaggerItem } from "./StaggerContainer";
import { springConfig } from "./spring-config";

interface LoginFormProps {
  onFlip: () => void;
}

export function LoginForm({ onFlip }: LoginFormProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { mutate: login, isPending: isLoading } = useLogin();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/console");
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    login(
      { username: email, password },
      {
        onSuccess: () => navigate("/console"),
        onError: (err: Error) =>
          toast.error(err.message || "登录失败，请检查邮箱和密码", {
            position: "top-center",
          }),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      {/* Header */}
      <StaggerContainer className="mb-6 shrink-0 text-center" delay={0.1}>
        <StaggerItem>
          <motion.div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={springConfig.snappy}
          >
            <LogIn className="h-5 w-5 text-primary" />
          </motion.div>
        </StaggerItem>
        <StaggerItem>
          <h1 className="text-xl font-bold tracking-tight">欢迎回来</h1>
        </StaggerItem>
        <StaggerItem>
          <p className="text-xs text-muted-foreground">登录您的 MiniHF 账号</p>
        </StaggerItem>
      </StaggerContainer>

      <StaggerContainer
        className="flex flex-1 flex-col justify-center gap-4"
        delay={0.2}
      >
        {/* Email Field */}
        <StaggerItem className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium">
            邮箱
          </Label>
          <Input
            id="email"
            type="email"
            placeholder={`name@${config.EMAIL_DOMAIN}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="email"
            className="h-11 border-input/50 bg-muted/30 transition-colors focus:border-primary focus:bg-background"
          />
        </StaggerItem>

        {/* Password Field */}
        <StaggerItem className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">
              密码
            </Label>
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              忘记密码？
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="current-password"
              className="h-11 border-input/50 bg-muted/30 pr-10 transition-colors focus:border-primary focus:bg-background"
            />
            <motion.button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
              whileTap={{ scale: 0.9 }}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </motion.button>
          </div>
        </StaggerItem>

        {/* Remember Me */}
        <StaggerItem>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="remember"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              disabled={isLoading}
            />
            <Label
              htmlFor="remember"
              className="cursor-pointer text-sm font-normal text-muted-foreground"
            >
              记住我
            </Label>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Submit Button */}
      <motion.div
        className="mt-6 shrink-0"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, type: "spring", ...springConfig.smooth }}
      >
        <Button
          type="submit"
          className="h-11 w-full shadow-lg shadow-primary/20 transition-shadow duration-200 hover:shadow-xl hover:shadow-primary/25"
          disabled={isLoading}
          asChild
        >
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={springConfig.snappy}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                登录中...
              </>
            ) : (
              <>
                登录
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </motion.button>
        </Button>
      </motion.div>

      {/* Register Link */}
      <motion.div
        className="shrink-0 pt-4 text-center text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <span className="text-muted-foreground">还没有账号？</span>{" "}
        <motion.button
          type="button"
          onClick={onFlip}
          className="inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
          whileHover={{ x: 2 }}
          transition={springConfig.snappy}
        >
          立即注册
          <ArrowRight className="h-3 w-3" />
        </motion.button>
      </motion.div>
    </form>
  );
}
