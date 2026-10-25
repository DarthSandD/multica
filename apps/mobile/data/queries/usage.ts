/**
 * Workspace dashboard usage queries — workspace-scoped rollups that back
 * the desktop Usage page (packages/views/dashboard/components/
 * dashboard-page.tsx). Backend endpoints live in
 * packages/core/api/client.ts (getDashboardUsageDaily,
 * getDashboardUsageByAgent, getDashboardAgentRunTime); the routes are
 * workspace-resolved via the X-Workspace-Slug middleware, same as every
 * other workspace query.
 *
 * Window: 30 days, matching the desktop dashboard's default TimeRange.
 * The desktop page also passes the viewer's timezone (`tz`) so day buckets
 * cut on the viewer's calendar; this mobile summary omits `tz` and takes
 * the server default window. That is a documented divergence, not a data
 * gap: totals shift by at most one boundary day for far-from-UTC viewers.
 *
 * No api.* method exists for these endpoints yet, so the fetch below
 * follows the apps/mobile/data/api.ts pattern directly (see
 * data/queries/autopilots.ts for the same helper and its 401 note).
 */
import { Platform } from "react-native";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import {
  DashboardAgentRunTimeListSchema,
  DashboardUsageByAgentListSchema,
  DashboardUsageDailyListSchema,
} from "@multica/core/api/schemas";
import { ApiError, api } from "@/data/api";
import { getCurrentSlug } from "@/data/workspace-store";
import { parseWithFallback } from "@/lib/parse-response";
import { createRequestId } from "@/lib/request-id";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
const FETCH_TIMEOUT_MS = 30_000;

/** Rolling window in days, matching the desktop dashboard default. */
export const USAGE_DAYS = 30;

export type DashboardUsageDailyRow = z.infer<
  typeof DashboardUsageDailyListSchema
>[number];

export type DashboardUsageByAgentRow = z.infer<
  typeof DashboardUsageByAgentListSchema
>[number];

export type DashboardAgentRunTimeRow = z.infer<
  typeof DashboardAgentRunTimeListSchema
>[number];

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

export const usageKeys = {
  all: (wsId: string | null) => ["usage", wsId] as const,
  daily: (wsId: string | null, days: number) =>
    [...usageKeys.all(wsId), "daily", days] as const,
  byAgent: (wsId: string | null, days: number) =>
    [...usageKeys.all(wsId), "by-agent", days] as const,
  agentRunTime: (wsId: string | null, days: number) =>
    [...usageKeys.all(wsId), "agent-runtime", days] as const,
};

export const usageDailyOptions = (
  wsId: string | null,
  days: number = USAGE_DAYS,
) =>
  queryOptions({
    queryKey: usageKeys.daily(wsId, days),
    // Return types are stated explicitly: parseWithFallback infers
    // never[] from the empty fallback, but the runtime shape still comes
    // from the zod schema.
    queryFn: async ({ signal }): Promise<DashboardUsageDailyRow[]> => {
      const raw = await fetchWorkspaceJson(
        `/api/dashboard/usage/daily?days=${days}`,
        signal,
      );
      return parseWithFallback(raw, DashboardUsageDailyListSchema, [], {
        endpoint: "GET /api/dashboard/usage/daily",
      });
    },
    enabled: !!wsId,
  });

export const usageByAgentOptions = (
  wsId: string | null,
  days: number = USAGE_DAYS,
) =>
  queryOptions({
    queryKey: usageKeys.byAgent(wsId, days),
    queryFn: async ({ signal }): Promise<DashboardUsageByAgentRow[]> => {
      const raw = await fetchWorkspaceJson(
        `/api/dashboard/usage/by-agent?days=${days}`,
        signal,
      );
      return parseWithFallback(raw, DashboardUsageByAgentListSchema, [], {
        endpoint: "GET /api/dashboard/usage/by-agent",
      });
    },
    enabled: !!wsId,
  });

export const usageAgentRunTimeOptions = (
  wsId: string | null,
  days: number = USAGE_DAYS,
) =>
  queryOptions({
    queryKey: usageKeys.agentRunTime(wsId, days),
    queryFn: async ({ signal }): Promise<DashboardAgentRunTimeRow[]> => {
      const raw = await fetchWorkspaceJson(
        `/api/dashboard/agent-runtime?days=${days}`,
        signal,
      );
      return parseWithFallback(raw, DashboardAgentRunTimeListSchema, [], {
        endpoint: "GET /api/dashboard/agent-runtime",
      });
    },
    enabled: !!wsId,
  });
