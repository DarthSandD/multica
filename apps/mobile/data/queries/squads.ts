import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";

export const squadListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: ["squads", wsId] as const,
    queryFn: ({ signal }) => api.listSquads({ signal }),
    enabled: !!wsId,
  });

// Detail query, same queryOptions style as the list. The key nests under
// the list prefix (["squads", wsId]) so invalidating the list prefix also
// refreshes the detail cache after a rename.
// Detail data comes from api.getSquad in data/api.ts.
export const squadDetailOptions = (wsId: string | null, id: string) =>
  queryOptions({
    queryKey: ["squads", wsId, "detail", id] as const,
    queryFn: ({ signal }) => api.getSquad(id, { signal }),
    enabled: !!wsId && !!id,
  });
