/**
 * Usage summary page. Headline figures + per-agent rollup for the last 30
 * days, mirroring the desktop Usage page's KPI cards
 * (packages/views/dashboard/components/dashboard-page.tsx): Cost, Tokens,
 * Run time, Tasks — followed by the per-agent leaderboard.
 *
 * Divergences from desktop, both documented in data/queries/usage.ts and
 * here because they change the numbers:
 *   - Cost sums the wire's provider-reported `cost_usd_ticks` (1 tick =
 *     1e-10 USD). Desktop instead re-prices every row through its model
 *     pricing table, so the two totals differ on unpriced models; the
 *     card hint says priced rows only.
 *   - No timezone is sent, so day buckets use the server default instead
 *     of the viewer's calendar.
 *   - Charts are out of scope for a summary screen; the trend lives on
 *     desktop. The per-agent list is sorted by total tokens desc, like
 *     the desktop leaderboard.
 *
 * Title lives in the native iOS Stack header via Stack.Screen (same
 * override pattern as more/projects.tsx). All three rollups feed the
 * headline figures, so any one failing shows the error state with retry
 * rather than a half-computed summary.
 */
import { useMemo } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { agentListOptions } from "@/data/queries/agents";
import {
  USAGE_DAYS,
  usageAgentRunTimeOptions,
  usageByAgentOptions,
  usageDailyOptions,
  type DashboardUsageByAgentRow,
} from "@/data/queries/usage";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";

/** 1 tick = 1e-10 USD (packages/core/types/agent.ts). */
const USD_PER_TICK = 1e-10;

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return "<1m";
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

interface AgentRow {
  agentId: string;
  tokens: number;
  costUsd: number;
  hasPricedRows: boolean;
  tasks: number;
}

