/**
 * Autopilots browse page. Flat FlatList over the workspace's autopilots.
 *
 * Mirrors web `packages/views/autopilots/components/autopilots-page.tsx`:
 * title, status, enabled trigger kinds, last-run status + time, and next
 * run. List scope only — no detail route, no create/edit/trigger actions
 * (those live in the autopilot dialog on desktop and are out of scope).
 *
 * Title lives in the native iOS Stack header via Stack.Screen (same
 * override pattern as more/projects.tsx). The quota line at top is a
 * separate, independent query: it hides on error or when quota is off so
 * a quota failure never blocks the list.
 *
 * Sort: client-side by `updated_at` desc — most recently touched at top,
 * mirroring more/projects.tsx.
 */
import { useMemo } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  autopilotListOptions,
  autopilotQuotaUsageOptions,
  type AutopilotListItem,
} from "@/data/queries/autopilots";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT, useTimeAgo } from "@/lib/i18n";

const KNOWN_STATUSES = ["active", "paused", "archived"] as const;
const KNOWN_TRIGGER_KINDS = ["schedule", "webhook", "api"] as const;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusDotClass(status: string): string {
  if (status === "active") return "bg-success";
  if (status === "paused") return "bg-warning";
  return "bg-muted-foreground/40";
}

export default function AutopilotsPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("more_autopilots");

  const { data, isLoading, error, refetch, isRefetching } = useQuery(
    autopilotListOptions(wsId),
  );
  const quotaQuery = useQuery(autopilotQuotaUsageOptions(wsId));

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }, [data]);

  const quota = quotaQuery.data;
  // Narrowed in one expression so used/limit are numbers below.
  const quotaText =
    quota &&
    quota.action !== "off" &&
    quota.used != null &&
    quota.limit != null
      ? quota.reached
        ? t("quota.reached")
        : t("quota.used", { used: quota.used, limit: quota.limit })
      : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <Stack.Screen options={{ title: t("list.title") }} />

      {isLoading ? (
        <AutopilotsLoading />
      ) : error ? (
        <View className="px-4 gap-3 pt-4">
          <Text className="text-sm text-destructive">
            {t("errors.load_failed", {
              message: error instanceof Error ? error.message : "unknown",
            })}
          </Text>
          <Button variant="outline" onPress={() => refetch()}>
            <Text>{t("common:actions.retry")}</Text>
          </Button>
        </View>
      ) : sorted.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-muted-foreground text-center">
            {t("list.empty")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => (
            <View className="h-px bg-border ml-4" />
          )}
          ListHeaderComponent={
            quotaText ? (
              <View className="px-4 py-3 border-b border-border">
                <Text className="text-sm text-muted-foreground">
                  {quotaText}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => <AutopilotRow item={item} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                void refetch();
                void quotaQuery.refetch();
              }}
            />
          }
          contentContainerClassName="pb-6"
        />
      )}
    </SafeAreaView>
  );
}

function AutopilotRow({ item }: { item: AutopilotListItem }) {
  const { t } = useT("more_autopilots");
  const timeAgo = useTimeAgo();

  // Server-driven strings render through a generic fallback, never an
  // exhaustive switch (packages/core/types/autopilot.ts).
  const statusLabel = (KNOWN_STATUSES as readonly string[]).includes(
    item.status,
  )
    ? t(`status.${item.status}`)
    : item.status;
  const kindLabels = (item.trigger_kinds ?? [])
    .map((kind) =>
      (KNOWN_TRIGGER_KINDS as readonly string[]).includes(kind)
        ? t(`trigger.${kind}`)
        : kind,
    )
    .join(" · ");
  const timing = item.next_run_at
    ? t("row.next_run", { date: formatDateTime(item.next_run_at) })
    : item.last_run_at
      ? t("row.last_run", { date: timeAgo(item.last_run_at) })
      : t("row.never_run");
  const secondary = [statusLabel, kindLabels, timing]
    .filter((part) => part.length > 0)
    .join(" · ");

  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <View
        className={`size-2.5 shrink-0 rounded-full ${statusDotClass(item.status)}`}
      />
      <View className="flex-1 min-w-0">
        <Text className="text-base text-foreground" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="text-sm text-muted-foreground" numberOfLines={1}>
          {secondary}
        </Text>
      </View>
    </View>
  );
}

function AutopilotsLoading() {
  return (
    <View className="pt-2">
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <View
          key={rowIdx}
          className="flex-row items-center gap-3 px-4 py-3"
        >
          <Skeleton className="size-2.5 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </View>
        </View>
      ))}
    </View>
  );
}
