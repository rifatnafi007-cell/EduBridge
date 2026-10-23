import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, PartyPopper, UserCircle, Lock, MapPin } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useProfileCompletion } from "@/hooks/use-profile-completion";
import { cn } from "@/lib/utils";

/**
 * Full card with progress bar + checklist. Use on dashboards.
 * Hides automatically when profile is 100% complete.
 */
export function ProfileCompletionCard() {
  const { percentage, items, incompleteItems, isLocationSearchUnlocked, loading } = useProfileCompletion();

  if (loading) return null;
  if (percentage === 100) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCircle className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Complete your profile</h3>
        </div>
        <span
          className={cn(
            "text-sm font-semibold",
            percentage < 50 ? "text-red-500" : percentage < 100 ? "text-amber-500" : "text-green-500",
          )}
        >
          {percentage}%
        </span>
      </div>

      {/* Progress bar */}
      <Progress
        value={percentage}
        className={cn(
          "mb-4 h-2.5",
          percentage < 50
            ? "[&>div]:bg-red-500"
            : percentage < 100
              ? "[&>div]:bg-amber-500"
              : "[&>div]:bg-green-500",
        )}
      />

      {/* Checklist */}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              {item.completed ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
              )}
              <span className={cn(item.completed ? "text-muted-foreground line-through" : "text-foreground")}>
                {item.label}
              </span>
              {item.isRequiredForLocation && !item.completed && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  Required for location search
                </span>
              )}
            </div>
            {!item.completed && (
              <Link
                to={item.link}
                className="shrink-0 text-xs font-medium text-primary hover:underline"
              >
                Complete →
              </Link>
            )}
          </li>
        ))}
      </ul>

      {!isLocationSearchUnlocked && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <Lock className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>Location-Based Tutor Matching is locked.</strong> Fill in your mobile number, address, institution, and grades to unlock nearest-distance home tuition.
          </span>
        </div>
      )}

      {incompleteItems.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {incompleteItems.length} item{incompleteItems.length > 1 ? "s" : ""} remaining to complete
          your profile.
        </p>
      )}
    </div>
  );
}

/**
 * Compact inline bar for profile pages. Always visible, even at 100%.
 */
export function ProfileCompletionBanner() {
  const { percentage, incompleteItems, loading } = useProfileCompletion();

  if (loading) return null;

  const isComplete = percentage === 100;

  return (
    <div
      className={cn(
        "mb-6 flex items-center gap-4 rounded-xl border p-4 shadow-sm",
        isComplete
          ? "border-green-500/30 bg-green-500/5"
          : "border-border bg-card",
      )}
    >
      {isComplete ? (
        <PartyPopper className="h-5 w-5 shrink-0 text-green-500" />
      ) : (
        <UserCircle className="h-5 w-5 shrink-0 text-primary" />
      )}

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            {isComplete ? "Profile complete!" : "Profile completion"}
          </p>
          <span
            className={cn(
              "text-sm font-semibold",
              percentage < 50 ? "text-red-500" : percentage < 100 ? "text-amber-500" : "text-green-500",
            )}
          >
            {percentage}%
          </span>
        </div>
        <Progress
          value={percentage}
          className={cn(
            "h-2",
            percentage < 50
              ? "[&>div]:bg-red-500"
              : percentage < 100
                ? "[&>div]:bg-amber-500"
                : "[&>div]:bg-green-500",
          )}
        />
        {!isComplete && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Fill in {incompleteItems.length} more field{incompleteItems.length > 1 ? "s" : ""} below
            to reach 100%.
          </p>
        )}
      </div>
    </div>
  );
}
