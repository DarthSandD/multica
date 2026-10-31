import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";

/** Workspace member cache keys. Mutations import this factory rather
 *  than hardcoding key segments (mobile data-layer rule). */
export const memberKeys = {
  list: (wsId: string | null) => ["members", wsId] as const,
};

export const memberListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: memberKeys.list(wsId),
    queryFn: ({ signal }) => api.listMembers(wsId!, { signal }),
    enabled: !!wsId,
  });
