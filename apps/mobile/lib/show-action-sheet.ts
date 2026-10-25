/**
 * showActionSheet — ActionSheetIOS-compatible action menu that works on
 * both platforms. iOS uses the native sheet unchanged; Android has no
 * ActionSheetIOS, so the request goes to the action-sheet store and is
 * rendered as a bottom sheet by `ActionSheetHost` (mounted once in the
 * workspace layout).
 *
 * The callback contract matches ActionSheetIOS: it receives the tapped
 * option's index, or the cancel index when the sheet is dismissed
 * without a selection.
 */
import { ActionSheetIOS, Platform } from "react-native";
import {
  useActionSheetStore,
  type ActionSheetRequestOptions,
} from "@/data/action-sheet-store";

export type { ActionSheetRequestOptions as ShowActionSheetOptions };

export function showActionSheet(
  options: ActionSheetRequestOptions,
  callback: (buttonIndex: number) => void,
): void {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(options, callback);
    return;
  }
  useActionSheetStore.getState().show(options, callback);
}
