"use client";

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
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface StateItem {
  state: string;
  count: number;
}

interface SeverityItem {
  severity: string;
  count: number;
}

const STATE_COLORS: Record<string, string> = {
  Installed: "hsl(142, 71%, 45%)",
  NotInstalled: "hsl(38, 92%, 50%)",
  Failed: "hsl(0, 84%, 60%)",
  Downloaded: "hsl(199, 89%, 48%)",
  Unknown: "hsl(215, 16%, 47%)",
  NotApplicable: "hsl(215, 20%, 75%)",
};

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "hsl(0, 84%, 60%)",
  Important: "hsl(25, 95%, 53%)",
  Moderate: "hsl(45, 93%, 47%)",
  Unspecified: "hsl(215, 16%, 57%)",
};

const stateChartConfig = {
  count: { label: "Records" },
} satisfies ChartConfig;

const severityChartConfig = {
  count: { label: "Patches" },
} satisfies ChartConfig;

export function DashboardCharts({
  stateData,
  severityData,
}: {
  stateData: StateItem[];
  severityData: SeverityItem[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Client Patch Installation States</CardTitle>
          <CardDescription>
            Distribution across {stateData.reduce((a, b) => a + b.count, 0).toLocaleString()} client-patch records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={stateChartConfig} className="h-[280px] w-full">
            <BarChart data={stateData} layout="vertical" margin={{ left: 16, right: 16 }}>
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
                {stateData.map((entry) => (
                  <Cell
                    key={entry.state}
                    fill={STATE_COLORS[entry.state] || "hsl(215, 16%, 57%)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patch Inventory by MSRC Severity</CardTitle>
          <CardDescription>
            Breakdown of {severityData.reduce((a, b) => a + b.count, 0).toLocaleString()} catalog updates
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <ChartContainer config={severityChartConfig} className="h-[230px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={severityData}
                dataKey="count"
                nameKey="severity"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
              >
                {severityData.map((entry) => (
                  <Cell
                    key={entry.severity}
                    fill={SEVERITY_COLORS[entry.severity] || "hsl(215, 16%, 57%)"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground mt-2">
            {severityData.map((s) => (
              <div key={s.severity} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      SEVERITY_COLORS[s.severity] || "hsl(215, 16%, 57%)",
                  }}
                />
                <span className="font-medium text-foreground">{s.severity}:</span>
                <span>{s.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
