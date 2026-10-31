/**
 * Skill detail page, read-only v1.
 *
 * Fetches its own record via `skillDetailOptions`: the list payload
 * (`SkillSummary`) carries no SKILL.md body, so this screen cannot reuse
 * the list record for content. `GET /api/skills/{id}` (default
 * `include=content`) returns the full `Skill`, and the body rendered
 * here is its `content` field — the SKILL.md body. No separate `/files`
 * call is needed for that body.
 *
 * Read-only scope: name, description, source path/provider when present,
 * and the SKILL.md body rendered with the existing mobile markdown
 * renderer (`@/lib/markdown`, per `apps/mobile/docs/markdown-rendering-
 * adr.md`). No editing, no file management, no pull-to-refresh, and no
 * labels. Labels are deliberately not rendered: the detail payload's
 * `labels` field is a list-shape attachment, not part of this screen.
 *
 * Labels in this file are plain English on purpose: no new locale keys
 * were added for this screen, and locale files are outside this change's
 * scope. The native Stack header title comes from the layout's
 * `more/skills/[id]` screen entry and is overridden here with the skill
 * name once loaded, mirroring `project/[id].tsx`.
 */
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import type { Skill } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/lib/markdown";
import { skillDetailOptions } from "@/data/queries/skills";
import { useWorkspaceStore } from "@/data/workspace-store";

/**
 * Minimal read of `skill.config.origin` (the provenance blob the server
 * writes on import; see `packages/views/skills/lib/origin.ts` for the web
 * shape). Only the fields this screen shows are read, and only when they
 * are non-empty strings; anything else renders nothing rather than a
 * half-filled Source section. Manual skills have no origin, so they
 * simply show no Source section.
 */
function readSkillSource(skill: Skill): {
  provider?: string;
  sourcePath?: string;
  sourceUrl?: string;
} {
  const config = skill.config as Record<string, unknown> | undefined;
  const origin = config?.origin;
  if (!origin || typeof origin !== "object") return {};
  const record = origin as Record<string, unknown>;
  const asString = (value: unknown): string | undefined =>
    typeof value === "string" && value.length > 0 ? value : undefined;
  return {
    provider: asString(record.provider),
    sourcePath: asString(record.source_path),
    sourceUrl: asString(record.source_url),
  };
}

export default function SkillDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const { data, isLoading, error, refetch } = useQuery(
    skillDetailOptions(wsId, id),
  );

  // EMPTY_SKILL carries an empty id — parseWithFallback returned the
  // fallback because the response shape drifted. Treat as "not found",
  // mirroring the EMPTY_PROJECT check in `project/[id].tsx`. Kept as a
  // null (not a boolean flag) so the success branch below narrows.
  const skill = data && data.id !== "" ? data : null;
  const source = skill ? readSkillSource(skill) : {};
  const showSource =
    !!source.provider || !!source.sourcePath || !!source.sourceUrl;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <Stack.Screen options={{ title: skill ? skill.name : "Skill" }} />
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : error || !skill ? (
        <View className="px-4 gap-3 pt-4">
          <Text className="text-sm text-destructive">
            {!skill && !error
              ? "Skill not found."
              : `Failed to load skill: ${error instanceof Error ? error.message : "unknown"}`}
          </Text>
          <Button variant="outline" onPress={() => refetch()}>
            <Text>Retry</Text>
          </Button>
        </View>
      ) : (
        <ScrollView contentContainerClassName="pb-6">
          <View className="px-4 pt-4 gap-2">
            <Text className="text-xl text-foreground font-semibold">
              {skill.name}
            </Text>
            {skill.description ? (
              <Text className="text-base text-muted-foreground">
                {skill.description}
              </Text>
            ) : null}
          </View>
          {showSource ? (
            <View className="px-4 pt-5 gap-1.5">
              <Text className="text-sm text-foreground font-medium">
                Source
              </Text>
              {source.provider ? (
                <Text className="text-sm text-muted-foreground">
                  Provider: {source.provider}
                </Text>
              ) : null}
              {source.sourcePath ? (
                <Text className="text-sm text-muted-foreground">
                  Path: {source.sourcePath}
                </Text>
              ) : null}
              {source.sourceUrl ? (
                <Text className="text-sm text-muted-foreground">
                  URL: {source.sourceUrl}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View className="px-4 pt-5">
            <Text className="text-sm text-foreground font-medium pb-2">
              SKILL.md
            </Text>
            {skill.content ? (
              <Markdown content={skill.content} />
            ) : (
              <Text className="text-sm text-muted-foreground italic">
                No SKILL.md content.
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
