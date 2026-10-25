/**
 * Squads browse page. Flat FlatList over the workspace's squads.
 *
 * Follows the Projects page pattern (`more/projects.tsx`): native Stack
 * header chrome comes from the parent `_layout.tsx` (title registration
 * lands with the coordinator's merge pass), body is a FlatList with a
 * skeleton loading state, an error state with retry, and an empty state.
 * Pull-to-refresh is kept for the cellular-edge case where a WS reconnect
 * missed events.
 *
 * Row: avatar (photo or initial) + name, with the member count as the
 * secondary line — the figure the desktop squad list leads with.
 * `member_count` is optional on the wire; when the server omits it, the
 * preview list length is the fallback, and when neither is present the
 * secondary line is omitted rather than showing a guessed zero.
 * List-only scope: rows do not navigate anywhere, since no squad detail
 * route exists on mobile yet.
 *
 * Sort: client-side by name ascending, so the list reads like a directory
 * instead of server insertion order.
 */
import { useMemo } from "react";
import {
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import type { Squad } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { squadListOptions } from "@/data/queries/squads";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";

export default function SquadsPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("more_squads");

  const { data, isLoading, error, refetch, isRefetching } = useQuery(
    squadListOptions(wsId),
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      {isLoading ? (
        <SquadsLoading />
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
          renderItem={({ item }) => <SquadRow squad={item} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          contentContainerClassName="pb-6"
        />
      )}
    </SafeAreaView>
  );
}

function SquadRow({ squad }: { squad: Squad }) {
  const { t } = useT("more_squads");
  const count = squad.member_count ?? squad.member_preview?.length;
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Avatar className="size-10" alt={squad.name}>
        {squad.avatar_url ? (
          <AvatarImage source={{ uri: squad.avatar_url }} />
        ) : null}
        <AvatarFallback>
          <Text className="text-sm font-medium text-foreground">
            {squad.name.charAt(0).toUpperCase()}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 gap-0.5">
        <Text
          className="text-base text-foreground font-medium"
          numberOfLines={1}
        >
          {squad.name}
        </Text>
        {count !== undefined ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {t("list.member_count", { count })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Row skeleton mirrors the SquadRow layout (avatar circle + name band +
 *  count band) so the eye sees a list-like structure instead of a
 *  centered spinner. */
function SquadsLoading() {
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
