import { Link } from "@tanstack/react-router";
import { GraduationCap, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RatingStars } from "@/components/shared/rating-stars";
import { UserAvatar } from "@/components/shared/user-avatar";
import { formatTaka } from "@/lib/edubridge";
import { formatDistance } from "@/lib/geo";

export type TutorListItem = {
  id: string;
  user_id: string;
  bio: string | null;
  qualifications?: string | null;
  subjects: string[];
  levels: string[];
  hourly_rate: number | string;
  avg_rating: number | string;
  total_reviews: number;
  experience_years: number;
  profiles: { full_name: string; avatar_url: string | null; address?: string | null; phone?: string | null } | null;
};

export function TutorCard({
  tutor,
  matchScore,
  distanceKm,
}: {
  tutor: TutorListItem;
  matchScore?: number;
  distanceKm?: number | null;
}) {
  const name = tutor.profiles?.full_name ?? "Tutor";
  return (
    <article className="flex h-full w-full min-w-0 max-w-full flex-col rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm transition-shadow hover:shadow-md overflow-hidden">
      <div className="flex items-start gap-3 min-w-0 w-full">
        <UserAvatar name={name} path={tutor.profiles?.avatar_url} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1 overflow-hidden">
          <h3 className="truncate text-base font-semibold text-foreground">{name}</h3>
          {tutor.qualifications && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground flex items-center gap-1 font-medium">
              <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate">{tutor.qualifications}</span>
            </p>
          )}
          {tutor.profiles?.address && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              <span className="truncate">{tutor.profiles.address}</span>
            </p>
          )}
          <RatingStars value={tutor.avg_rating} showValue count={tutor.total_reviews} className="mt-1" />
        </div>
        {(typeof matchScore === "number" || typeof distanceKm === "number") && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            {typeof matchScore === "number" && (
              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                {matchScore}% match
              </Badge>
            )}
            {typeof distanceKm === "number" && (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] gap-1 py-0.5 whitespace-nowrap">
                <MapPin className="h-3 w-3" /> {formatDistance(distanceKm)}
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 w-full min-w-0">
        {tutor.subjects.slice(0, 4).map((s) => (
          <Badge key={s} variant="secondary" className="font-normal text-xs">
            {s}
          </Badge>
        ))}
      </div>

      {tutor.bio && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground break-words w-full min-w-0">
          {tutor.bio}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4 w-full min-w-0 gap-2">
        <div className="min-w-0">
          <p className="text-base sm:text-lg font-semibold text-foreground truncate">{formatTaka(tutor.hourly_rate)}</p>
          <p className="text-xs text-muted-foreground truncate">per session</p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to="/student/tutor/$id" params={{ id: tutor.id }}>
            View profile
          </Link>
        </Button>
      </div>
    </article>
  );
}
