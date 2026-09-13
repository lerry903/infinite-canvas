import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { USER_SCOPE_CHANGED_EVENT, userScopedStorage } from "@/lib/user-scope";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "dark",
            setTheme: (theme) => set({ theme }),
        }),
        { name: "infinite-canvas:theme_store", storage: createJSONStorage(() => userScopedStorage) },
    ),
);

if (typeof window !== "undefined") {
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, () => {
        useThemeStore.setState({ theme: "dark" });
        void useThemeStore.persist.rehydrate();
    });
}
