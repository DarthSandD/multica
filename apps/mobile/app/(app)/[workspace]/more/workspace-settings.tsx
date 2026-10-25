/**
 * Workspace settings page — read-only workspace identity in this phase.
 *
 * Shows the current workspace's name, slug, and member count. No edit
 * mutations live here: editing arrives in a later phase, so there are no
 * form controls to mistake for working ones.
 *
 * The workspace record comes from the workspace list query, resolved
 * against the current workspace id (slug as fallback); the member count
 * comes from the member list query, which is already wired. A members
 * failure must not blank the whole screen, so that row degrades to an
 * em dash while the rest renders — the workspace query owns the page's
 * error state with retry.
 *
 * Title is set here via Stack.Screen: this route has no entry in the
 * parent `_layout.tsx` yet (title registration lands with the
 * coordinator's merge pass), and the in-screen option keeps the header
 * correct in the meantime.
 */
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <Stack.Screen options={{ title: t("title") }} />
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
            <DetailRow label={t("workspace.name")} value={workspace.name} />
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
