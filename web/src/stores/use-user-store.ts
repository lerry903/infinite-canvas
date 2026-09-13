import { create } from "zustand";

import { ANONYMOUS_USER_ID, setCurrentUserId } from "@/lib/user-scope";
import { AI_BASE_URL } from "@/constant/runtime-config";
import { fetchUserSettings } from "@/services/user-settings";
import { defaultConfig, useConfigStore } from "@/stores/use-config-store";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
};

type UserStore = {
    user: LocalUser | null;
    hydrated: boolean;
    hydrate: () => Promise<void>;
    setUser: (user: LocalUser | null) => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    hydrated: false,
    hydrate: async () => {
        if (typeof window === "undefined") return;
        try {
            const response = await fetch("/api/session", { credentials: "include" });
            if (response.ok) {
                const data = (await response.json()) as { user?: LocalUser | null };
                const user = data.user || null;
                setCurrentUserId(user?.id || ANONYMOUS_USER_ID);
                set({ user, hydrated: true });
                if (user) {
                    try {
                        const settings = await fetchUserSettings();
                        if (settings) {
                            const serverConfig = settings.config || defaultConfig;
                            const channels = Array.isArray(serverConfig.channels) ? serverConfig.channels : defaultConfig.channels;
                            useConfigStore.setState({
                                config: {
                                    ...defaultConfig,
                                    ...serverConfig,
                                    baseUrl: AI_BASE_URL,
                                    channels: channels.map((channel) => ({ ...channel, baseUrl: AI_BASE_URL })),
                                    proxyEnabled: false,
                                },
                                webdav: settings.webdav || useConfigStore.getState().webdav,
                            });
                        }
                    } catch {
                        // Keep the authenticated user and use that user's local fallback when settings are unavailable.
                    }
                }
                return;
            }
        } catch {
            // Anonymous local mode remains available when no product backend is configured.
        }
        setCurrentUserId(null);
        set({ user: null, hydrated: true });
    },
    setUser: (user) => {
        setCurrentUserId(user?.id || ANONYMOUS_USER_ID);
        set({ user });
    },
    clearSession: () => {
        setCurrentUserId(null);
        set({ user: null });
    },
}));
