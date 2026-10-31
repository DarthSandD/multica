import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";

// Runtime list — workspace-scoped. Feeds the availability dimension of the
// presence dot via @multica/core/agents/derive-presence (status + last_seen_at).
// Invalidated by daemon:register / sweeper-driven status changes; see
// data/realtime/use-presence-realtime.ts.
export const runtimeListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: ["runtimes", wsId] as const,
    queryFn: ({ signal }) => api.listRuntimes({ signal }),
    enabled: !!wsId,
  });

// Rename/delete mutations live in data/mutations/runtimes.ts, not here:
// this query file must stay a pure queryOptions + api module, because
// lib/use-agent-presence.ts imports runtimeListOptions in a node test
// environment where the workspace store (expo-secure-store) cannot load.
