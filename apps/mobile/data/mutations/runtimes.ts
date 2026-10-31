/**
 * Runtime mutations (rename, delete) for the runtimes detail screen.
 *
 * These live here, not in data/queries/runtimes.ts, so that the query
 * file stays a pure queryOptions + api module: lib/use-agent-presence.ts
 * imports runtimeListOptions in a node test environment, and importing
 * the workspace store (via these hooks) from the query file pulls in
 * expo-secure-store, which fails to load there.
 *
 * Neither hook patches the cache optimistically: rename/delete follow
 * the root rule that create/delete flows await the server before
 * navigation or cleanup, and a failed rename must leave the list row
 * untouched. Both invalidate the workspace runtime list on settle so
 * the detail screen and the list re-read the server row.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RuntimeDevice } from "@multica/core/types";
import { api } from "@/data/api";
import { useWorkspaceStore } from "@/data/workspace-store";

export function useRenameRuntime(runtimeId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["renameRuntime", runtimeId] as const,
    mutationFn: (customName: string): Promise<RuntimeDevice> =>
      api.renameRuntime(runtimeId, customName),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["runtimes", wsId] });
    },
  });
}

export function useDeleteRuntime(runtimeId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["deleteRuntime", runtimeId] as const,
    mutationFn: (): Promise<void> => api.deleteRuntime(runtimeId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["runtimes", wsId] });
    },
  });
}
