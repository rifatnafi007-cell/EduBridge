import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "tutor" | "admin";

export type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  address: string | null;
  is_suspended?: boolean;
};

export function isRecoverySession(token?: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    const base64Url = parts[1];
    if (!base64Url) return false;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    const amr = payload?.amr;
    if (Array.isArray(amr)) {
      return amr.some((item) =>
        typeof item === "string" ? item === "recovery" : item?.method === "recovery"
      );
    }
    return amr === "recovery";
  } catch {
    return false;
  }
}

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  hasTutorProfile: boolean;
  loading: boolean;
  isPasswordRecovery: boolean;
  refresh: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setReady(true);
      if (event === "PASSWORD_RECOVERY" || isRecoverySession(next?.access_token)) {
        setIsPasswordRecovery(true);
      }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (isRecoverySession(data.session?.access_token)) {
        setIsPasswordRecovery(true);
      }
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  const userId = session?.user.id ?? null;

  const accountQuery = useQuery({
    queryKey: ["account", userId],
    enabled: !!userId,
    queryFn: async () => {
      let profile: Profile | null = null;
      const [profileRes, roleRes, tutorRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url, phone, address, is_suspended").eq("id", userId!).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!).maybeSingle(),
        supabase.from("tutor_profiles").select("id").eq("user_id", userId!).maybeSingle(),
      ]);

      if (profileRes.error) {
        const fallback = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, phone, address")
          .eq("id", userId!)
          .maybeSingle();
        profile = (fallback.data as Profile | null) ?? null;
      } else {
        profile = (profileRes.data as Profile | null) ?? null;
      }

      return {
        profile,
        role: (roleRes.data?.role as AppRole | undefined) ?? null,
        hasTutorProfile: !!tutorRes.data,
      };
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile: accountQuery.data?.profile ?? null,
      role: accountQuery.data?.role ?? null,
      hasTutorProfile: accountQuery.data?.hasTutorProfile ?? false,
      loading: !ready || (!!userId && accountQuery.isLoading),
      isPasswordRecovery,
      refresh: () => queryClient.invalidateQueries({ queryKey: ["account", userId] }),
    }),
    [session, accountQuery.data, accountQuery.isLoading, ready, userId, isPasswordRecovery, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function homePathForRole(role: AppRole | null, hasTutorProfile = true) {
  if (role === "student") return "/student/dashboard";
  if (role === "tutor") return hasTutorProfile ? "/tutor/dashboard" : "/tutor/profile-setup";
  if (role === "admin") return "/admin/dashboard";
  return "/select-role";
}
