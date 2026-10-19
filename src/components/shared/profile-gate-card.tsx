import { Link } from "@tanstack/react-router";
import { ShieldAlert, ArrowRight, Lock, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfileCompletion } from "@/hooks/use-profile-completion";
import { useAuth } from "@/hooks/use-auth";

export function ProfileGateCard() {
  const { role } = useAuth();
  const { isLocationSearchUnlocked, missingLocationRequirements, items, loading } =
    useProfileCompletion();

  if (loading || isLocationSearchUnlocked) return null;

  const targetLink = role === "tutor" ? "/tutor/profile" : "/student/profile";

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-linear-to-br from-amber-500/10 via-card to-rose-500/5 p-6 shadow-md mb-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md">
            <Lock className="h-6 w-6" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">
                Profile Verification Required for Location-Based Search
              </h3>
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                Mandatory
              </span>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
              To ensure platform trust, student safety, and accurate distance calculation for home
              tuition, both students and tutors must complete their profile with verified{" "}
              <strong className="text-foreground">
                Mobile Number, Home Location, Current or Passed Study Institution, and Academic Grade
              </strong>{" "}
              before using location-based discovery.
            </p>

            {/* Checklist of missing required items */}
            <div className="pt-2">
              <p className="text-xs font-bold text-foreground mb-1.5 uppercase tracking-wider">
                Missing required items:
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {missingLocationRequirements.map((req) => (
                  <div
                    key={req}
                    className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-background/80 px-3 py-1.5 text-xs text-foreground"
                  >
                    <XCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>{req}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 self-start sm:self-center">
          <Button asChild size="default" className="gap-2 font-bold shadow-sm">
            <Link to={targetLink}>
              Complete Profile Now <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
