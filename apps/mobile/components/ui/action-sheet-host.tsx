/**
 * ActionSheetHost — the Android half of `lib/show-action-sheet.ts`.
 * Mounted once in the workspace layout; renders the pending
 * action-sheet request as a bottom sheet (transparent Modal + dimmed
 * backdrop + card, the same shape as `components/chat/agent-picker-
 * sheet.tsx`). iOS never reaches this component: its requests go to
 * the native ActionSheetIOS instead.
 *
 * Selection and dismissal both invoke the request's callback with an
 * ActionSheetIOS-compatible index: the tapped option's index, or the
 * cancel index (or -1 when none was given) for backdrop / back-button /
 * Cancel-row dismissal. The request is cleared BEFORE the callback runs
 * so a callback that opens a nested sheet (comment reactions) is not
 * wiped by the dismissal.
 */
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { continuousCorners } from "@/lib/radius";
import { useActionSheetStore } from "@/data/action-sheet-store";

export function ActionSheetHost() {
  const request = useActionSheetStore((s) => s.request);
  const dismiss = useActionSheetStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  const close = (index: number) => {
    const req = useActionSheetStore.getState().request;
    dismiss();
    req?.onSelect(index);
  };

  const cancelIndex = request?.cancelButtonIndex ?? -1;
  // Keep original indices alongside labels: duplicate labels must still
  // route to the option the user tapped, not the first match.
  const actions = (request?.options ?? [])
    .map((label, index) => ({ label, index }))
    .filter(({ index }) => index !== request?.cancelButtonIndex);
  const cancelLabel =
    request && request.cancelButtonIndex !== undefined
      ? request.options[request.cancelButtonIndex]
      : undefined;

  return (
    <Modal
      visible={!!request}
      transparent
      animationType="slide"
      onRequestClose={() => close(cancelIndex)}
    >
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={() => close(cancelIndex)}
      >
        <Pressable onPress={() => {}} style={{ paddingBottom: insets.bottom }}>
          <View
            className="bg-popover rounded-t-2xl overflow-hidden"
            style={continuousCorners}
          >
            {request?.title ? (
              <View className="px-4 py-3 border-b border-border">
                <Text className="text-base font-semibold text-foreground text-center">
                  {request.title}
                </Text>
              </View>
            ) : null}
            <ScrollView className="max-h-96">
              {actions.map(({ label, index }) => {
                const destructive =
                  index === request!.destructiveButtonIndex;
                return (
                  <Pressable
                    key={`${index}-${label}`}
                    onPress={() => close(index)}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    className="px-4 py-3.5 active:bg-secondary border-b border-border"
                  >
                    <Text
                      className={cn(
                        "text-base text-center",
                        destructive
                          ? "text-destructive font-medium"
                          : "text-foreground",
                      )}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {cancelLabel !== undefined ? (
              <Pressable
                onPress={() => close(cancelIndex)}
                accessibilityRole="button"
                accessibilityLabel={cancelLabel}
                className="px-4 py-3.5 active:bg-secondary mt-2 border-t border-border"
              >
                <Text className="text-base text-center font-semibold text-foreground">
                  {cancelLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
