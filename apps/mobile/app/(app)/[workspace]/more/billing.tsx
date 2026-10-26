/**
 * Billing page — read-only subscription summary for the workspace.
 *
 * Mirrors the web Billing tab (`packages/views/settings/components/
 * billing-tab.tsx`) in read-only form: plan, status, billing interval,
 * current period end, and seat figures. No checkout, portal, or seat
 * purchase flow lives here — those stay on the web version.
 *
 * Data gating mirrors the inbox quota notice
 * (`app/(app)/[workspace]/inbox/[id].tsx`): the app config's feature
 * flags decide whether workspace subscriptions exist on this deployment.
 * When the flag is off, the summary endpoint is never queried and the
 * screen says billing is unavailable here instead of showing an error.
 * When the flag is on but the summary comes back null or errors, that
 * is a real failure and the screen shows an error state with retry —
 * matching web's `summaryUnavailable` (error, or fetched-but-null).
 *
 * Title is registered in the parent `_layout.tsx` (Stack.Screen for
 * `more/billing`); no in-screen title override lives here.
 */
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { BILLING_WORKSPACE_SUBSCRIPTIONS_FLAG } from "@multica/core/feature-flags";
import type { WorkspaceSubscriptionSummary } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  appConfigOptions,
  workspaceSubscriptionSummaryOptions,
} from "@/data/queries/billing";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export default function BillingPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("more_billing");

  const configQuery = useQuery(appConfigOptions());
  const billingEnabled =
    configQuery.data?.feature_flags?.[
      BILLING_WORKSPACE_SUBSCRIPTIONS_FLAG
    ] === true;
  const summaryQuery = useQuery(
    workspaceSubscriptionSummaryOptions(wsId, billingEnabled),
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      {configQuery.isLoading ? (
        <BillingLoading />
      ) : configQuery.error ? (
        <ErrorState
          message={t("errors.load_failed", {
            message:
              configQuery.error instanceof Error
                ? configQuery.error.message
                : "unknown",
          })}
          onRetry={() => configQuery.refetch()}
        />
      ) : !billingEnabled ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-muted-foreground text-center">
            {t("unavailable.message")}
          </Text>
        </View>
      ) : summaryQuery.isLoading ? (
        <BillingLoading />
      ) : summaryQuery.error || !summaryQuery.data ? (
        <ErrorState
          message={t("errors.load_failed", {
            message:
              summaryQuery.error instanceof Error
                ? summaryQuery.error.message
                : "unknown",
          })}
          onRetry={() => summaryQuery.refetch()}
        />
      ) : (
        <BillingSummary summary={summaryQuery.data} />
      )}
    </SafeAreaView>
  );
}

function BillingSummary({
  summary,
}: {
  summary: WorkspaceSubscriptionSummary;
}) {
  const { t } = useT("more_billing");
  const { entitlement } = summary;
  const periodEnd = formatDate(entitlement.currentPeriodEnd);
  const graceUntil = formatDate(summary.graceUntil);
  const capacity = summary.seatCapacity;
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 py-4 gap-6"
    >
      <SectionGroup title={t("plan.title")}>
        <DetailRow label={t("plan.name")} value={entitlement.plan} />
        <Separator />
        <DetailRow label={t("plan.status")} value={entitlement.status} />
        {summary.billingInterval ? (
          <>
            <Separator />
            <DetailRow
              label={t("plan.interval.label")}
              value={t(`plan.interval.${summary.billingInterval}`)}
            />
          </>
        ) : null}
        {periodEnd ? (
          <>
            <Separator />
            <DetailRow label={t("plan.period_end")} value={periodEnd} />
          </>
        ) : null}
        {summary.cancelAtPeriodEnd ? (
          <>
            <Separator />
            <View className="px-4 py-3.5">
              <Text className="text-sm text-muted-foreground">
                {t("plan.cancel_at_period_end")}
              </Text>
            </View>
          </>
        ) : null}
        {graceUntil ? (
          <>
            <Separator />
            <DetailRow label={t("plan.grace_until")} value={graceUntil} />
          </>
        ) : null}
      </SectionGroup>

      <SectionGroup title={t("seats.title")}>
        <DetailRow
          label={t("seats.included")}
          value={String(entitlement.seats)}
        />
        <Separator />
        <DetailRow
          label={t("seats.members")}
          value={String(summary.humanMembers)}
        />
        {capacity ? (
          <>
            <Separator />
            <DetailRow
              label={t("seats.purchased")}
              value={String(capacity.purchased)}
            />
            <Separator />
            <DetailRow
              label={t("seats.used")}
              value={String(capacity.used)}
            />
            <Separator />
            <DetailRow
              label={t("seats.available")}
              value={String(capacity.available)}
            />
          </>
        ) : null}
      </SectionGroup>

      <Text className="text-xs text-muted-foreground px-1">
        {t("note.read_only")}
      </Text>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3.5 gap-3">
      <Text className="text-base text-muted-foreground">{label}</Text>
      <Text
        className="text-base text-foreground font-medium text-right flex-1"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function SectionGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs uppercase tracking-wider text-muted-foreground px-1">
        {title}
      </Text>
      <View className="rounded-md border border-border bg-card overflow-hidden">
        {children}
      </View>
    </View>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useT("more_billing");
  return (
    <View className="px-4 gap-3 pt-4">
      <Text className="text-sm text-destructive">{message}</Text>
      <Button variant="outline" onPress={onRetry}>
        <Text>{t("common:actions.retry")}</Text>
      </Button>
    </View>
  );
}

/** Skeleton mirrors the summary layout (two section groups of detail rows)
 *  so the eye sees a settings-like structure instead of a spinner. */
function BillingLoading() {
  return (
    <View className="px-4 py-4 gap-6">
      {[3, 2].map((rows, groupIdx) => (
        <View key={groupIdx} className="gap-2">
          <Skeleton className="h-3 w-16 ml-1" />
          <View className="rounded-md border border-border overflow-hidden">
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <View
                key={rowIdx}
                className="flex-row items-center justify-between px-4 py-3.5"
              >
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-16" />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
