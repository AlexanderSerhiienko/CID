import { cn } from "@/lib/utils";

const toneClass = {
  neutral: "bg-muted text-foreground",
  green: "bg-emerald-100 text-emerald-900",
  yellow: "bg-amber-100 text-amber-900",
  red: "bg-rose-100 text-rose-900",
  blue: "bg-sky-100 text-sky-900"
};

export function Badge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClass;
}) {
  return (
    <span className={cn("inline-flex rounded px-2 py-1 text-xs font-medium", toneClass[tone])}>
      {children}
    </span>
  );
}

