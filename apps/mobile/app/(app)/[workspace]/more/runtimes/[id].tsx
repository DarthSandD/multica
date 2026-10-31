/**
 * Runtime detail page, v1. Derived from the already-fetched list record
 * (`runtimeListOptions`) — there is NO GET /api/runtimes/{id} route, so
 * this screen finds its runtime in the workspace list cache and shows a
 * "not found" state when the id is not in it (for example a stale deep
 * link after the runtime was deleted elsewhere).
 *
 * Shows: display name (custom alias when set, via `runtimeDisplayName`),
 * provider, status, presence (the same `deriveAgentAvailability`
 * derivation the list row uses), last seen, and visibility.
 *
 * Actions, v1 only:
 * - Rename: an inline text field on this screen, following the issue edit
 *   pattern (TextInput + Save/Cancel). Saving sends the name as
 *   `custom_name` on PATCH /api/runtimes/{id}; an empty save clears the
 *   custom name and the display reverts to the daemon name, per the
 *   server's MUL-4217 contract. No native Alert.prompt: it is iOS-only
 *   and has no existing precedent in apps/mobile.
 * - Delete: a native confirm alert first, then the strict DELETE. The
 *   screen only navigates back after the server confirms; a failure
 *   keeps the user on this screen with the error shown inline.
 *
 * Deliberately absent in v1: usage sections, update sections, and the
 * confirmed unbind-and-delete cascade. When the strict DELETE refuses
 * with `runtime_has_active_agents`, the refusal is surfaced as a plain
 * inline message (with the blocking agent count when the server sent
 * it) and the runtime stays in place with the refusal visible.
 *
 * Header title follows the project detail pattern: this screen sets its
 * own Stack.Screen title to the display name, over the layout fallback
 * registered in _layout.tsx (`more/runtimes/[id]`).
 * Plain English labels are used directly here; no locale keys were added
 * for this screen.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { deriveAgentAvailability } from "@multica/core/agents";
import { runtimeDisplayName } from "@multica/core/runtimes";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { PresenceDot } from "@/components/ui/presence-dot";
import { MOBILE_PLACEHOLDER_COLOR } from "@/components/ui/input-tokens";
import { runtimeListOptions } from "@/data/queries/runtimes";
import { usePresenceTick } from "@/lib/use-agent-presence";
import {
  useDeleteRuntime,
  useRenameRuntime,
} from "@/data/mutations/runtimes";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT, useTimeAgo } from "@/lib/i18n";

export default function RuntimeDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("more_runtimes");
  const timeAgo = useTimeAgo();

  const list = useQuery(runtimeListOptions(wsId));
  const runtime = list.data?.find((item) => item.id === id) ?? null;

  // AppState-gated 30s tick: availability derives from this clock value
  // instead of a Date.now() call during render, which the
  // react-hooks/purity lint rule forbids.
  const now = usePresenceTick();

  const rename = useRenameRuntime(id ?? "");
  const deleteRuntime = useDeleteRuntime(id ?? "");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const displayName = runtime ? runtimeDisplayName(runtime) : "Runtime";
  const availability = runtime
    ? deriveAgentAvailability(runtime, now)
    : "offline";
  const statusLabel = runtime ? t(`status.${runtime.status}`) : "";
  const presenceLabel = runtime ? t(`status.${availability}`) : "";
  const lastSeen = runtime?.last_seen_at
    ? timeAgo(runtime.last_seen_at)
    : "Never";

  const startEditing = () => {
    if (!runtime) return;
    setDraft(displayName);
    setRenameError(null);
    setEditing(true);
  };

  const saveRename = async () => {
    if (!runtime) return;
    const nextName = draft.trim();
    // Unchanged (ignoring surrounding whitespace) means no PATCH.
    if (nextName === displayName) {
      setEditing(false);
      return;
    }
    setRenameError(null);
    try {
      // An empty string clears custom_name on the server (MUL-4217),
      // reverting the display to the daemon name.
      await rename.mutateAsync(nextName);
      setEditing(false);
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Failed to rename runtime.",
      );
    }
  };

  const confirmDelete = () => {
    if (!runtime) return;
    Alert.alert(
      "Delete runtime?",
      `Delete "${displayName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          // Awaited: navigation back happens only after the server
          // confirms the delete. Any refusal stays on this screen as
          // an inline error (see deleteErrorMessage).
          onPress: async () => {
            setDeleteError(null);
            try {
              await deleteRuntime.mutateAsync();
              router.back();
            } catch (err) {
              setDeleteError(deleteErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: displayName,
          headerBackTitle: t("common:actions.back"),
        }}
      />

      {list.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : list.error ? (
        <View className="px-4 gap-3 pt-4">
          <Text className="text-sm text-destructive">
            {t("errors.load_failed", {
              message:
                list.error instanceof Error ? list.error.message : "unknown",
            })}
          </Text>
          <Button variant="outline" onPress={() => list.refetch()}>
            <Text>{t("common:actions.retry")}</Text>
          </Button>
        </View>
      ) : !runtime ? (
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <Text className="text-sm text-muted-foreground text-center">
            Runtime not found. It may have been deleted.
          </Text>
          <Button variant="outline" onPress={() => router.back()}>
            <Text>Back</Text>
          </Button>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-4 pb-6 gap-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center gap-3">
            <PresenceDot availability={availability} size={12} />
            <View className="flex-1 gap-1 min-w-0">
              <Text
                className="text-xl text-foreground font-semibold"
                numberOfLines={2}
              >
                {displayName}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {presenceLabel}
              </Text>
            </View>
          </View>

          <View className="gap-3">
            <DetailRow label="Provider" value={runtime.provider} />
            <DetailRow label="Status" value={statusLabel} />
            <DetailRow label="Presence" value={presenceLabel} />
            <DetailRow label="Last seen" value={lastSeen} />
            <DetailRow
              label="Visibility"
              value={runtime.visibility === "public" ? "Public" : "Private"}
            />
          </View>

          <View className="gap-3">
            {editing ? (
              <>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={displayName}
                  placeholderTextColor={MOBILE_PLACEHOLDER_COLOR}
                  className="text-base text-foreground bg-secondary/50 rounded-md px-3 py-2"
                  autoFocus
                  editable={!rename.isPending}
                />
                <Text className="text-sm text-muted-foreground">
                  Leave empty to use the default name.
                </Text>
                {renameError ? (
                  <Text className="text-sm text-destructive">
                    {renameError}
                  </Text>
                ) : null}
                <View className="flex-row gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onPress={() => setEditing(false)}
                    disabled={rename.isPending}
                  >
                    <Text>Cancel</Text>
                  </Button>
                  <Button
                    className="flex-1"
                    onPress={saveRename}
                    disabled={
                      rename.isPending || draft.trim() === displayName
                    }
                  >
                    <Text>{rename.isPending ? "Saving..." : "Save"}</Text>
                  </Button>
                </View>
              </>
            ) : (
              <Button
                variant="outline"
                onPress={startEditing}
                disabled={deleteRuntime.isPending}
              >
                <Text>Rename</Text>
              </Button>
            )}

            {deleteError ? (
              <Text className="text-sm text-destructive">{deleteError}</Text>
            ) : null}
            <Button
              variant="destructive"
              onPress={confirmDelete}
              disabled={deleteRuntime.isPending || editing}
            >
              <Text>{deleteRuntime.isPending ? "Deleting..." : "Delete"}</Text>
            </Button>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start gap-3">
      <Text className="text-sm text-muted-foreground w-24">{label}</Text>
      <Text
        className="text-sm text-foreground flex-1 text-right"
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Turns a failed strict DELETE into the message shown inline on the
 * detail screen. The server's 409 body is
 * `{ error, code: "runtime_has_active_agents", active_agents: [...] }`
 * (server/internal/handler/runtime.go `runtimeHasActiveAgentsResponse`),
 * carried on ApiError.body by the mobile client. That refusal is shown
 * plainly with its agent count — never swallowed, and never treated as
 * a success. The v1 screen offers no unbind-and-delete cascade, so the
 * message tells the user to reassign the agents first.
 */
function deleteErrorMessage(err: unknown): string {
  const body =
    err !== null && typeof err === "object"
      ? (err as { body?: unknown }).body
      : undefined;
  if (body !== null && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (record["code"] === "runtime_has_active_agents") {
      const agents = record["active_agents"];
      const count = Array.isArray(agents) ? agents.length : null;
      if (count !== null) {
        return (
          `Cannot delete this runtime: it still has ${count} active ` +
          `agent${count === 1 ? "" : "s"} bound to it. ` +
          `Reassign those agents to another runtime first, then try again.`
        );
      }
      return (
        "Cannot delete this runtime: it still has active agents bound " +
        "to it. Reassign those agents to another runtime first, then try again."
      );
    }
    if (typeof record["error"] === "string" && record["error"]) {
      return record["error"];
    }
  }
  if (err instanceof Error && err.message) {
    return `Failed to delete runtime: ${err.message}`;
  }
  return "Failed to delete runtime.";
}
