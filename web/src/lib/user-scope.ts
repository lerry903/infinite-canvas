import { localForageStorage } from "@/lib/localforage-storage";

export const ANONYMOUS_USER_ID = "anonymous";
export const USER_ID_STORAGE_KEY = "infinite-canvas:current-user-id";
export const USER_SCOPE_CHANGED_EVENT = "infinite-canvas:user-scope-changed";

export function getCurrentUserId() {
    if (typeof window === "undefined") return ANONYMOUS_USER_ID;
    return window.localStorage.getItem(USER_ID_STORAGE_KEY)?.trim() || ANONYMOUS_USER_ID;
}

export function setCurrentUserId(userId: string | null) {
    if (typeof window === "undefined") return;
    if (userId?.trim()) window.localStorage.setItem(USER_ID_STORAGE_KEY, userId.trim());
    else window.localStorage.removeItem(USER_ID_STORAGE_KEY);
    window.dispatchEvent(new Event(USER_SCOPE_CHANGED_EVENT));
}

/** Storage adapter whose records are namespaced by the authenticated user. */
export const userScopedStorage = {
    getItem: (name: string) => localForageStorage.getItem(`${name}:${getCurrentUserId()}`),
    setItem: (name: string, value: string) => localForageStorage.setItem(`${name}:${getCurrentUserId()}`, value),
    removeItem: (name: string) => localForageStorage.removeItem(`${name}:${getCurrentUserId()}`),
};
