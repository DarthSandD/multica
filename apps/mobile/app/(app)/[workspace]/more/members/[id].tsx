/**
 * Member detail screen, v1. No single-member fetch: the member is found
 * in the existing workspace member list query (`memberListOptions`) by
 * the route id, so this screen shows exactly what the list already
 * carries: avatar, name, email, role badge, and joined date
 * (`created_at` on the list record).
 *
 * Actions mirror the web members tab
 * (`packages/views/settings/components/members-tab.tsx`), with the same
 * guards:
 *   canManage = current member is owner or admin
 *   canManageOwners = current member is owner
 *   canEditRole / canRemove = canManage && !isSelf &&
 *     (target role is not owner || canManageOwners)
 *   last-owner demotion is blocked: demoting the only owner is disabled,
 *   per the server rule the web tab cites (`workspace.go:497-507`).
 * Role change is an inline picker (owner/admin/member rows); owner is
 * offered only to owners. Removal asks a native confirm alert first and
 * awaits the server before navigating back. No invite management here.
 *
 * Route registration (`Stack.Screen name="more/members/[id]"`) lives in
 * the parent `_layout.tsx`.
 */
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { MemberRole, MemberWithUser } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { memberListOptions } from "@/data/queries/members";
import {
  useRemoveMember,
  useUpdateMemberRole,
} from "@/data/mutations/members";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export default function MemberDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const { data, isLoading, error, refetch } = useQuery(
    memberListOptions(wsId),
  );
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const busy = updateRole.isPending || removeMember.isPending;

  const members = data ?? [];
  const member = members.find((m) => m.id === id);
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const ownerCount = members.filter((m) => m.role === "owner").length;

  const canManage =
    currentMember?.role === "owner" || currentMember?.role === "admin";
  const canManageOwners = currentMember?.role === "owner";
  const isSelf = !!member && member.user_id === currentUserId;
  const canEditRole =
    !!member &&
    canManage &&
    !isSelf &&
    (member.role !== "owner" || canManageOwners);
  // Web gives remove the same formula as role edit (members-tab.tsx
  // canEditRole / canRemove), so the two guards coincide here too.
  const canRemove =
    !!member &&
    canManage &&
    !isSelf &&
    (member.role !== "owner" || canManageOwners);
  const isLastOwner = !!member && member.role === "owner" && ownerCount <= 1;

  const handleRoleChange = async (role: MemberRole) => {
    if (!member || role === member.role) return;
    try {
      await updateRole.mutateAsync({ memberId: member.id, role });
    } catch (e) {
      Alert.alert(
        "Could not change role",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  const handleRemove = () => {
    if (!member) return;
    Alert.alert(
      "Remove member?",
      `Remove ${displayName(member)} from this workspace?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              // Await the server before navigating away: removal is not
              // optimistic, so a failed delete must leave this screen up.
              await removeMember.mutateAsync(member.id);
              router.back();
            } catch (e) {
              Alert.alert(
                "Could not remove member",
                e instanceof Error ? e.message : "Unknown error",
              );
            }
          },
        },
      ],
    );
  };

  const title = member ? displayName(member) : "Member";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <Stack.Screen
        options={{ title, headerBackTitle: "Back" }}
      />
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : error || !member ? (
        <View className="flex-1 items-center justify-center px-6 gap-3">
          <Text className="text-sm text-destructive text-center">
            {error instanceof Error
              ? error.message
              : "Member not found"}
          </Text>
          {error ? (
            <Button variant="outline" onPress={() => refetch()}>
              <Text>Retry</Text>
            </Button>
          ) : (
            <Button variant="outline" onPress={() => router.back()}>
              <Text>Back</Text>
            </Button>
          )}
        </View>
      ) : (
        <ScrollView contentContainerClassName="pb-10">
          <View className="items-center gap-2 px-4 pt-6 pb-4">
            <Avatar className="size-20" alt={title}>
              {member.avatar_url ? (
                <AvatarImage source={{ uri: member.avatar_url }} />
              ) : null}
              <AvatarFallback>
                <Text className="text-xl font-medium text-foreground">
                  {title.charAt(0).toUpperCase()}
                </Text>
              </AvatarFallback>
            </Avatar>
            <Text className="text-lg font-medium text-foreground text-center">
              {title}
              {isSelf ? " (You)" : ""}
            </Text>
            <Text className="text-sm text-muted-foreground text-center">
              {member.email}
            </Text>
            <View className="rounded-full border border-border px-3 py-1">
              <Text className="text-xs text-foreground">
                {ROLE_LABELS[member.role]}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground">
              Joined{" "}
              {new Date(member.created_at).toLocaleDateString()}
            </Text>
          </View>

          {canEditRole ? (
            <View className="px-4 pt-2 gap-1">
              <Text className="text-sm font-medium text-foreground pb-1">
                Change role
              </Text>
              {(Object.keys(ROLE_LABELS) as MemberRole[])
                .filter((role) => role !== "owner" || canManageOwners)
                .map((role) => {
                  const isCurrent = member.role === role;
                  const wouldDemoteLastOwner =
                    isLastOwner && role !== "owner";
                  const disabled = busy || isCurrent || wouldDemoteLastOwner;
                  return (
                    <Pressable
                      key={role}
                      onPress={() => void handleRoleChange(role)}
                      disabled={disabled}
                      accessibilityRole="button"
                      className={`flex-row items-center justify-between rounded-md border border-border px-4 py-3 active:bg-accent ${disabled ? "opacity-50" : ""}`}
                    >
                      <View className="gap-0.5">
                        <Text className="text-base text-foreground">
                          {ROLE_LABELS[role]}
                        </Text>
                        {wouldDemoteLastOwner ? (
                          <Text className="text-xs text-muted-foreground">
                            Cannot demote the last owner
                          </Text>
                        ) : null}
                      </View>
                      {isCurrent ? (
                        <Text className="text-sm text-muted-foreground">
                          Current
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
            </View>
          ) : null}

          {canRemove ? (
            <View className="px-4 pt-6">
              <Button
                variant="destructive"
                disabled={busy}
                onPress={handleRemove}
              >
                <Text>Remove member</Text>
              </Button>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Same fallback as the list row: schema defaults `name` to "", so an
 *  unset display name renders as the email, never blank. */
function displayName(member: MemberWithUser): string {
  return member.name || member.email;
}
