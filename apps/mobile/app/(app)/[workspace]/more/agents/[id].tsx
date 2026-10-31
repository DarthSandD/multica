/**
 * Agent detail page, v1: General tab only.
 *
 * Shows the header (avatar + name + availability), description, and the
 * general fields: runtime bound/unbound, model, visibility, and archived
 * state. The only action is Archive / Restore. There are deliberately no
 * instructions, skills, MCP, env, or activity tabs, and no DM or Assign
 * action in this version.
 *
 * Availability uses the same derivation as the list (`more/agents.tsx`):
 * archived_at => archived, else runtime_availability ?? offline.
 * Runtime bound uses the mobile-owned `isAgentRuntimeBound` helper
 * (non-empty runtime_id, unless runtime_bound is explicitly false).
 *
 * Labels are plain English in this file: no new locale keys were added
 * for v1, so localising this screen later is a copy-only change.
 *
 * Data comes from `agentDetailOptions` in `data/queries/agents`, which
 * calls `api.getAgent` / `api.archiveAgent` / `api.restoreAgent`. Those
 * ApiClient methods live in data/api.ts. Archive / Restore use inline `useMutation`
 * calls (precedent: `more/workspace-settings.tsx`) rather than a new
 * `data/mutations/agents.ts`, and await the server before updating the
 * detail cache — no optimistic lifecycle patch.
 */
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { api } from "@/data/api";
import { agentDetailOptions } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import { isAgentRuntimeBound } from "@/lib/is-agent-runtime-bound";

function availabilityOf(agent: Agent): AgentAvailability {
  if (agent.archived_at) return "archived";
  return agent.runtime_availability ?? "offline";
}

const AVAILABILITY_LABEL: Record<AgentAvailability, string> = {
  online: "Online",
  unstable: "Unstable",
  offline: "Offline",
  archived: "Archived",
};

function capitalize(value: string): string {
  return value.length === 0
    ? value
    : value.charAt(0).toUpperCase() + value.slice(1);
}

export default function AgentDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const qc = useQueryClient();

  const detailOptions = agentDetailOptions(wsId, id);
  const detail = useQuery(detailOptions);
  const agent = detail.data;

  // EMPTY_AGENT (the parse fallback) carries an empty id — treat it as
  // "not found / shape drifted", mirroring the project detail screen.
  const agentMissing = !agent || agent.id === "";
  const isArchived = !!agent?.archived_at;
  const availability = agent ? availabilityOf(agent) : "offline";
  const runtimeBound = agent ? isAgentRuntimeBound(agent) : false;

  const applyServerAgent = (server: Agent) => {
    qc.setQueryData<Agent>(detailOptions.queryKey, server);
    qc.invalidateQueries({ queryKey: ["agents", wsId] });
  };

  const archive = useMutation({
    mutationFn: () => api.archiveAgent(id),
    onSuccess: applyServerAgent,
    onError: (err) => {
      Alert.alert(
        "Could not archive agent",
        err instanceof Error ? err.message : "Unknown error",
      );
    },
  });

  const restore = useMutation({
    mutationFn: () => api.restoreAgent(id),
    onSuccess: applyServerAgent,
    onError: (err) => {
      Alert.alert(
        "Could not restore agent",
        err instanceof Error ? err.message : "Unknown error",
      );
    },
  });

  const pending = archive.isPending || restore.isPending;

  const onArchivePress = () => {
    Alert.alert(
      "Archive agent",
      "Archived agents cannot take work. You can restore this agent later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => archive.mutate(),
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <Stack.Screen
        options={{
          title: agent?.name || "Agent",
          headerBackTitle: "Back",
        }}
      />
      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : detail.error || agentMissing ? (
        <View className="flex-1 items-center justify-center px-6 gap-3">
          <Text className="text-sm text-destructive text-center">
            Could not load agent:{" "}
            {detail.error instanceof Error
              ? detail.error.message
              : "not found"}
          </Text>
          <Button variant="outline" onPress={() => detail.refetch()}>
            <Text>Retry</Text>
          </Button>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="pb-10"
          refreshControl={
            <RefreshControl
              refreshing={detail.isRefetching}
              onRefresh={detail.refetch}
            />
          }
        >
          <View className="flex-row items-center gap-4 px-4 pt-4">
            <View className="relative">
              <Avatar className="size-16" alt={agent.name}>
                {agent.avatar_url ? (
                  <AvatarImage source={{ uri: agent.avatar_url }} />
                ) : null}
                <AvatarFallback>
                  <Text className="text-lg font-medium text-foreground">
                    {agent.name.charAt(0).toUpperCase()}
                  </Text>
                </AvatarFallback>
              </Avatar>
              <View className="absolute bottom-0 right-0">
                <PresenceDot availability={availability} size={14} />
              </View>
            </View>
            <View className="flex-1 gap-0.5">
              <Text
                className="text-xl text-foreground font-semibold"
                numberOfLines={2}
              >
                {agent.name}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {AVAILABILITY_LABEL[availability]}
              </Text>
            </View>
          </View>

          <View className="px-4 pt-6 gap-4">
            <DetailRow
              label="Description"
              value={agent.description || "No description"}
            />
            <DetailRow
              label="Availability"
              value={AVAILABILITY_LABEL[availability]}
            />
            <DetailRow
              label="Runtime"
              value={runtimeBound ? "Bound" : "Unbound"}
            />
            <DetailRow
              label="Model"
              value={agent.model || "Not set"}
            />
            <DetailRow
              label="Visibility"
              value={capitalize(agent.visibility)}
            />
            <DetailRow
              label="Archived"
              value={isArchived ? "Yes" : "No"}
            />
          </View>

          <View className="px-4 pt-8">
            <Button
              variant={isArchived ? "default" : "destructive"}
              disabled={pending}
              onPress={isArchived ? () => restore.mutate() : onArchivePress}
            >
              <Text>
                {pending
                  ? "Working..."
                  : isArchived
                    ? "Restore"
                    : "Archive"}
              </Text>
            </Button>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-base text-foreground">{value}</Text>
    </View>
  );
}
