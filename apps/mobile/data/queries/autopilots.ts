/**
 * Autopilot list + quota-usage queries — workspace-scoped.
 *
 * Mirrors packages/core/autopilots/queries.ts (key shape, quota staleTime)
 * and packages/core/api/client.ts (endpoints). Backend routes registered in
 * server/cmd/server/router.go:2198 (GET /api/autopilots, GET
 * /api/autopilots/usage).
 *
 * No api.* method exists for these endpoints yet (apps/mobile/data/api.ts
 * is owned by another workstream), so the fetch below follows the api.ts
 * pattern directly: Bearer token from the api singleton, X-Workspace-Slug
 * from the workspace store, 30s manual timeout (Hermes lacks
 * AbortSignal.timeout), caller-signal forwarding, and ApiError on non-OK.
 * One divergence to close in a later merge pass: a 401 here surfaces as a
 * query error instead of triggering api.ts's onUnauthorized sign-out hook,
 * which is not reachable from outside ApiClient.
 */
import { Platform } from "react-native";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import {
  AutopilotQuotaUsageSchema,
  EMPTY_LIST_AUTOPILOTS_RESPONSE,
  ListAutopilotsResponseSchema,
} from "@multica/core/api/schemas";
import { ApiError, api } from "@/data/api";
import { getCurrentSlug } from "@/data/workspace-store";
import { parseWithFallback } from "@/lib/parse-response";
import { createRequestId } from "@/lib/request-id";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
const FETCH_TIMEOUT_MS = 30_000;

export type AutopilotListItem = z.infer<
  typeof ListAutopilotsResponseSchema
>["autopilots"][number];

export type AutopilotQuotaUsage = z.infer<typeof AutopilotQuotaUsageSchema>;

/** Quota fallback mirroring the core client's getAutopilotQuotaUsage. */
const EMPTY_QUOTA_USAGE: AutopilotQuotaUsage = {
  action: "off",
  used: null,
  reserved: null,
  total: null,
  limit: null,
  reached: null,
  period_start: null,
  period_end: null,
  reset_at: null,
  blocked_counts: null,
};

async function fetchWorkspaceJson(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error(`request timed out after ${FETCH_TIMEOUT_MS}ms`)),
    FETCH_TIMEOUT_MS,
  );
  const onCallerAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onCallerAbort);
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Client-Platform": "mobile",
      "X-Client-OS": Platform.OS,
      "X-Request-ID": createRequestId(),
    };
    const token = api.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const slug = getCurrentSlug();
    if (slug) headers["X-Workspace-Slug"] = slug;

    const res = await fetch(`${API_URL}${path}`, {
      signal: controller.signal,
      headers,
    });
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      const message =
        (body && typeof body === "object" && "message" in body
          ? String((body as { message: unknown }).message)
          : null) ?? `${res.status} ${res.statusText}`;
      throw new ApiError(message, res.status, body);
    }
    if (res.status === 204) return undefined;
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

export const autopilotKeys = {
  all: (wsId: string | null) => ["autopilots", wsId] as const,
  list: (wsId: string | null) => [...autopilotKeys.all(wsId), "list"] as const,
  usage: (wsId: string | null) =>
    [...autopilotKeys.all(wsId), "usage"] as const,
};

export const autopilotListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: autopilotKeys.list(wsId),
    // parseWithFallback infers never[] from the empty fallback, so the
    // return type is stated explicitly; the runtime shape still comes
    // from the zod schema above.
    queryFn: async ({ signal }): Promise<AutopilotListItem[]> => {
      const raw = await fetchWorkspaceJson("/api/autopilots", signal);
      const parsed = parseWithFallback(
        raw,
        ListAutopilotsResponseSchema,
        EMPTY_LIST_AUTOPILOTS_RESPONSE,
        { endpoint: "GET /api/autopilots" },
      );
      return parsed.autopilots;
    },
    enabled: !!wsId,
  });

export const autopilotQuotaUsageOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: autopilotKeys.usage(wsId),
    queryFn: async ({ signal }): Promise<AutopilotQuotaUsage> => {
      const raw = await fetchWorkspaceJson("/api/autopilots/usage", signal);
      return parseWithFallback(raw, AutopilotQuotaUsageSchema, EMPTY_QUOTA_USAGE, {
        endpoint: "GET /api/autopilots/usage",
      });
    },
    enabled: !!wsId,
    staleTime: 30_000,
  });
