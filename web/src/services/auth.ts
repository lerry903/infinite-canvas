import type { LocalUser } from "@/stores/use-user-store";

export async function authenticate(path: "login" | "register", username: string, password: string, displayName?: string) {
    const response = await fetch(`/api/auth/${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, displayName }) });
    const payload = (await response.json().catch(() => ({}))) as { user?: LocalUser; error?: string };
    if (!response.ok || !payload.user) throw new Error(payload.error || "操作失败");
    return payload.user;
}

export async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
