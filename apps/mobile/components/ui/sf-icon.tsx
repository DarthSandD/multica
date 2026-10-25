/**
 * SFSymbol — an SF Symbol glyph that also renders on Android.
 *
 * iOS renders the symbol exactly as before via expo-image (`sf:` source),
 * so iOS visuals are unchanged. SF Symbols are iOS-only: on Android the
 * same name maps to the closest Ionicons glyph (the rest of the app
 * already uses @expo/vector-icons for its icons).
 *
 * Callers pass the SF Symbol name, never a platform branch — the branch
 * lives here, once, so a new `sf:` call site cannot silently render
 * nothing on Android again.
 */
import { Platform, type ColorValue } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

/** SF Symbol name -> Ionicons name. Keep in sync with every `sf:` name
 *  used through this component; unknown names fall back to a neutral dot
 *  rather than rendering nothing. */
const ANDROID_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "tray.fill": "mail",
  tray: "mail-outline",
  "checklist": "checkbox",
  "checklist.unchecked": "checkbox-outline",
  "bubble.left.fill": "chatbubble",
  "bubble.left": "chatbubble-outline",
  ellipsis: "ellipsis-horizontal",
  "chevron.right": "chevron-forward",
  checkmark: "checkmark",
  pin: "pin",
  "list.bullet": "list",
  "square.stack": "layers-outline",
};

export function SFSymbol({
  name,
  size,
  color,
}: {
  /** SF Symbol name, e.g. "tray.fill". */
  name: string;
  size: number;
  /** ColorValue because tabBarIcon hands us one; every call site passes
   *  a theme string, which is what both renderers accept. */
  color: ColorValue;
}) {
  const tint = color as string;
  if (Platform.OS === "android") {
    return (
      <Ionicons
        name={ANDROID_ICONS[name] ?? "ellipse-outline"}
        size={size}
        color={tint}
      />
    );
  }
  return (
    <ExpoImage
      source={`sf:${name}`}
      tintColor={tint}
      style={{ width: size, height: size, color }}
    />
  );
}
