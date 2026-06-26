import { memo, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTestSMTPConnection } from "@/hooks/api";
import type { SMTPTestRequest } from "@/lib/api/types";

interface SmtpTestActionProps {
  form: Record<string, unknown>;
}

export const SmtpTestAction = memo(function SmtpTestAction({
  form,
}: SmtpTestActionProps) {
  const testSMTP = useTestSMTPConnection();
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function testConnection() {
    const password = String(form.smtp_password ?? "");
    if (!password) {
      toast.error("请填写 SMTP 密码后再测试连接");
      return;
    }

    const request: SMTPTestRequest = {
      host: String(form.smtp_host ?? ""),
      port: Number(form.smtp_port || 587),
      username: String(form.smtp_username ?? ""),
      password,
      use_tls: Boolean(form.smtp_use_tls),
      from_email: String(form.smtp_from_email || form.smtp_username || ""),
    };

    setResult(null);
    const response = await testSMTP.mutateAsync(request);
    setResult({ success: response.data, message: response.test_message });
    toast[response.data ? "success" : "error"](
      response.data ? "SMTP 连接测试成功" : "SMTP 连接测试失败",
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={testSMTP.isPending}
          onClick={testConnection}
          className="gap-1.5"
        >
          {testSMTP.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FlaskConical className="size-3.5" />
          )}
          测试 SMTP 连接
        </Button>
        <p className="text-xs text-muted-foreground">
          出于安全考虑，已保存的密码不会回显。测试前请在 SMTP
          密码字段中输入密码。
        </p>
      </div>
      {result ? (
        <Alert variant={result.success ? "default" : "destructive"}>
          <AlertTitle>{result.success ? "测试成功" : "测试失败"}</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
});
