/**
 * Workspace skill queries.
 *
 * Endpoint: `GET /api/skills` — workspace-scoped by the
 * `X-Workspace-Slug` middleware, same as `listRuntimes`. Evidence:
 *   - Server route: `server/cmd/server/router.go` (`/api/skills` → `ListSkills`).
 *   - Web/desktop client: `packages/core/api/client.ts` (`listSkills`,
 *     parsed with `SkillSummaryListSchema`).
 *   - Web list page: `packages/views/skills/components/skills-page.tsx`
 *     (`skillListOptions(wsId)` over the same endpoint).
 *
 * The list payload is `SkillSummary[]` — name + description, no SKILL.md
 * body (bodies are 50-200KB each and live on the detail endpoint only).
 *
 * No `api.listSkills` method exists in `data/api.ts` yet, and that file is
 * outside this change's scope, so the GET lives here and mirrors the
 * `ApiClient.fetch` pattern: Bearer auth, `X-Workspace-Slug` header,
 * 30s timeout with caller-signal forwarding, and `parseWithFallback`
 * against the core schema. When a follow-up moves this into `ApiClient`,
 * this file should go back to a one-line `api.listSkills` call like
 * `data/queries/runtimes.ts` — and the 401 sign-out hook (which only
 * `ApiClient` can invoke) will apply to this endpoint too.
 */
import { queryOptions } from "@tanstack/react-query";
import type { SkillSummary } from "@multica/core/types";
import {
  EMPTY_SKILL_SUMMARY_LIST,
  SkillSummaryListSchema,
} from "@multica/core/api/schemas";
import { ApiError, api } from "@/data/api";
import { getCurrentSlug } from "@/data/workspace-store";
import { parseWithFallback } from "@/lib/parse-response";
import { createRequestId } from "@/lib/request-id";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Same ceiling as `ApiClient` — iOS may suspend a backgrounded network
// task without ever resolving the JS-side fetch promise.
const FETCH_TIMEOUT_MS = 30_000;

async function fetchSkillList(signal?: AbortSignal): Promise<SkillSummary[]> {
  if (!API_URL) {
    throw new ApiError("EXPO_PUBLIC_API_URL is not set", 0, undefined);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client-Platform": "mobile",
    "X-Client-OS": "ios",
    "X-Client-Version": "0.1.0",
    "X-Request-ID": createRequestId(),
  };
  const token = api.getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const slug = getCurrentSlug();
  if (slug) {
    headers["X-Workspace-Slug"] = slug;
  }

  // Timeout + caller-signal forwarding, mirroring `ApiClient.fetch`
  // (Hermes lacks `AbortSignal.timeout()` / `AbortSignal.any()`).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`request timed out after ${FETCH_TIMEOUT_MS}ms`));
  }, FETCH_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onCallerAbort);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/skills`, {
      signal: controller.signal,
      headers,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onCallerAbort);
    if (
      err instanceof Error &&
      err.name === "AbortError" &&
      !signal?.aborted
    ) {
      throw new ApiError(
        `Request timed out after ${FETCH_TIMEOUT_MS}ms`,
        0,
        undefined,
      );
    }
    throw err;
  }
  clearTimeout(timeoutId);
  signal?.removeEventListener("abort", onCallerAbort);

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

  const raw: unknown = await res.json();
  return parseWithFallback(raw, SkillSummaryListSchema, EMPTY_SKILL_SUMMARY_LIST, {
    endpoint: "GET /api/skills",
  });
}

export const skillListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: ["skills", wsId] as const,
    queryFn: ({ signal }) => fetchSkillList(signal),
    enabled: !!wsId,
  });
