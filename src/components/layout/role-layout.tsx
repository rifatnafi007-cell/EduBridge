import { useEffect } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth, homePathForRole, type AppRole } from "@/hooks/use-auth";

export function RoleLayout({ allow }: { allow: AppRole }) {
  const { role, loading, hasTutorProfile, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!role) {
      navigate({ to: "/select-role", replace: true });
      return;
    }
    if (role !== allow) {
      navigate({ to: homePathForRole(role, hasTutorProfile), replace: true });
    }
  }, [role, loading, allow, hasTutorProfile, navigate]);

  if (loading || role !== allow) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profile?.is_suspended && role !== "admin") {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Account Suspended</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Your EduBridge student account has been suspended by an administrator due to a policy or guidelines violation.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            If you believe this is an error or wish to appeal, please contact the EduBridge administration team.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
