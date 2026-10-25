/**
 * Members browse page. Flat FlatList over the workspace's members.
 *
 * Follows the Projects page pattern (`more/projects.tsx`): native Stack
 * header chrome comes from the parent `_layout.tsx` (title registration
 * lands with the coordinator's merge pass), body is a FlatList with a
 * skeleton loading state, an error state with retry, and an empty state.
 * Pull-to-refresh is kept for the cellular-edge case where a WS reconnect
 * missed events.
 *
 * Row: avatar (photo or initial) + name, with the workspace role as the
 * secondary line — mirrors the desktop member list, which badges each
 * member's role. List-only scope: rows do not navigate anywhere, since
 * no member detail route exists on mobile yet.
 *
 * Sort: client-side by display name ascending, so the list reads like a
 * directory instead of server insertion order.
 */
import { useMemo } from "react";
import {
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import type { MemberWithUser } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { memberListOptions } from "@/data/queries/members";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";

export default function MembersPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("more_members");

  const { data, isLoading, error, refetch, isRefetching } = useQuery(
    memberListOptions(wsId),
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) =>
      displayName(a).localeCompare(displayName(b)),
    );
  }, [data]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      {isLoading ? (
        <MembersLoading />
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
          renderItem={({ item }) => <MemberRow member={item} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          contentContainerClassName="pb-6"
        />
      )}
    </SafeAreaView>
  );
}

/** Schema defaults `name` to "" — fall back to email so a row never
 *  renders blank for a member whose display name is unset. */
function displayName(member: MemberWithUser): string {
  return member.name || member.email;
}

function MemberRow({ member }: { member: MemberWithUser }) {
  const { t } = useT("more_members");
  const name = displayName(member);
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Avatar className="size-10" alt={name}>
        {member.avatar_url ? (
          <AvatarImage source={{ uri: member.avatar_url }} />
        ) : null}
        <AvatarFallback>
          <Text className="text-sm font-medium text-foreground">
            {name.charAt(0).toUpperCase()}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 gap-0.5">
        <Text
          className="text-base text-foreground font-medium"
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {t(`role.${member.role}`)}
        </Text>
      </View>
    </View>
  );
}

/** Row skeleton mirrors the MemberRow layout (avatar circle + name band +
 *  role band) so the eye sees a list-like structure instead of a
 *  centered spinner. */
function MembersLoading() {
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
