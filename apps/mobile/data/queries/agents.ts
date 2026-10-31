import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";

/**
 * Detail query for `more/agents/[id]` (General tab, v1). Same
 * queryOptions style as `agentListOptions`: workspace-scoped key so
 * switching workspaces flips the cache, signal forwarded to the API
 * method, and enabled only once both ids are known.
 *
 * Depends on `api.getAgent` in `data/api.ts`.
 */
export const agentDetailOptions = (wsId: string | null, id: string) =>
  queryOptions({
    queryKey: ["agents", wsId, "detail", id] as const,
    queryFn: ({ signal }) => api.getAgent(id, { signal }),
    enabled: !!wsId && !!id,
  });

export const agentListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: ["agents", wsId] as const,
    queryFn: ({ signal }) => api.listAgents({ signal }),
    enabled: !!wsId,
    // Mirrors Web/Desktop: projected unstable ages offline without an event,
    // while offline recovery is covered by lifecycle events and reconnect.
    refetchInterval: (query) =>
      query.state.data?.some(
        (agent) =>
          !agent.archived_at &&
          (agent.runtime_availability === "online" ||
            agent.runtime_availability === "unstable"),
      )
        ? 30_000
        : false,
  });
