import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  UserPlus,
  LogIn,
  KeyRound,
  Mail,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { config } from "@/lib/runtime-config";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { OTPInput } from "@/components/ui/otp-input";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Logo } from "@/components/shared/Logo";
import { SpotlightCard } from "@/components/shared/SpotlightCard";
import {
  useLogin,
  useSendVerifyCode,
  useVerifyEmail,
  useRegisterWithCode,
  useForgotPassword,
  useResetPassword,
} from "@/hooks/api/use-auth-queries";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { getPasswordStrength } from "./password-strength";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";

// --- Spring Configs ---
const springConfig = {
  smooth: { stiffness: 150, damping: 20 },
  snappy: { stiffness: 300, damping: 30 },
  bouncy: { stiffness: 100, damping: 10 },
};

// --- Stagger Container ---
function StaggerContainer({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            delayChildren: delay,
            staggerChildren: shouldReduceMotion ? 0 : 0.05,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            type: "spring",
            ...springConfig.smooth,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// --- Password Strength Checker ---
// (extracted to ./password-strength.ts)

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

// --- Login Form Component ---
interface FormProps {
  onFlip: () => void;
}

function LoginForm({ onFlip }: FormProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { mutate: login, isPending: isLoading } = useLogin();
  const { isAuthenticated } = useAuthStore();

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

// --- Register Form Component ---
function RegisterForm({ onFlip }: FormProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"verify" | "password">("verify");
  const [email, setEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const { mutate: sendVerifyCode, isPending: isSendingCode } =
    useSendVerifyCode();
  const { mutate: verifyEmail, isPending: isVerifying } = useVerifyEmail();
  const { mutate: register, isPending: isRegistering } = useRegisterWithCode();
  const { isAuthenticated } = useAuthStore();

  // 倒计时逻辑
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/console");
    }
  }, [isAuthenticated, navigate]);

  const passwordStrength = getPasswordStrength(password);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";
  const passwordsMismatch =
    confirmPassword !== "" && password !== confirmPassword;

  const handleSendCode = () => {
    if (!email) {
      toast.error("请输入邮箱地址", { position: "top-center" });
      return;
    }

    sendVerifyCode(
      { email },
      {
        onSuccess: (data) => {
          setCountdown(data.resend_after);
          toast.success("验证码已发送", { position: "top-center" });
        },
        onError: (err: Error) => {
          toast.error(err.message || "发送验证码失败", {
            position: "top-center",
          });
        },
      },
    );
  };

  const handleVerifyEmail = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!verifyCode || verifyCode.length !== 6) {
      toast.error("请输入6位验证码", { position: "top-center" });
      return;
    }

    verifyEmail(
      { email, code: verifyCode },
      {
        onSuccess: () => {
          // 从邮箱提取用户名
          setName(email.split("@")[0]);
          setStep("password");
        },
        onError: (err: Error) => {
          toast.error(err.message || "验证失败", { position: "top-center" });
        },
      },
    );
  };

  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("密码长度至少需要8个字符", { position: "top-center" });
      return;
    }

    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致", { position: "top-center" });
      return;
    }

    if (passwordStrength.score < 2) {
      toast.error("密码强度太弱，请使用包含大小写字母、数字和特殊字符的组合", {
        position: "top-center",
      });
      return;
    }

    register(
      { email, code: verifyCode, name, password },
      {
        onSuccess: () => {
          setIsSuccess(true);
          setTimeout(() => {
            onFlip();
          }, 2000);
        },
        onError: (err: Error) => {
          toast.error(err.message || "注册失败，请检查输入信息", {
            position: "top-center",
          });
        },
      },
    );
  };

  const isLoading = isSendingCode || isVerifying || isRegistering;

  if (isSuccess) {
    return (
      <motion.div
        className="flex h-full flex-col items-center justify-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", ...springConfig.bouncy }}
      >
        <motion.div
          className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-green-500/20 to-green-500/5 ring-1 ring-green-500/30"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.1, ...springConfig.bouncy }}
        >
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </motion.div>
        <div className="text-center">
          <h2 className="text-xl font-semibold">注册成功！</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            正在返回登录页面...
          </p>
        </div>
      </motion.div>
    );
  }

  // Step 1: 验证邮箱
  if (step === "verify") {
    return (
      <form onSubmit={handleVerifyEmail} className="flex h-full flex-col">
        {/* Header */}
        <StaggerContainer className="mb-4 shrink-0 text-center" delay={0.1}>
          <StaggerItem>
            <motion.div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20"
              whileHover={{ scale: 1.05, rotate: -5 }}
              transition={springConfig.snappy}
            >
              <UserPlus className="h-5 w-5 text-primary" />
            </motion.div>
          </StaggerItem>
          <StaggerItem>
            <h1 className="text-xl font-bold tracking-tight">创建账号</h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-xs text-muted-foreground">验证您的邮箱地址</p>
          </StaggerItem>
        </StaggerContainer>

        <StaggerContainer
          className="flex flex-1 flex-col justify-center gap-4"
          delay={0.2}
        >
          {/* Email Field */}
          <StaggerItem className="space-y-1.5">
            <Label htmlFor="reg-email" className="text-sm font-medium">
              邮箱
            </Label>
            <div className="flex gap-2">
              <Input
                id="reg-email"
                type="email"
                placeholder={`name@${config.EMAIL_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
                className="h-11 border-input/50 bg-muted/30 transition-colors focus:border-primary focus:bg-background"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 px-4"
                disabled={isLoading || countdown > 0 || !email}
                onClick={handleSendCode}
              >
                {isSendingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : countdown > 0 ? (
                  `${countdown}s`
                ) : (
                  "发送验证码"
                )}
              </Button>
            </div>
          </StaggerItem>

          {/* Verify Code Field */}
          <StaggerItem className="space-y-1.5">
            <Label className="text-sm font-medium">验证码</Label>
            <OTPInput
              length={6}
              value={verifyCode}
              onChange={setVerifyCode}
              disabled={isLoading}
            />
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
            disabled={isLoading || verifyCode.length !== 6}
            asChild
          >
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={springConfig.snappy}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  验证中...
                </>
              ) : (
                <>
                  下一步
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </motion.button>
          </Button>
        </motion.div>

        {/* Login Link */}
        <motion.div
          className="shrink-0 pt-4 text-center text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <span className="text-muted-foreground">已有账号？</span>{" "}
          <motion.button
            type="button"
            onClick={onFlip}
            className="inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
            whileHover={{ x: 2 }}
            transition={springConfig.snappy}
          >
            立即登录
            <ArrowRight className="h-3 w-3" />
          </motion.button>
        </motion.div>
      </form>
    );
  }

  // Step 2: 设置密码
  return (
    <form onSubmit={handleRegister} className="flex h-full flex-col">
      {/* Header */}
      <StaggerContainer className="mb-4 shrink-0 text-center" delay={0.1}>
        <StaggerItem>
          <motion.div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20"
            whileHover={{ scale: 1.05, rotate: -5 }}
            transition={springConfig.snappy}
          >
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </motion.div>
        </StaggerItem>
        <StaggerItem>
          <h1 className="text-xl font-bold tracking-tight">设置密码</h1>
        </StaggerItem>
        <StaggerItem>
          <p className="text-xs text-muted-foreground">邮箱已验证：{email}</p>
        </StaggerItem>
      </StaggerContainer>

      <StaggerContainer
        className="flex flex-1 flex-col justify-center gap-3 overflow-y-auto pr-1"
        delay={0.2}
      >
        {/* Name Field */}
        <StaggerItem className="space-y-1.5">
          <Label htmlFor="reg-name" className="text-sm font-medium">
            用户名
          </Label>
          <Input
            id="reg-name"
            type="text"
            placeholder="您的用户名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={isLoading}
            className="h-11 border-input/50 bg-muted/30 transition-colors focus:border-primary focus:bg-background"
          />
        </StaggerItem>

        {/* Password Field */}
        <StaggerItem className="space-y-1.5">
          <Label htmlFor="reg-password" className="text-sm font-medium">
            密码
          </Label>
          <div className="relative">
            <Input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              placeholder="至少8位字符"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="new-password"
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

          {/* Password strength indicator */}
          {password && <PasswordStrengthIndicator password={password} />}
        </StaggerItem>

        {/* Confirm Password Field */}
        <StaggerItem className="space-y-1.5">
          <Label htmlFor="confirm-password" className="text-sm font-medium">
            确认密码
          </Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="new-password"
              className={cn(
                "h-11 border-input/50 bg-muted/30 pr-10 transition-colors focus:border-primary focus:bg-background",
                passwordsMatch &&
                "border-green-500/50 focus:border-green-500 focus:ring-green-500/20",
                passwordsMismatch &&
                "border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
              )}
            />
            <motion.button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
              whileTap={{ scale: 0.9 }}
              tabIndex={-1}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </motion.button>
          </div>

          {/* Match indicator */}
          <div className="h-5">
            <AnimatePresence mode="wait">
              {passwordsMatch && (
                <motion.p
                  key="match"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  密码一致
                </motion.p>
              )}
              {passwordsMismatch && !passwordsMatch && (
                <motion.p
                  key="mismatch"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  密码不一致
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Submit Button */}
      <motion.div
        className="mt-4 shrink-0"
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
            {isRegistering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                注册中...
              </>
            ) : (
              <>
                创建账号
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </motion.button>
        </Button>
      </motion.div>

      {/* Back Link */}
      <motion.div
        className="shrink-0 pt-4 text-center text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <motion.button
          type="button"
          onClick={() => setStep("verify")}
          className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
          whileHover={{ x: -2 }}
          transition={springConfig.snappy}
        >
          <ArrowRight className="h-3 w-3 rotate-180" />
          返回上一步
        </motion.button>
      </motion.div>
    </form>
  );
}

// --- Forgot Password Form Component ---
function ForgotPasswordForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);

  const { mutate: sendResetCode, isPending: isSending } = useForgotPassword();
  const { mutate: resetPassword, isPending: isResetting } = useResetPassword();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const passwordsMatch =
    newPassword === confirmPassword && confirmPassword !== "";
  const passwordsMismatch =
    confirmPassword !== "" && newPassword !== confirmPassword;

  const handleSendCode = () => {
    if (!email) {
      toast.error("请输入邮箱地址", { position: "top-center" });
      return;
    }

    sendResetCode(
      { email },
      {
        onSuccess: (data) => {
          setCountdown(data.resend_after);
          toast.success("验证码已发送", { position: "top-center" });
          setStep("reset");
        },
        onError: (err: Error) => {
          toast.error(err.message || "发送验证码失败", {
            position: "top-center",
          });
        },
      },
    );
  };

  const handleResetPassword = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!resetCode || resetCode.length !== 6) {
      toast.error("请输入6位验证码", { position: "top-center" });
      return;
    }

    if (newPassword.length < 6) {
      toast.error("密码长度至少需要6个字符", { position: "top-center" });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("两次输入的密码不一致", { position: "top-center" });
      return;
    }

    resetPassword(
      { email, code: resetCode, new_password: newPassword },
      {
        onSuccess: () => {
          setIsSuccess(true);
          setTimeout(() => {
            navigate("/login");
          }, 2000);
        },
        onError: (err: Error) => {
          toast.error(err.message || "重置密码失败", {
            position: "top-center",
          });
        },
      },
    );
  };

  const isLoading = isSending || isResetting;

  if (isSuccess) {
    return (
      <motion.div
        className="flex h-full flex-col items-center justify-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", ...springConfig.bouncy }}
      >
        <motion.div
          className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-green-500/20 to-green-500/5 ring-1 ring-green-500/30"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.1, ...springConfig.bouncy }}
        >
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </motion.div>
        <div className="text-center">
          <h2 className="text-xl font-semibold">密码重置成功！</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            正在返回登录页面...
          </p>
        </div>
      </motion.div>
    );
  }

  // Step 1: Enter email
  if (step === "email") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendCode();
        }}
        className="flex h-full flex-col"
      >
        <StaggerContainer className="mb-4 shrink-0 text-center" delay={0.1}>
          <StaggerItem>
            <motion.div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-amber-500/20 to-amber-500/5 ring-1 ring-amber-500/20"
              whileHover={{ scale: 1.05 }}
              transition={springConfig.snappy}
            >
              <KeyRound className="h-5 w-5 text-amber-500" />
            </motion.div>
          </StaggerItem>
          <StaggerItem>
            <h1 className="text-xl font-bold tracking-tight">忘记密码</h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-xs text-muted-foreground">
              输入您的邮箱地址以接收验证码
            </p>
          </StaggerItem>
        </StaggerContainer>

        <StaggerContainer
          className="flex flex-1 flex-col justify-center gap-4"
          delay={0.2}
        >
          <StaggerItem className="space-y-1.5">
            <Label htmlFor="forgot-email" className="text-sm font-medium">
              邮箱
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="forgot-email"
                type="email"
                placeholder={`name@${config.EMAIL_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
                className="h-11 border-input/50 bg-muted/30 pl-10 transition-colors focus:border-primary focus:bg-background"
              />
            </div>
          </StaggerItem>
        </StaggerContainer>

        <motion.div
          className="mt-6 shrink-0"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, type: "spring", ...springConfig.smooth }}
        >
          <Button
            type="submit"
            className="h-11 w-full shadow-lg shadow-amber-500/20 transition-shadow duration-200 hover:shadow-xl hover:shadow-amber-500/25"
            disabled={isLoading || !email}
            asChild
          >
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={springConfig.snappy}
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  发送中...
                </>
              ) : (
                <>
                  发送验证码
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </motion.button>
          </Button>
        </motion.div>

        <motion.div
          className="shrink-0 pt-4 text-center text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Link
            to="/login"
            className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            返回登录
          </Link>
        </motion.div>
      </form>
    );
  }

  // Step 2: Enter code + new password
  return (
    <form onSubmit={handleResetPassword} className="flex h-full flex-col">
      <StaggerContainer className="mb-4 shrink-0 text-center" delay={0.1}>
        <StaggerItem>
          <motion.div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-amber-500/20 to-amber-500/5 ring-1 ring-amber-500/20"
            whileHover={{ scale: 1.05 }}
            transition={springConfig.snappy}
          >
            <Lock className="h-5 w-5 text-amber-500" />
          </motion.div>
        </StaggerItem>
        <StaggerItem>
          <h1 className="text-xl font-bold tracking-tight">重置密码</h1>
        </StaggerItem>
        <StaggerItem>
          <p className="text-xs text-muted-foreground">验证码已发送至：{email}</p>
        </StaggerItem>
      </StaggerContainer>

      <StaggerContainer
        className="flex flex-1 flex-col justify-center gap-3 overflow-y-auto pr-1"
        delay={0.2}
      >
        <StaggerItem className="space-y-1.5">
          <Label className="text-sm font-medium">验证码</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <OTPInput
                length={6}
                value={resetCode}
                onChange={setResetCode}
                disabled={isLoading}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 px-4"
              disabled={isLoading || countdown > 0}
              onClick={handleSendCode}
            >
              {countdown > 0 ? `${countdown}s` : "重新发送"}
            </Button>
          </div>
        </StaggerItem>

        <StaggerItem className="space-y-1.5">
          <Label htmlFor="reset-password" className="text-sm font-medium">
            新密码
          </Label>
          <div className="relative">
            <Input
              id="reset-password"
              type={showPassword ? "text" : "password"}
              placeholder="至少6位字符"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="new-password"
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

          {newPassword && (
            <PasswordStrengthIndicator password={newPassword} />
          )}
        </StaggerItem>

        <StaggerItem className="space-y-1.5">
          <Label
            htmlFor="reset-confirm-password"
            className="text-sm font-medium"
          >
            确认密码
          </Label>
          <div className="relative">
            <Input
              id="reset-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="再次输入新密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="new-password"
              className={cn(
                "h-11 border-input/50 bg-muted/30 pr-10 transition-colors focus:border-primary focus:bg-background",
                passwordsMatch &&
                  "border-green-500/50 focus:border-green-500 focus:ring-green-500/20",
                passwordsMismatch &&
                  "border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
              )}
            />
            <motion.button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
              whileTap={{ scale: 0.9 }}
              tabIndex={-1}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </motion.button>
          </div>

          <div className="h-5">
            <AnimatePresence mode="wait">
              {passwordsMatch && (
                <motion.p
                  key="match"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  密码一致
                </motion.p>
              )}
              {passwordsMismatch && !passwordsMatch && (
                <motion.p
                  key="mismatch"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  密码不一致
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </StaggerItem>
      </StaggerContainer>

      <motion.div
        className="mt-4 shrink-0"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, type: "spring", ...springConfig.smooth }}
      >
        <Button
          type="submit"
          className="h-11 w-full shadow-lg shadow-amber-500/20 transition-shadow duration-200 hover:shadow-xl hover:shadow-amber-500/25"
          disabled={isLoading || resetCode.length !== 6}
          asChild
        >
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={springConfig.snappy}
          >
            {isResetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                重置中...
              </>
            ) : (
              <>
                重置密码
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </motion.button>
        </Button>
      </motion.div>

      <motion.div
        className="shrink-0 pt-4 text-center text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <button
          type="button"
          onClick={() => setStep("email")}
          className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          更换邮箱
        </button>
      </motion.div>
    </form>
  );
}

export default AuthPage;
