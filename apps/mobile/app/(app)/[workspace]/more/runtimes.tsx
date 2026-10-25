/**
 * Runtimes browse page. Flat FlatList over the workspace's runtimes.
 *
 * Title lives in the native iOS Stack header (declared via Stack.Screen
 * options in parent `_layout.tsx`, as for more/issues and more/projects).
 * Rendering an in-body title row on top of the native bar would stack two
 * "Runtimes" labels vertically.
 *
 * List-only scope: rows are not pressable — there is no runtime detail
 * route on mobile yet. The More-menu entry and the Stack.Screen title are
 * added in the coordinator's merge pass (layout + dropdown are outside
 * this change's scope).
 *
 * Row content mirrors the desktop runtime list
 * (`packages/views/runtimes/components/runtime-list.tsx`): display name
 * (custom alias when set, via `runtimeDisplayName`), a presence dot, and
 * a status line — health label, plus last-seen time when the runtime is
 * not online. The dot uses `deriveAgentAvailability`, the same pure
 * derivation web/desktop/mobile presence uses, so the three-state
 * (online / unstable / offline) semantics agree across clients.
 *
 * Sort: client-side by display name ascending — a directory list, not a
 * recency feed, so alphabetical order is the predictable default.
 */
import { useMemo } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import type { RuntimeDevice } from "@multica/core/types";
import { deriveAgentAvailability } from "@multica/core/agents";
import { runtimeDisplayName } from "@multica/core/runtimes";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { PresenceDot } from "@/components/ui/presence-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { runtimeListOptions } from "@/data/queries/runtimes";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT, useTimeAgo } from "@/lib/i18n";

export default function RuntimesPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("more_runtimes");

  const { data, isLoading, error, refetch, isRefetching } = useQuery(
    runtimeListOptions(wsId),
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) =>
      runtimeDisplayName(a).localeCompare(runtimeDisplayName(b)),
    );
  }, [data]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      {isLoading ? (
        <RuntimesLoading />
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
          renderItem={({ item }) => <RuntimeRow runtime={item} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          contentContainerClassName="pb-6"
        />
      )}
    </SafeAreaView>
  );
}

function RuntimeRow({ runtime }: { runtime: RuntimeDevice }) {
  const { t } = useT("more_runtimes");
  const timeAgo = useTimeAgo();

  // Availability is derived per render, not ticked: a refetch (or
  // pull-to-refresh) recomputes it, which is enough for a browse list.
  const availability = deriveAgentAvailability(runtime, Date.now());
  const statusLabel = t(`status.${availability}`);
  const lastSeen = runtime.last_seen_at
    ? timeAgo(runtime.last_seen_at)
    : null;
  const secondary =
    availability === "online" || !lastSeen
      ? statusLabel
      : `${statusLabel} · ${lastSeen}`;

  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <PresenceDot availability={availability} size={10} />
      <View className="flex-1 gap-1 min-w-0">
        <Text
          className="text-base text-foreground font-medium"
          numberOfLines={1}
        >
          {runtimeDisplayName(runtime)}
        </Text>
        <Text className="text-sm text-muted-foreground" numberOfLines={1}>
          {secondary}
        </Text>
      </View>
    </View>
  );
}

// Loading skeleton mirroring the row layout (dot + name band + status band)
// so the eye sees a list-like structure instead of a centered spinner.
function RuntimesLoading() {
  return (
    <View className="pt-2">
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <View
          key={rowIdx}
          className="flex-row items-center gap-3 px-4 py-3"
        >
          <Skeleton className="size-2.5 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </View>
        </View>
      ))}
    </View>
  );
}
