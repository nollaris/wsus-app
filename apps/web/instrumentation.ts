export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWsusApprovalScheduler } = await import(
      "@/lib/wsus-approval-scheduler"
    );
    startWsusApprovalScheduler();
  }
}
