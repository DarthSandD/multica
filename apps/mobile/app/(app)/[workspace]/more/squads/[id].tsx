/**
 * Squad detail page, v1.
 *
 * Profile card: avatar + name, description, leader, member count, and the
 * member preview list. The member list is read-only in v1: no member
 * add/remove, no role change, no leader change, and no delete action.
 * The only write action is Rename, which sends the new name via
 * `api.updateSquad` (PUT /api/squads/{id}) and refreshes the squad caches.
 *
 * Names are not part of the squad payload: GET /api/squads/{id} returns
 * only `leader_id` and a preview of `{ member_type, member_id, role }`
 * (capped at 3 entries server-side). Leader and preview names are
 * resolved from the already-merged workspace agent and member lists;
 * when a lookup misses, the row shows a plain fallback ("Unknown leader",
 * "Agent" / "Member") instead of an invented name.
 *
 * Labels are plain English strings, not locale keys: no new locale keys
 * were added for this screen, and no locale file was touched.
 *
 * The rename mutation is inline here; moving it to
 * data/mutations/squads.ts is a follow-up.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Squad, SquadMemberPreview } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { api } from "@/data/api";
import { squadDetailOptions } from "@/data/queries/squads";
import { agentListOptions } from "@/data/queries/agents";
import { memberListOptions } from "@/data/queries/members";
import { useWorkspaceStore } from "@/data/workspace-store";

export default function SquadDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const qc = useQueryClient();

  const detail = useQuery(squadDetailOptions(wsId, id));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const rename = useMutation({
    mutationFn: (name: string) => api.updateSquad(id, { name }),
    onSuccess: async () => {
      // Detail key nests under the ["squads", wsId] prefix, so one
      // invalidation refreshes both the detail and the list caches.
      await qc.invalidateQueries({ queryKey: ["squads", wsId] });
      setEditing(false);
    },
  });

  const squad = detail.data;
  // A drifted / not-found response parses to an empty id, mirroring the
  // project detail screen's EMPTY_PROJECT check.
  const squadMissing = !squad || squad.id === "";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : detail.error ? (
        <View className="px-4 gap-3 pt-4">
          <Text className="text-sm text-destructive">
            Failed to load squad:{" "}
            {detail.error instanceof Error
              ? detail.error.message
              : "unknown"}
          </Text>
          <Button variant="outline" onPress={() => detail.refetch()}>
            <Text>Retry</Text>
          </Button>
        </View>
      ) : squadMissing ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-muted-foreground text-center">
            Squad not found.
          </Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={detail.isRefetching}
              onRefresh={() => detail.refetch()}
            />
          }
          contentContainerClassName="pb-6"
        >
          <SquadProfileCard
            squad={squad}
            leaderName={
              agents.find((a) => a.id === squad.leader_id)?.name ??
              (squad.leader_id ? "Unknown leader" : "No leader")
            }
            editing={editing}
            draft={draft}
            onStartRename={() => {
              setDraft(squad.name);
              setEditing(true);
            }}
            onDraftChange={setDraft}
            onCancelRename={() => setEditing(false)}
            onSaveRename={() => {
              const name = draft.trim();
              if (name && name !== squad.name) rename.mutate(name);
            }}
            renamePending={rename.isPending}
            renameError={
              rename.error instanceof Error ? rename.error.message : null
            }
          />
          <MemberPreviewList
            squad={squad}
            resolveName={(preview) =>
              preview.member_type === "agent"
                ? (agents.find((a) => a.id === preview.member_id)?.name ??
                  null)
                : (members.find(
                    (m) =>
                      m.user_id === preview.member_id ||
                      m.id === preview.member_id,
                  )?.name ?? null)
            }
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SquadProfileCard({
  squad,
  leaderName,
  editing,
  draft,
  onStartRename,
  onDraftChange,
  onCancelRename,
  onSaveRename,
  renamePending,
  renameError,
}: {
  squad: Squad;
  leaderName: string;
  editing: boolean;
  draft: string;
  onStartRename: () => void;
  onDraftChange: (value: string) => void;
  onCancelRename: () => void;
  onSaveRename: () => void;
  renamePending: boolean;
  renameError: string | null;
}) {
  const count = squad.member_count ?? squad.member_preview?.length;
  const trimmed = draft.trim();
  const canSave =
    !renamePending && trimmed.length > 0 && trimmed !== squad.name;

  return (
    <View className="px-4 pt-4">
      <Card className="gap-3">
        <View className="flex-row items-center gap-3">
          <Avatar className="size-12" alt={squad.name}>
            {squad.avatar_url ? (
              <AvatarImage source={{ uri: squad.avatar_url }} />
            ) : null}
            <AvatarFallback>
              <Text className="text-base font-medium text-foreground">
                {squad.name.charAt(0).toUpperCase()}
              </Text>
            </AvatarFallback>
          </Avatar>
          <View className="flex-1 gap-0.5">
            <Text
              className="text-lg text-foreground font-semibold"
              numberOfLines={2}
            >
              {squad.name}
            </Text>
            {count !== undefined ? (
              <Text className="text-xs text-muted-foreground">
                {count === 1 ? "1 member" : `${count} members`}
              </Text>
            ) : null}
          </View>
        </View>

        <Text className="text-sm text-muted-foreground">
          {squad.description ? squad.description : "No description."}
        </Text>

        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm text-muted-foreground">Leader</Text>
          <Text
            className="text-sm text-foreground font-medium flex-1 text-right"
            numberOfLines={1}
          >
            {leaderName}
          </Text>
        </View>

        {editing ? (
          <View className="gap-2 pt-1">
            <TextField
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Squad name"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onSaveRename}
            />
            {renameError ? (
              <Text className="text-sm text-destructive">
                Failed to rename squad: {renameError}
              </Text>
            ) : null}
            <View className="flex-row gap-2">
              <Button
                variant="default"
                onPress={onSaveRename}
                disabled={!canSave}
              >
                <Text>Save</Text>
              </Button>
              <Button
                variant="outline"
                onPress={onCancelRename}
                disabled={renamePending}
              >
                <Text>Cancel</Text>
              </Button>
            </View>
          </View>
        ) : (
          <Button variant="outline" onPress={onStartRename}>
            <Text>Rename</Text>
          </Button>
        )}
      </Card>
    </View>
  );
}

function MemberPreviewList({
  squad,
  resolveName,
}: {
  squad: Squad;
  resolveName: (preview: SquadMemberPreview) => string | null;
}) {
  const preview = squad.member_preview ?? [];
  const count = squad.member_count ?? preview.length;

  return (
    <View className="px-4 pt-6 gap-2">
      <Text className="text-base text-foreground font-semibold">Members</Text>
      {preview.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          No member preview available.
        </Text>
      ) : (
        <>
          {preview.map((item) => (
            <View
              key={`${item.member_type}:${item.member_id}`}
              className="flex-row items-center justify-between gap-3 py-1"
            >
              <Text
                className="text-sm text-foreground flex-1"
                numberOfLines={1}
              >
                {resolveName(item) ??
                  (item.member_type === "agent" ? "Agent" : "Member")}
              </Text>
              {item.role ? (
                <Text className="text-xs text-muted-foreground">
                  {item.role}
                </Text>
              ) : null}
            </View>
          ))}
          {count !== undefined && preview.length < count ? (
            <Text className="text-xs text-muted-foreground">
              Showing {preview.length} of {count} members.
            </Text>
          ) : null}
        </>
      )}
      <Text className="text-xs text-muted-foreground">
        Members are read-only in this version.
      </Text>
    </View>
  );
}
