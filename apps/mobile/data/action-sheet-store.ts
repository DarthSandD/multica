/**
 * Android action-sheet request store. `ActionSheetIOS` is iOS-only, so
 * every menu that used it goes through `lib/show-action-sheet.ts`, which
 * routes iOS to the native sheet and Android here. `ActionSheetHost`
 * (mounted once in the workspace layout) renders the pending request as
 * a bottom sheet; the host owns invoking the callback so a nested sheet
 * opened from a selection callback (comment reactions) replaces the
 * dismissed one instead of being cleared by it.
 *
 * Only one sheet is ever pending: a new request replaces the old one.
 */
import { create } from "zustand";

export interface ActionSheetRequestOptions {
  title?: string;
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number;
}

export interface ActionSheetRequest extends ActionSheetRequestOptions {
  onSelect: (index: number) => void;
}

interface State {
  request: ActionSheetRequest | null;
  show: (
    options: ActionSheetRequestOptions,
    onSelect: (index: number) => void,
  ) => void;
  dismiss: () => void;
}

export const useActionSheetStore = create<State>((set) => ({
  request: null,
  show: (options, onSelect) => set({ request: { ...options, onSelect } }),
  dismiss: () => set({ request: null }),
}));
