import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  colorClass?: string;
}

export function StatCard({ icon, label, value, colorClass }: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "size-9 rounded-lg flex items-center justify-center bg-muted/50",
              colorClass,
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-lg font-bold truncate tabular-nums">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