export default function UsagePage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("more_usage");

  const dailyQuery = useQuery(usageDailyOptions(wsId));
  const byAgentQuery = useQuery(usageByAgentOptions(wsId));
  const runTimeQuery = useQuery(usageAgentRunTimeOptions(wsId));
  const agentsQuery = useQuery(agentListOptions(wsId));

  const isLoading =
    dailyQuery.isLoading ||
    byAgentQuery.isLoading ||
    runTimeQuery.isLoading;
  const error =
    dailyQuery.error ?? byAgentQuery.error ?? runTimeQuery.error;
  const isRefetching =
    dailyQuery.isRefetching ||
    byAgentQuery.isRefetching ||
    runTimeQuery.isRefetching;

  const refetchAll = () => {
    void dailyQuery.refetch();
    void byAgentQuery.refetch();
    void runTimeQuery.refetch();
  };

  const totals = useMemo(() => {
    const daily = dailyQuery.data ?? [];
    let input = 0;
    let output = 0;
    let tokens = 0;
    let costTicks = 0;
    let hasPricedRows = false;
    for (const row of daily) {
      input += row.input_tokens;
      output += row.output_tokens;
      tokens +=
        row.input_tokens +
        row.output_tokens +
        row.cache_read_tokens +
        row.cache_write_tokens;
      if (row.cost_usd_ticks != null) {
        costTicks += row.cost_usd_ticks;
        hasPricedRows = true;
      }
    }
    const runTime = runTimeQuery.data ?? [];
    let totalSeconds = 0;
    let tasks = 0;
    let failed = 0;
    for (const row of runTime) {
      totalSeconds += row.total_seconds;
      tasks += row.task_count;
      failed += row.failed_count;
    }
    return {
      input,
      output,
      tokens,
      costUsd: costTicks * USD_PER_TICK,
      hasPricedRows,
      totalSeconds,
      tasks,
      failed,
    };
  }, [dailyQuery.data, runTimeQuery.data]);

  // Fold per-(agent, model) rows by agent, mirroring the desktop
  // aggregateAgentTokens fold. Agent names resolve through the existing
  // agents query; unknown ids fall back to the id itself via the
  // "unknown agent" label only when no id is present.
  const agentRows = useMemo<AgentRow[]>(() => {
    const byAgent = byAgentQuery.data ?? [];
    const folded = new Map<string, AgentRow>();
    const add = (row: DashboardUsageByAgentRow) => {
      const entry = folded.get(row.agent_id) ?? {
        agentId: row.agent_id,
        tokens: 0,
        costUsd: 0,
        hasPricedRows: false,
        tasks: 0,
      };
      entry.tokens +=
        row.input_tokens +
        row.output_tokens +
        row.cache_read_tokens +
        row.cache_write_tokens;
      if (row.cost_usd_ticks != null) {
        entry.costUsd += row.cost_usd_ticks * USD_PER_TICK;
        entry.hasPricedRows = true;
      }
      entry.tasks += row.task_count;
      folded.set(row.agent_id, entry);
    };
    for (const row of byAgent) add(row);
    return [...folded.values()].sort((a, b) => b.tokens - a.tokens);
  }, [byAgentQuery.data]);

  const agentNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agentsQuery.data ?? []) map.set(agent.id, agent.name);
    return map;
  }, [agentsQuery.data]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <Stack.Screen options={{ title: t("list.title") }} />

      {isLoading ? (
        <UsageLoading />
      ) : error ? (
        <View className="px-4 gap-3 pt-4">
          <Text className="text-sm text-destructive">
            {t("errors.load_failed", {
              message: error instanceof Error ? error.message : "unknown",
            })}
          </Text>
          <Button variant="outline" onPress={refetchAll}>
            <Text>{t("common:actions.retry")}</Text>
          </Button>
        </View>
      ) : (
        <FlatList
          data={agentRows}
          keyExtractor={(item) => item.agentId}
          ItemSeparatorComponent={() => (
            <View className="h-px bg-border ml-4" />
          )}
          ListHeaderComponent={
            <View>
              <Text className="px-4 pt-3 text-sm text-muted-foreground">
                {t("period.days", { days: USAGE_DAYS })}
              </Text>
              <View className="flex-row flex-wrap px-2 pt-2 pb-1">
                <SummaryCard
                  label={t("summary.tokens")}
                  value={formatCompact(totals.tokens)}
                  hint={t("summary.tokens_hint", {
                    input: formatCompact(totals.input),
                    output: formatCompact(totals.output),
                  })}
                />
                <SummaryCard
                  label={t("summary.cost")}
                  value={
                    totals.hasPricedRows ? formatUsd(totals.costUsd) : "—"
                  }
                  hint={t("summary.cost_hint")}
                />
                <SummaryCard
                  label={t("summary.run_time")}
                  value={formatDuration(totals.totalSeconds)}
                  hint={t("summary.run_time_hint", {
                    tasks: totals.tasks,
                  })}
                />
                <SummaryCard
                  label={t("summary.tasks")}
                  value={String(totals.tasks)}
                  hint={t("summary.tasks_hint", {
                    failed: totals.failed,
                  })}
                />
              </View>
              <Text className="px-4 pt-3 pb-1 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {t("list.by_agent")}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center px-6 pt-12">
              <Text className="text-sm text-muted-foreground text-center">
                {t("list.empty")}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="px-4 py-3">
              <Text className="text-base text-foreground" numberOfLines={1}>
                {agentNames.get(item.agentId) ?? item.agentId}
              </Text>
              <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                {[
                  t("row.tokens", { count: formatCompact(item.tokens) }),
                  item.hasPricedRows
                    ? formatUsd(item.costUsd)
                    : t("row.unpriced"),
                  t("row.tasks", { count: item.tasks }),
                ].join(" · ")}
              </Text>
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />
          }
          contentContainerClassName="pb-6"
        />
      )}
    </SafeAreaView>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <View className="w-1/2 p-1">
      <View className="border border-border rounded-lg p-3 gap-1 bg-secondary/40">
        <Text className="text-xs text-muted-foreground">{label}</Text>
        <Text className="text-lg font-semibold text-foreground">{value}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {hint}
        </Text>
      </View>
    </View>
  );
}

function UsageLoading() {
  return (
    <View className="pt-2">
      <View className="flex-row flex-wrap px-2">
        {Array.from({ length: 4 }).map((_, idx) => (
          <View key={idx} className="w-1/2 p-1">
            <View className="border border-border rounded-lg p-3 gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-20" />
            </View>
          </View>
        ))}
      </View>
      {Array.from({ length: 4 }).map((_, rowIdx) => (
        <View key={rowIdx} className="px-4 py-3 gap-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </View>
      ))}
    </View>
  );
}
