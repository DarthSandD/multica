/**
 * Mobile member mutations. Mirrors the web members tab
 * (`packages/views/settings/components/members-tab.tsx`): role change via
 * PATCH and removal via DELETE on the same workspace member path.
 *
 * NOTE: these call `api.updateMemberRole` / `api.removeMember` in
 * `data/api.ts`.
 *
 * Cache: the detail screen reuses the list record, so both mutations
 * operate on the `memberKeys.list(wsId)` cache only. Role change is an
 * optimistic field patch (predictable result, trivial rollback, caller
 * stays on screen). Removal is NOT optimistic: per the repo state rules,
 * deletes await the server before navigation or cleanup, so the detail
 * screen awaits `mutateAsync` and only then navigates back; this hook
 * invalidates on settle and leaves the row in place until then.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MemberRole, MemberWithUser } from "@multica/core/types";
import { api } from "@/data/api";
import { memberKeys } from "@/data/queries/members";
import { useWorkspaceStore } from "@/data/workspace-store";

export type UpdateMemberRoleVars = {
  memberId: string;
  role: MemberRole;
};

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationFn: ({ memberId, role }: UpdateMemberRoleVars) =>
      api.updateMemberRole(wsId!, memberId, role),
    onMutate: async ({ memberId, role }: UpdateMemberRoleVars) => {
      const key = memberKeys.list(wsId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<MemberWithUser[]>(key);
      qc.setQueryData<MemberWithUser[]>(key, (old) =>
        old
          ? old.map((m) => (m.id === memberId ? { ...m, role } : m))
          : old,
      );
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: memberKeys.list(wsId) });
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationFn: (memberId: string) => api.removeMember(wsId!, memberId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: memberKeys.list(wsId) });
    },
  });
}
