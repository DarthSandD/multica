/**
 * MoreTabDropdownAnchor — the popover that opens when the More tab is
 * tapped. Mounted as a sibling to the Tabs view, NOT as the tab button
 * itself: that way the real More tab button stays a standard React
 * Navigation `PlatformPressable` (icon + "More" label, full visual
 * parity with Inbox / My Issues / Chat).
 *
 * The wrapper View is absolute-positioned over the More tab's screen
 * rect (right 25%, bottom = safe-area, height = tab bar). It uses
 * `pointerEvents="box-none"` so taps pass through to the real tab
 * button underneath; we open the dropdown imperatively from the tab's
 * `listeners.tabPress` via the exposed `TriggerRef.open()`. The
 * @rn-primitives Trigger measures its own layout inside `open()`, so
 * the popover anchors to this invisible Pressable's rect — i.e.
 * directly above the More tab.
 *
 * Why ref-controlled instead of `asChild` on the tab button: a previous
 * attempt wrapped a custom tabBarButton in `<DropdownMenu.Root>` +
 * Trigger asChild. RN's BottomTabItem wraps the returned button in
 * `<View style={{flex:1}}>` and expects a single Pressable child. Our
 * Root introduced an extra wrapping `View` with no flex:1, collapsing
 * the More cell and stripping the label. The Option B pattern here
 * leaves the real tab button entirely alone.
 *
 * Visual conventions inside the popover (apps/mobile/CLAUDE.md):
 *   - All glyphs go through `<SFSymbol>` (SF Symbols on iOS, the
 *     closest Ionicons glyph on Android), so they share the visual
 *     language of the bottom tab bar icons on both platforms.
 *   - All colours route through THEME tokens (foreground /
 *     mutedForeground / secondary), so dark mode is automatic.
 *   - Workspace is collapsed to a single `<WorkspaceCard>` row (icon +
 *     current workspace name + chevron). Tapping it dismisses the popover
 *     and pushes `/${slug}/switch-workspace`, a formSheet that lists every
 *     workspace and triggers an iOS `Alert.alert` confirm before switching.
 *     Earlier shape (every workspace inlined here) made the popover long
 *     and offered no friction against accidental taps.
 */
import { useMemo } from "react";
import { Image, Platform, Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { router, usePathname } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TriggerRef } from "@rn-primitives/dropdown-menu";
import type { User, Workspace } from "@multica/core/types";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Text } from "@/components/ui/text";
import { SFSymbol } from "@/components/ui/sf-icon";
import { WorkspaceAvatar } from "@/components/workspace/workspace-avatar";
import { workspaceListOptions } from "@/data/queries/workspaces";
import { pinListOptions } from "@/data/queries/pins";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";
import { useColorScheme } from "@/lib/use-color-scheme";
import { usePressScale } from "@/lib/spring-touch";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Bottom tab bar height above the safe-area, used only to size the
// invisible anchor rect the popover positions against. iOS: React
// Navigation doesn't expose this as a layout constant, but the value is
// stable across Expo Router 55 / RN Screens 4 — see BottomTabBar.tsx in
// @react-navigation/bottom-tabs (`styles.tab` has no explicit height;
// the container settles at 49 from the inner padding + icon size).
// Android: the Material bottom-navigation standard height (56); the
// anchor only sets the popover's vertical origin, so a few px of error
// would overlap the tab bar slightly, not break the menu.
const TAB_BAR_HEIGHT = Platform.select({ ios: 49, android: 56, default: 49 });

interface NavItem {
  labelKey:
    | "more_menu.pinned"
    | "more_menu.issues"
    | "more_menu.projects"
    | "more_menu.agents"
    | "more_menu.members"
    | "more_menu.squads"
    | "more_menu.runtimes"
    | "more_menu.skills"
    | "more_menu.autopilots"
    | "more_menu.usage"
    | "more_menu.billing"
    | "routes.workspace_settings"
    | "routes.settings";
  /** SF Symbol name, rendered via `<SFSymbol>`. */
  icon: string;
  /** Path under /:slug/ — final href is `/${slug}${path}`. */
  path: string;
}

interface NavGroup {
  labelKey:
    | "more_menu.groups.pinned"
    | "more_menu.groups.work"
    | "more_menu.groups.ai_team"
    | "more_menu.groups.workspace"
    | "more_menu.groups.utility";
  items: NavItem[];
}

