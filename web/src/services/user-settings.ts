import type { AiConfig, WebdavSyncConfig } from "@/stores/use-config-store";

export type UserSettingsPayload = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
};

/** Optional server boundary for authenticated deployments. Local stores remain the offline fallback. */
export async function fetchUserSettings(): Promise<UserSettingsPayload | null> {
    const response = await fetch("/api/me/settings", { credentials: "include" });
    if (response.status === 404 || response.status === 401) return null;
    if (!response.ok) throw new Error(`Failed to load user settings (${response.status})`);
    if (!response.headers.get("content-type")?.includes("application/json")) return null;
    return (await response.json()) as UserSettingsPayload;
}

export async function saveUserSettings(payload: UserSettingsPayload) {
    const response = await fetch("/api/me/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (response.status === 404 || response.status === 401) return false;
    if (!response.ok) throw new Error(`Failed to save user settings (${response.status})`);
    return true;
}
