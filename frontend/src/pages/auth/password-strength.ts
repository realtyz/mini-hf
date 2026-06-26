export interface PasswordRequirement {
  met: boolean;
  text: string;
}

export interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  textColor: string;
  requirements: PasswordRequirement[];
}

export function getPasswordStrength(password: string): PasswordStrength {
  const requirements = [
    { met: password.length >= 8, text: "至少8个字符" },
    {
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
      text: "包含大小写字母",
    },
    { met: /\d/.test(password), text: "包含数字" },
    { met: /[^a-zA-Z0-9]/.test(password), text: "包含特殊字符" },
  ];

  const score = requirements.filter((r) => r.met).length;

  const levels = [
    {
      label: "太弱",
      color: "bg-red-500",
      textColor: "text-red-600 dark:text-red-400",
    },
    {
      label: "弱",
      color: "bg-orange-500",
      textColor: "text-orange-600 dark:text-orange-400",
    },
    {
      label: "一般",
      color: "bg-yellow-500",
      textColor: "text-yellow-600 dark:text-yellow-400",
    },
    {
      label: "强",
      color: "bg-blue-500",
      textColor: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "非常强",
      color: "bg-green-500",
      textColor: "text-green-600 dark:text-green-400",
    },
  ];

  return { score, ...levels[score], requirements };
}
