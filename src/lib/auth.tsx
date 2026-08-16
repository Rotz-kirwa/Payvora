import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginSchema.parse(input))
  .handler(async (ctx) => {
    const { email, password } = ctx.data as z.infer<typeof loginSchema>;
    const { authenticateUser } = await import("./auth.server");
    return authenticateUser(email, password);
  });

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser } = await import("./auth.server");
  return getCurrentUser();
});

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutUser } = await import("./auth.server");
  return logoutUser();
});

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

interface AuthCtx {
  isAuthenticated: boolean;
  user: AuthUser | null;
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser: AuthUser | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const login = async (email: string, password: string) => {
    const result = await loginFn({ data: { email, password } });
    setUser(result.user);
  };

  const logout = async () => {
    try {
      await logoutFn();
    } finally {
      setUser(null);
    }
  };

  // ─── Auto Logout on Inactivity (15 Minutes) ───────────────────────────────
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        logout();
      }, INACTIVITY_TIMEOUT_MS);
    };

    resetTimer();

    let lastActivity = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivity > 3000) {
        lastActivity = now;
        resetTimer();
      }
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
    };
  }, [user]);

  return (
    <Ctx.Provider
      value={{
        isAuthenticated: !!user,
        user,
        email: user?.email ?? null,
        login,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
