/**
 * Workspace settings page — workspace identity, with name editing in v1.
 *
 * Shows the current workspace's name, slug, and member count. The name
 * is editable inline on this screen (Edit, then Save/Cancel); the edit
 * awaits the server before it closes, mirroring the issue edit screen's
 * Save/Cancel flow without a new route. Slug and member count stay
 * read-only, and no other workspace action is added here.
 *
 * The workspace record comes from the workspace list query, resolved
 * against the current workspace id (slug as fallback); the member count
 * comes from the member list query, which is already wired. A members
 * failure must not blank the whole screen, so that row degrades to an
 * em dash while the rest renders — the workspace query owns the page's
 * error state with retry.
 *
 * Title is registered in the parent `_layout.tsx` (Stack.Screen for
 * `more/workspace-settings`); no in-screen title override lives here.
 *
 * Note: this screen calls `api.updateWorkspace` in `data/api.ts`. No optimistic
 * patch is applied: the new name is written to the list cache only from
 * the server response, so a non-admin (403) or other failure leaves the
 * old name on screen and the edit open with an error alert.
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { MOBILE_PLACEHOLDER_COLOR } from "@/components/ui/input-tokens";
import { api } from "@/data/api";
import { memberListOptions } from "@/data/queries/members";
import { workspaceListOptions } from "@/data/queries/workspaces";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";

export default function WorkspaceSettingsPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { t } = useT("more_workspace_settings");

  const workspacesQuery = useQuery(workspaceListOptions());
  const membersQuery = useQuery(memberListOptions(wsId));

  const workspace =
    workspacesQuery.data?.find((ws) => ws.id === wsId) ??
    workspacesQuery.data?.find((ws) => ws.slug === wsSlug);

  // Inline name edit, following the issue edit screen's Save/Cancel
  // shape (edit.tsx) but kept on this screen: no new route exists for
  // workspace settings, and registering a formSheet route would require
  // editing `_layout.tsx`, which is out of scope for this task. Plain
  // English labels are used here deliberately — no locale files are
  // edited in this task, so no new i18n keys are introduced.
  const qc = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // No optimistic patch: the rename is not closed until the server
  // answers, so a failure (including a non-admin 403, enforced by the
  // admin-gated PUT/PATCH route) leaves the old name and the edit open.
  const updateName = useMutation({
    mutationKey: ["updateWorkspace", workspace?.id ?? null] as const,
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.updateWorkspace(id, { name }),
    onSuccess: (server) => {
      qc.setQueryData<Workspace[]>(
        workspaceListOptions().queryKey,
        (old) =>
          old ? old.map((ws) => (ws.id === server.id ? server : ws)) : old,
      );
      setEditingName(false);
    },
    onError: (err) => {
      Alert.alert(
        "Could not save workspace name",
        err instanceof Error ? err.message : "Unknown error",
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: workspaceListOptions().queryKey });
    },
  });

  const startNameEdit = useCallback(() => {
    if (!workspace) return;
    setNameDraft(workspace.name);
    setEditingName(true);
  }, [workspace]);

  const cancelNameEdit = useCallback(() => {
    if (nameDraft.trim() !== (workspace?.name ?? "").trim()) {
      Alert.alert("Discard changes?", "Your unsaved name change will be lost.", [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => setEditingName(false),
        },
      ]);
      return;
    }
    setEditingName(false);
  }, [nameDraft, workspace]);

  const saveNameEdit = useCallback(() => {
    if (!workspace) return;
    const name = nameDraft.trim();
    if (!name || name === workspace.name || updateName.isPending) return;
    updateName.mutate({ id: workspace.id, name });
  }, [workspace, nameDraft, updateName]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      {workspacesQuery.isLoading ? (
        <WorkspaceSettingsLoading />
      ) : workspacesQuery.error ? (
        <View className="px-4 gap-3 pt-4">
          <Text className="text-sm text-destructive">
            {t("errors.load_failed", {
              message:
                workspacesQuery.error instanceof Error
                  ? workspacesQuery.error.message
                  : "unknown",
            })}
          </Text>
          <Button variant="outline" onPress={() => workspacesQuery.refetch()}>
            <Text>{t("common:actions.retry")}</Text>
          </Button>
        </View>
      ) : !workspace ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-muted-foreground text-center">
            {t("list.empty")}
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="px-4 py-4 gap-6"
        >
          <SectionGroup title={t("workspace.title")}>
            <View className="px-4 py-3.5 gap-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-base text-muted-foreground">
                  {t("workspace.name")}
                </Text>
                {!editingName && (
                  <Pressable onPress={startNameEdit} className="px-1 py-1">
                    <Text className="text-base text-brand">Edit</Text>
                  </Pressable>
                )}
              </View>
              {editingName ? (
                <>
                  <TextInput
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    placeholder={workspace.name}
                    placeholderTextColor={MOBILE_PLACEHOLDER_COLOR}
                    className="text-base text-foreground bg-secondary/50 rounded-md px-3 py-2"
                    returnKeyType="done"
                    onSubmitEditing={saveNameEdit}
                    editable={!updateName.isPending}
                    autoFocus
                  />
                  <View className="flex-row justify-end gap-2">
                    <Button
                      variant="outline"
                      onPress={cancelNameEdit}
                      disabled={updateName.isPending}
                    >
                      <Text>Cancel</Text>
                    </Button>
                    <Button
                      onPress={saveNameEdit}
                      disabled={
                        !nameDraft.trim() ||
                        nameDraft.trim() === workspace.name ||
                        updateName.isPending
                      }
                    >
                      <Text>
                        {updateName.isPending ? "Saving..." : "Save"}
                      </Text>
                    </Button>
                  </View>
                </>
              ) : (
                <Text
                  className="text-base text-foreground font-medium"
                  numberOfLines={1}
                >
                  {workspace.name}
                </Text>
              )}
            </View>
            <Separator />
            <DetailRow
              label={t("workspace.slug")}
              value={`/${workspace.slug}`}
            />
            <Separator />
            <View className="flex-row items-center justify-between px-4 py-3.5 gap-3">
              <Text className="text-base text-muted-foreground">
                {t("workspace.members")}
              </Text>
              {membersQuery.isLoading ? (
                <ActivityIndicator />
              ) : membersQuery.error || !membersQuery.data ? (
                <Text className="text-base text-muted-foreground">—</Text>
              ) : (
                <Text className="text-base text-foreground font-medium">
                  {t("workspace.members_count", {
                    count: membersQuery.data.length,
                  })}
                </Text>
              )}
            </View>
          </SectionGroup>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3.5 gap-3">
      <Text className="text-base text-muted-foreground">{label}</Text>
      <Text
        className="text-base text-foreground font-medium text-right flex-1"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function SectionGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs uppercase tracking-wider text-muted-foreground px-1">
        {title}
      </Text>
      <View className="rounded-md border border-border bg-card overflow-hidden">
        {children}
      </View>
    </View>
  );
}

/** Skeleton mirrors the detail layout (one section group of three rows)
 *  so the eye sees a settings-like structure instead of a spinner. */
function WorkspaceSettingsLoading() {
  return (
    <View className="px-4 py-4 gap-6">
      <View className="gap-2">
        <Skeleton className="h-3 w-20 ml-1" />
        <View className="rounded-md border border-border overflow-hidden">
          {Array.from({ length: 3 }).map((_, rowIdx) => (
            <View
              key={rowIdx}
              className="flex-row items-center justify-between px-4 py-3.5"
            >
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-16" />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
