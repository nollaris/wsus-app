import { Loader2, ShieldCheck } from "lucide-react";

export default function GlobalLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading WSUS Portal...</span>
      </div>
    </div>
  );
}