/**
 * Desktop sidebar order, adapted to the phone (desktop-look spec §5.1):
 * Pinned, then Work (Issues, Projects, Autopilots), AI Team (Agents,
 * Squads, Skills, Runtimes), Workspace (Members, Workspace Settings),
 * Utility (Usage, Billing, Settings). Agents uses `cpu`, not Chat's
 * `bubble.left` — desktop Agents is Bot, and the chip glyph maps on
 * both platforms. Workspace Settings uses `building.2`; Settings uses
 * `gear`, so the two adjacent gears problem does not arise.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "more_menu.groups.pinned",
    items: [{ labelKey: "more_menu.pinned", icon: "pin", path: "/more/pins" }],
  },
  {
    labelKey: "more_menu.groups.work",
    items: [
      { labelKey: "more_menu.issues", icon: "list.bullet", path: "/more/issues" },
      { labelKey: "more_menu.projects", icon: "square.stack", path: "/more/projects" },
      {
        labelKey: "more_menu.autopilots",
        icon: "bolt.fill",
        path: "/more/autopilots",
      },
    ],
  },
  {
    labelKey: "more_menu.groups.ai_team",
    items: [
      { labelKey: "more_menu.agents", icon: "cpu", path: "/more/agents" },
      { labelKey: "more_menu.squads", icon: "person.3", path: "/more/squads" },
      { labelKey: "more_menu.skills", icon: "square.stack.3d", path: "/more/skills" },
      { labelKey: "more_menu.runtimes", icon: "server.rack", path: "/more/runtimes" },
    ],
  },
  {
    labelKey: "more_menu.groups.workspace",
    items: [
      { labelKey: "more_menu.members", icon: "person.2", path: "/more/members" },
      {
        labelKey: "routes.workspace_settings",
        icon: "building.2",
        path: "/more/workspace-settings",
      },
    ],
  },
  {
    labelKey: "more_menu.groups.utility",
    items: [
      { labelKey: "more_menu.usage", icon: "chart.bar.fill", path: "/more/usage" },
      { labelKey: "more_menu.billing", icon: "checklist", path: "/more/billing" },
      { labelKey: "routes.settings", icon: "gear", path: "/more/settings" },
    ],
  },
];

export function MoreTabDropdownAnchor({
  triggerRef,
}: {
  triggerRef: React.RefObject<TriggerRef | null>;
}) {
  const insets = useSafeAreaInsets();
  const slug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const { colorScheme } = useColorScheme();
  const { t } = useT("navigation");
  const theme = THEME[colorScheme];
  const currentWorkspace = useCurrentWorkspace(slug);

  // The Pinned group renders only when the pins query returns at least
  // one pin — desktop hides an empty Pinned group the same way. While
  // the query is loading or disabled the group is omitted, never empty.
  const pinsQuery = useQuery(
    pinListOptions(wsId, user?.id ?? null),
  );
  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.filter(
        (group) =>
          group.labelKey !== "more_menu.groups.pinned" ||
          (pinsQuery.data?.length ?? 0) > 0,
      ),
    [pinsQuery.data],
  );

  const isActive = (path: string) => {
    if (!slug) return false;
    const target = `/${slug}${path}`;
    return pathname === target || pathname.startsWith(target + "/");
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        right: 0,
        bottom: insets.bottom,
        width: "25%",
        height: TAB_BAR_HEIGHT,
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger ref={triggerRef} asChild>
          {/* Invisible, non-tappable: the real tab button below catches
              all touches; we open this trigger imperatively via ref.
              The Pressable just provides a measurable rect for the
              popover to anchor against. */}
          <Pressable
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: "100%", height: "100%" }}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={6}
          className="w-72 p-2"
        >
          <UserCard
            user={user}
            onPress={() => slug && router.push(`/${slug}/more/settings`)}
            chevronTint={theme.mutedForeground}
          />

          <DropdownMenuSeparator />

          <WorkspaceCard
            currentWorkspaceName={currentWorkspace?.name}
            currentWorkspaceAvatarUrl={currentWorkspace?.avatar_url}
            onPress={() =>
              slug && router.push(`/${slug}/switch-workspace`)
            }
            chevronTint={theme.mutedForeground}
          />

          <DropdownMenuSeparator />

          {visibleGroups.map((group) => (
            <View key={group.labelKey}>
              <DropdownMenuLabel className="px-4 uppercase tracking-wider">
                {t(group.labelKey)}
              </DropdownMenuLabel>
              {group.items.map((item) => (
                <PopoverRow
                  key={item.path}
                  item={item}
                  active={isActive(item.path)}
                  onPress={() => slug && router.push(`/${slug}${item.path}`)}
                />
              ))}
            </View>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

/**
 * One popover nav row with iOS Touch press feedback: the row scales to
 * 0.97 on the snappy spring while pressed and springs back on release.
 * The Animated wrapper carries the transform; the DropdownMenuItem keeps
 * its own press handling, so navigation and active styling are
 * unchanged. Transform only, no layout properties; reduced motion swaps
 * the spring for the library's short bounce-free timing animation.
 */
function PopoverRow({
  item,
  active,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useT("navigation");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const { animatedStyle, onPressIn, onPressOut } = usePressScale({
    pressedScale: 0.97,
    preset: "snappy",
  });
  return (
    <Animated.View style={animatedStyle}>
      <DropdownMenuItem
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityLabel={t(item.labelKey)}
        className={cn("h-9 gap-3", active && "bg-secondary")}
      >
        <SFSymbol name={item.icon} size={18} color={theme.foreground} />
        <Text className="text-sm text-foreground">{t(item.labelKey)}</Text>
      </DropdownMenuItem>
    </Animated.View>
  );
}

/**
 * iOS-list-row identity card. Right-side `chevron.right` is the standard
 * disclosure indicator (UITableViewCellAccessoryDisclosureIndicator);
 * this row navigates into settings, so the chevron is idiomatic even
 * though menu items elsewhere in the popover don't use it.
 */
function UserCard({
  user,
  onPress,
  chevronTint,
}: {
  user: User | null;
  onPress: () => void;
  chevronTint: string;
}) {
  const initial = (user?.name ?? user?.email ?? "U").charAt(0).toUpperCase();
  const { t } = useT("navigation");
  return (
    <DropdownMenuItem
      onPress={onPress}
      className="h-12 gap-3"
      accessibilityLabel={t("more_menu.account_settings")}
    >
      {user?.avatar_url ? (
        <Image
          source={{ uri: user.avatar_url }}
          className="size-8 rounded-full bg-muted"
        />
      ) : (
        <View className="size-8 rounded-full bg-muted items-center justify-center">
          <Text className="text-xs font-medium text-muted-foreground">
            {initial}
          </Text>
        </View>
      )}
      <View className="flex-1 min-w-0">
        <Text
          className="text-sm font-medium text-foreground"
          numberOfLines={1}
        >
          {user?.name ?? "—"}
        </Text>
        {user?.email ? (
          <Text
            className="text-xs text-muted-foreground"
            numberOfLines={1}
          >
            {user.email}
          </Text>
        ) : null}
      </View>
      <SFSymbol name="chevron.right" size={12} color={chevronTint} />
    </DropdownMenuItem>
  );
}

/**
 * Collapsed single-row entry that shows the current workspace name and
 * pushes the switch-workspace formSheet on tap. Same shape as `UserCard`
 * above — `chevron.right` disclosure indicator signals "tap to descend".
 * Auto-closes the popover because `DropdownMenuItem.onPress` dismisses
 * the menu before our handler runs.
 *
 * When the workspaces query hasn't resolved yet, we still render the row
 * using the slug-derived name from the store so the popover doesn't
 * jump-resize on first open; the row remains tappable because the
 * switch-workspace sheet has its own loading state.
 *
 * Single-workspace users: handled in `MoreTabDropdownAnchor` by passing
 * `disabled` — the row renders with no chevron and no press effect.
 */
function WorkspaceCard({
  currentWorkspaceName,
  currentWorkspaceAvatarUrl,
  onPress,
  chevronTint,
}: {
  currentWorkspaceName: string | undefined;
  currentWorkspaceAvatarUrl: string | null | undefined;
  onPress: () => void;
  chevronTint: string;
}) {
  const { t } = useT("navigation");
  const { data } = useQuery(workspaceListOptions());
  const canSwitch = (data?.length ?? 0) > 1;

  return (
    <DropdownMenuItem
      onPress={onPress}
      disabled={!canSwitch}
      className="h-12 gap-3"
      accessibilityLabel={
        canSwitch
          ? t("settings:workspace.switch")
          : currentWorkspaceName ?? t("settings:account.workspace")
      }
    >
      <WorkspaceAvatar
        name={currentWorkspaceName ?? t("settings:account.workspace")}
        avatarUrl={currentWorkspaceAvatarUrl}
        size={32}
      />
      <View className="flex-1 min-w-0">
        <Text
          className="text-sm font-medium text-foreground"
          numberOfLines={1}
        >
          {currentWorkspaceName ?? t("settings:account.workspace")}
        </Text>
      </View>
      {canSwitch ? (
        <SFSymbol name="chevron.right" size={12} color={chevronTint} />
      ) : null}
    </DropdownMenuItem>
  );
}

function useCurrentWorkspace(slug: string | null): Workspace | undefined {
  const { data } = useQuery(workspaceListOptions());
  return useMemo(
    () => (slug ? data?.find((w) => w.slug === slug) : undefined),
    [data, slug],
  );
}
