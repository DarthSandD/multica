/**
 * Agents browse page. Flat FlatList over the workspace's agents.
 *
 * Follows the Squads page pattern (`more/squads.tsx`): native Stack
 * header chrome comes from the parent `_layout.tsx`, body is a FlatList
 * with a skeleton loading state, an error state with retry, and an empty
 * state. Pull-to-refresh is kept for the cellular-edge case where a WS
 * reconnect missed events.
 *
 * Row: avatar (photo or initial) with a presence dot + name, with the
 * availability label as the secondary line — the figure the desktop
 * agents list leads with. Availability is derived from the list record
 * itself (no per-row presence subscription: that would mount one
 * subscription per visible row). Archived agents read "archived", not
 * "offline": they cannot take work, which is a lifecycle state, not a
 * transient runtime state. A missing `runtime_availability` reads as
 * offline — the agent has no reachable runtime to report.
 * List-only scope: rows do not navigate anywhere, since no agent detail
 * route exists on mobile yet.
 *
 * Sort: active agents first, then archived, each group by name ascending,
 * so the list reads like a directory instead of server insertion order.
 */
import { useMemo } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import type { Agent } from "@multica/core/types";
import type { AgentAvailability } from "@multica/core/agents";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { PresenceDot } from "@/components/ui/presence-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { agentListOptions } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";

function availabilityOf(agent: Agent): AgentAvailability {
  if (agent.archived_at) return "archived";
  return agent.runtime_availability ?? "offline";
}

export default function AgentsPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("more_agents");

  const { data, isLoading, error, refetch, isRefetching } = useQuery(
    agentListOptions(wsId),
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      const aArchived = a.archived_at ? 1 : 0;
      const bArchived = b.archived_at ? 1 : 0;
      if (aArchived !== bArchived) return aArchived - bArchived;
      return a.name.localeCompare(b.name);
    });
  }, [data]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      {isLoading ? (
        <AgentsLoading />
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
          renderItem={({ item }) => <AgentRow agent={item} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          contentContainerClassName="pb-6"
        />
      )}
    </SafeAreaView>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const { t } = useT("more_agents");
  const availability = availabilityOf(agent);
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <View className="relative">
        <Avatar className="size-10" alt={agent.name}>
          {agent.avatar_url ? (
            <AvatarImage source={{ uri: agent.avatar_url }} />
          ) : null}
          <AvatarFallback>
            <Text className="text-sm font-medium text-foreground">
              {agent.name.charAt(0).toUpperCase()}
            </Text>
          </AvatarFallback>
        </Avatar>
        <View className="absolute bottom-0 right-0">
          <PresenceDot availability={availability} size={10} />
        </View>
      </View>
      <View className="flex-1 gap-0.5">
        <Text
          className="text-base text-foreground font-medium"
          numberOfLines={1}
        >
          {agent.name}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {t(`availability.${availability}`)}
        </Text>
      </View>
    </View>
  );
}

/** Row skeleton mirrors the AgentRow layout (avatar circle + name band +
 *  availability band) so the eye sees a list-like structure instead of a
 *  centered spinner. */
function AgentsLoading() {
  return (
    <View className="pt-2">
      {Array.from({ length: 6 }).map((_, idx) => (
        <View key={idx} className="flex-row items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-16" />
          </View>
        </View>
      ))}
    </View>
  );
}
