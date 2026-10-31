/**
 * Skills browse page. Flat FlatList over the workspace's skills.
 *
 * Title lives in the native iOS Stack header (declared via Stack.Screen
 * options in parent `_layout.tsx`, as for more/issues and more/projects).
 * Rendering an in-body title row on top of the native bar would stack two
 * "Skills" labels vertically.
 *
 * Rows are pressable and navigate to the read-only skill detail route
 * (`more/skills/[id]`). The detail screen fetches its own record: the
 * list payload (`SkillSummary`) carries no SKILL.md body, so the detail
 * screen cannot reuse the list record for content. The More-menu entry
 * and the Stack.Screen titles are registered in _layout.tsx.
 *
 * Row content mirrors the desktop skills list
 * (`packages/views/skills/components/skills-page.tsx`): name plus
 * description. The list payload (`SkillSummary`) carries no SKILL.md body,
 * so no body is rendered here. Descriptions are optional on the server
 * (default `""`); a skill without one renders a single-line row rather
 * than an empty second line.
 *
 * Sort: client-side by name ascending, matching the desktop list's name
 * sort.
 */
import { useMemo } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import type { SkillSummary } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { skillListOptions } from "@/data/queries/skills";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";

export default function SkillsPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { t } = useT("more_skills");

  const { data, isLoading, error, refetch, isRefetching } = useQuery(
    skillListOptions(wsId),
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      {isLoading ? (
        <SkillsLoading />
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
          renderItem={({ item }) => (
            <SkillRow
              skill={item}
              onPress={() => {
                if (wsSlug) router.push(`/${wsSlug}/more/skills/${item.id}`);
              }}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          contentContainerClassName="pb-6"
        />
      )}
    </SafeAreaView>
  );
}

function SkillRow({
  skill,
  onPress,
}: {
  skill: SkillSummary;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="active:bg-secondary">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <View className="flex-1 gap-1 min-w-0">
          <Text
            className="text-base text-foreground font-medium"
            numberOfLines={1}
          >
            {skill.name}
          </Text>
          {skill.description ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={2}>
              {skill.description}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// Loading skeleton mirroring the row layout (name band + description band)
// so the eye sees a list-like structure instead of a centered spinner.
function SkillsLoading() {
  return (
    <View className="pt-2">
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <View key={rowIdx} className="flex-row items-center gap-3 px-4 py-3">
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </View>
        </View>
      ))}
    </View>
  );
}
