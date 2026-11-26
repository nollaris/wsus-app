"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import { Badge } from "@workspace/ui/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/ui/chart";
import type { ClientPatchRow } from "./client-patches-table";
import {
  computeDeviceCompliance,
  getComplianceTier,
} from "../../_lib/wsus-compliance";

const STATE_COLORS: Record<string, string> = {
  Installed: "hsl(142, 71%, 45%)",
  NotInstalled: "hsl(38, 92%, 50%)",
  Failed: "hsl(0, 84%, 60%)",
  Downloaded: "hsl(199, 89%, 48%)",
  Unknown: "hsl(215, 16%, 47%)",
  NotApplicable: "hsl(215, 20%, 75%)",
};

const stateChartConfig = {
  count: { label: "Updates" },
} satisfies ChartConfig;

const scoreChartConfig = {
  value: { label: "Updates" },
} satisfies ChartConfig;

export interface ClientSummaryCounts {
  installedCount: number;
  notApplicableCount?: number;
  neededCount: number;
  failedCount: number;
  pendingRebootCount: number;
  unknownCount: number;
}

export function ClientComplianceCharts({
  patches,
  summaryCounts,
}: {
  patches: ClientPatchRow[];
  summaryCounts?: ClientSummaryCounts;
}) {
  const stats = useMemo(() => {
    const counts = new Map<string, number>();
    let approvedCount = 0;
    let notApprovedCount = 0;

    for (const p of patches) {
      counts.set(
        p.installationState,
        (counts.get(p.installationState) ?? 0) + 1
      );
      if (p.approvalAction === "Install") {
        approvedCount++;
      } else {
        notApprovedCount++;
      }
    }

    const hasSummaryCounts =
      summaryCounts !== undefined &&
      (summaryCounts.installedCount > 0 ||
        (summaryCounts.notApplicableCount ?? 0) > 0 ||
        summaryCounts.neededCount > 0 ||
        summaryCounts.failedCount > 0 ||
        summaryCounts.pendingRebootCount > 0 ||
        summaryCounts.unknownCount > 0);

    const patchInstalled = counts.get("Installed") ?? 0;
    const patchNotInstalled = counts.get("NotInstalled") ?? 0;
    const patchDownloaded = counts.get("Downloaded") ?? 0;
    const patchPendingReboot = counts.get("InstalledPendingReboot") ?? 0;
    const patchFailed = counts.get("Failed") ?? 0;
    const patchUnknown = counts.get("Unknown") ?? 0;
    const patchNotApplicable = counts.get("NotApplicable") ?? 0;

    const installed = hasSummaryCounts
      ? Math.max(summaryCounts.installedCount, patchInstalled)
      : patchInstalled;
    const notApplicable = hasSummaryCounts
      ? Math.max(summaryCounts.notApplicableCount ?? 0, patchNotApplicable)
      : patchNotApplicable;
    const pending = hasSummaryCounts
      ? summaryCounts.neededCount + summaryCounts.pendingRebootCount
      : patchNotInstalled + patchDownloaded + patchPendingReboot;
    const failed = hasSummaryCounts ? summaryCounts.failedCount : patchFailed;
    const unknown = patchUnknown;

    if (hasSummaryCounts) {
      if (installed > 0 && !counts.has("Installed")) {
        counts.set("Installed", installed);
      }
      if (notApplicable > 0 && !counts.has("NotApplicable")) {
        counts.set("NotApplicable", notApplicable);
      }
    }

    const { applicable, score, isFullyCompliant: computedFullyCompliant } =
      computeDeviceCompliance({
        installed,
        notApplicable,
        pending,
        failed,
        unknown,
      });
    const compliantTotal = installed + notApplicable;
    const nonCompliant = Math.max(0, applicable - compliantTotal);
    const isFullyCompliant = applicable > 0 && computedFullyCompliant;

    const stateOrder = [
      "Installed",
      "NotInstalled",
      "Downloaded",
      "InstalledPendingReboot",
      "Failed",
      "Unknown",
      "NotApplicable",
    ];

    const stateData = Array.from(counts.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => {
        const ia = stateOrder.indexOf(a.state);
        const ib = stateOrder.indexOf(b.state);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return b.count - a.count;
      });

    return {
      installed,
      compliantTotal,
      pending,
      failed,
      unknown,
      notApplicable,
      applicable,
      nonCompliant,
      score,
      isFullyCompliant,
      approvedCount,
      notApprovedCount,
      stateData,
    };
  }, [patches, summaryCounts]);

  const tier = getComplianceTier(stats.score);

  const gaugeData = useMemo(() => {
    if (stats.applicable === 0) {
      return [{ name: "Compliant", value: 1, fill: tier.color }];
    }
    return [
      { name: "Installed / N/A", value: stats.compliantTotal, fill: tier.color },
      {
        name: "Remaining",
        value: stats.nonCompliant,
        fill: "hsl(215, 20%, 88%)",
      },
    ];
  }, [stats.applicable, stats.compliantTotal, stats.nonCompliant, tier.color]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle>WSUS Compliance Score</CardTitle>
            <CardDescription>
              {stats.applicable > 0
                ? `${stats.compliantTotal.toLocaleString()} of ${stats.applicable.toLocaleString()} updates installed or not applicable`
                : "No applicable updates reported"}
            </CardDescription>
          </div>
          <Badge variant="secondary" className={tier.badgeClass}>
            {stats.isFullyCompliant ? "Fully Compliant" : tier.label}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <div className="relative flex items-center justify-center w-full">
            <ChartContainer
              config={scoreChartConfig}
              className="h-[200px] w-full max-w-[260px]"
            >
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => (
                        <span>
                          {name}: {Number(value).toLocaleString()}
                        </span>
                      )}
                    />
                  }
                />
                <Pie
                  data={gaugeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={88}
                  startAngle={90}
                  endAngle={-270}
                  strokeWidth={0}
                >
                  {gaugeData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold tabular-nums ${tier.textClass}`}>
                {stats.score.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">Compliance</span>
            </div>
          </div>

          <div className="mt-2 grid w-full grid-cols-3 gap-2 border-t pt-3 text-center text-xs">
            <div>
              <div className="text-muted-foreground">Pending</div>
              <div className="font-semibold tabular-nums">
                {stats.pending.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Failed</div>
              <div className="font-semibold tabular-nums text-destructive">
                {stats.failed.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Not Applicable</div>
              <div className="font-semibold tabular-nums text-muted-foreground">
                {stats.notApplicable.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              &gt;95% Compliant
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              80–95% Attention
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              &lt;80% Critical
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Update Status Breakdown</CardTitle>
          <CardDescription>
            Distribution across {patches.length.toLocaleString()} update records
            ({stats.approvedCount.toLocaleString()} approved,{" "}
            {stats.notApprovedCount.toLocaleString()} other)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.stateData.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              No update records found for this client.
            </div>
          ) : (
            <ChartContainer
              config={stateChartConfig}
              className="h-[260px] w-full"
            >
              <BarChart
                data={stats.stateData}
                layout="vertical"
                margin={{ left: 16, right: 24 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="state"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={100}
                  fontSize={12}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {stats.stateData.map((entry) => (
                    <Cell
                      key={entry.state}
                      fill={STATE_COLORS[entry.state] || "hsl(215, 16%, 57%)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
