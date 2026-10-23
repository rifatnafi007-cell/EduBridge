import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Eye,
  GraduationCap,
  Users,
  Shield,
  UserCheck,
  CheckCircle2,
  XCircle,
  Phone,
  MapPin,
  Calendar,
  AlertTriangle,
  Copy,
  Check,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { RowsSkeleton } from "@/components/shared/loading-skeleton";
import { UserAvatar } from "@/components/shared/user-avatar";
import { RatingStars } from "@/components/shared/rating-stars";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatTaka } from "@/lib/edubridge";

export const Route = createFileRoute("/_authenticated/admin/users")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Users — EduBridge admin" },
      { name: "description", content: "Browse, inspect, and moderate students, tutors, and administrators." },
      { property: "og:title", content: "Users — EduBridge admin" },
      { property: "og:description", content: "User directory and account moderation on EduBridge." },
    ],
  }),
  component: AdminUsers,
});

type TutorDetail = {
  id: string;
  user_id: string;
  is_active: boolean;
  hourly_rate: number | string;
  avg_rating: number;
  total_reviews: number;
  subjects: string[];
  levels: string[];
  qualifications: string | null;
  experience_years: number;
  bio: string | null;
};

type JoinedUser = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  role: "student" | "tutor" | "admin" | "unassigned";
  is_suspended?: boolean;
  tutorProfile?: TutorDetail;
};

const ROLE_TABS = ["all", "student", "tutor", "admin"] as const;

const ROLE_LABELS: Record<JoinedUser["role"], string> = {
  student: "Student",
  tutor: "Tutor",
  admin: "Admin",
  unassigned: "Unassigned",
};

export function AdminUsers() {
  const { user: currentAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [roleTab, setRoleTab] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<JoinedUser | null>(null);
  const [updatingTutorId, setUpdatingTutorId] = useState<string | null>(null);
  const [updatingStudentId, setUpdatingStudentId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [confirmRoleModal, setConfirmRoleModal] = useState<{ user: JoinedUser; targetRole: "student" | "tutor" | "admin" } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      let profilesData: any[] = [];
      const profilesRes = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, phone, address, created_at, is_suspended")
        .order("created_at", { ascending: false });

      if (profilesRes.error) {
        const fallback = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, phone, address, created_at")
          .order("created_at", { ascending: false });
        profilesData = fallback.data ?? [];
      } else {
        profilesData = profilesRes.data ?? [];
      }

      const [rolesRes, tutorsRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase
          .from("tutor_profiles")
          .select(
            "id, user_id, is_active, hourly_rate, avg_rating, total_reviews, subjects, levels, qualifications, experience_years, bio",
          ),
      ]);

      const roles = new Map((rolesRes.data ?? []).map((r) => [r.user_id, r.role as JoinedUser["role"]]));
      const tutors = new Map((tutorsRes.data ?? []).map((t) => [t.user_id, t as unknown as TutorDetail]));

      return profilesData.map((p) => {
        const userRole = roles.get(p.id) ?? "unassigned";
        return {
          ...p,
          role: userRole,
          is_suspended: Boolean(p.is_suspended),
          tutorProfile: tutors.get(p.id),
        } as JoinedUser;
      });
    },
  });

  async function toggleStudentSuspension(user: JoinedUser) {
    setUpdatingStudentId(user.id);
    const newStatus = !user.is_suspended;

    const { error } = await supabase
      .from("profiles")
      .update({ is_suspended: newStatus })
      .eq("id", user.id);

    setUpdatingStudentId(null);

    if (error) {
      if (error.message?.includes("is_suspended") || error.code === "42703") {
        toast.error("Please run the suspension SQL migration in Supabase to enable student suspension.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success(
      newStatus
        ? `${user.full_name}'s student account has been suspended.`
        : `${user.full_name}'s student account has been reactivated.`,
    );

    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });

    if (selectedUser?.id === user.id) {
      setSelectedUser((prev) => (prev ? { ...prev, is_suspended: newStatus } : null));
    }
  }

  async function handleUpdateRole(user: JoinedUser, targetRole: "student" | "tutor" | "admin") {
    if (user.id === currentAdmin?.id && targetRole !== "admin") {
      toast.error("You cannot demote your own administrator account.");
      return;
    }

    setUpdatingRoleId(user.id);

    const { error } = await supabase
      .from("user_roles")
      .upsert({ user_id: user.id, role: targetRole }, { onConflict: "user_id" });

    setUpdatingRoleId(null);
    setConfirmRoleModal(null);

    if (error) {
      toast.error(`Failed to update role: ${error.message}`);
      return;
    }

    toast.success(`${user.full_name}'s role updated to ${ROLE_LABELS[targetRole]}.`);
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });

    if (selectedUser?.id === user.id) {
      setSelectedUser((prev) => (prev ? { ...prev, role: targetRole } : null));
    }
  }

  const allUsers = data ?? [];

  // Filter by query and role tab
  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
      const matchesRole = roleTab === "all" || u.role === roleTab;
      const query = q.toLowerCase().trim();
      const matchesQuery =
        !query ||
        u.full_name?.toLowerCase().includes(query) ||
        u.phone?.toLowerCase().includes(query) ||
        u.address?.toLowerCase().includes(query) ||
        u.id.toLowerCase().includes(query);

      return matchesRole && matchesQuery;
    });
  }, [allUsers, roleTab, q]);

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      all: allUsers.length,
      student: allUsers.filter((u) => u.role === "student").length,
      tutor: allUsers.filter((u) => u.role === "tutor").length,
      admin: allUsers.filter((u) => u.role === "admin").length,
    };
  }, [allUsers]);

  async function toggleTutorStatus(tutorProfile: TutorDetail) {
    setUpdatingTutorId(tutorProfile.id);
    const newStatus = !tutorProfile.is_active;

    const { error } = await supabase
      .from("tutor_profiles")
      .update({ is_active: newStatus })
      .eq("id", tutorProfile.id);

    setUpdatingTutorId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      newStatus
        ? "Tutor profile activated (visible in search)."
        : "Tutor profile suspended (hidden from search).",
    );

    // Refresh query
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });

    // Update modal if open
    if (selectedUser?.tutorProfile?.id === tutorProfile.id) {
      setSelectedUser((prev) =>
        prev
          ? {
            ...prev,
            tutorProfile: { ...tutorProfile, is_active: newStatus },
          }
          : null,
      );
    }
  }

  function handleCopyId(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    toast.success("User ID copied to clipboard.");
    setTimeout(() => setCopiedId(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="User Management" subtitle="Inspect, filter, and moderate platform accounts." />
      </div>

      {/* Tabs and Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={roleTab} onValueChange={setRoleTab} className="w-full sm:w-auto">
          <TabsList className="w-full sm:w-auto flex justify-start overflow-x-auto no-scrollbar p-1 gap-1 h-auto">
            {ROLE_TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="shrink-0 capitalize gap-1.5">
                {t === "all" ? "All Users" : `${t}s`}
                <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold">
                  {counts[t]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, area..."
            className="pl-9"
            aria-label="Search users"
          />
        </div>
      </div>

      {isLoading ? (
        <RowsSkeleton rows={4} />
      ) : filteredUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-3 text-base font-semibold text-foreground">No users found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            No registered accounts match the selected role filter or search criteria.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile User Cards (< sm) */}
          <div className="space-y-3 sm:hidden">
            {filteredUsers.map((u) => {
              const isTutor = u.role === "tutor" && u.tutorProfile;
              const isTutorSuspended = isTutor && !u.tutorProfile?.is_active;
              const isStudent = u.role === "student";
              const isStudentSuspended = isStudent && Boolean(u.is_suspended);

              return (
                <div
                  key={u.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
                >
                  {/* Top: Avatar, Name, ID, Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar name={u.full_name} path={u.avatar_url} className="h-10 w-10 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{u.full_name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{u.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        variant="secondary"
                        className={`capitalize text-[10px] px-2 py-0.5 ${
                          u.role === "admin"
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                            : u.role === "tutor"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                        }`}
                      >
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                      {isTutor ? (
                        isTutorSuspended ? (
                          <Badge variant="outline" className="border-rose-400/40 bg-rose-500/10 text-rose-600 gap-1 text-[10px] px-1.5 py-0">
                            <XCircle className="h-2.5 w-2.5" /> Suspended
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-600 gap-1 text-[10px] px-1.5 py-0">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Active
                          </Badge>
                        )
                      ) : isStudent ? (
                        isStudentSuspended ? (
                          <Badge variant="outline" className="border-rose-400/40 bg-rose-500/10 text-rose-600 gap-1 text-[10px] px-1.5 py-0">
                            <XCircle className="h-2.5 w-2.5" /> Suspended
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-600 gap-1 text-[10px] px-1.5 py-0">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Active
                          </Badge>
                        )
                      ) : null}
                    </div>
                  </div>

                  {/* Info details */}
                  <div className="rounded-lg bg-muted/30 p-2.5 space-y-1.5 text-xs border border-border/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground" /> Phone:
                      </span>
                      <span className="font-medium text-foreground">{u.phone ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground" /> Location:
                      </span>
                      <span className="font-medium text-foreground truncate max-w-[180px] text-right">
                        {u.address ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-muted-foreground" /> Joined:
                      </span>
                      <span>{formatDate(u.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs gap-1.5 font-medium"
                      onClick={() => setSelectedUser(u)}
                    >
                      <Eye className="h-3.5 w-3.5" /> Details
                    </Button>

                    {isTutor && (
                      <Button
                        variant={isTutorSuspended ? "default" : "outline"}
                        size="sm"
                        className="flex-1 h-8 text-xs font-medium"
                        disabled={updatingTutorId === u.tutorProfile?.id}
                        onClick={() => u.tutorProfile && void toggleTutorStatus(u.tutorProfile)}
                      >
                        {isTutorSuspended ? "Reactivate" : "Suspend"}
                      </Button>
                    )}

                    {isStudent && (
                      <Button
                        variant={isStudentSuspended ? "default" : "outline"}
                        size="sm"
                        className="flex-1 h-8 text-xs font-medium"
                        disabled={updatingStudentId === u.id}
                        onClick={() => void toggleStudentSuspension(u)}
                      >
                        {isStudentSuspended ? "Reactivate" : "Suspend"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>= sm) */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Area / Location</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => {
                  const isTutor = u.role === "tutor" && u.tutorProfile;
                  const isTutorSuspended = isTutor && !u.tutorProfile?.is_active;
                  const isStudent = u.role === "student";
                  const isStudentSuspended = isStudent && Boolean(u.is_suspended);

                  return (
                    <TableRow key={u.id} className="hover:bg-accent/40">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <UserAvatar name={u.full_name} path={u.avatar_url} className="h-9 w-9" />
                          <div>
                            <p className="font-medium text-foreground">{u.full_name}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{u.id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`capitalize ${
                            u.role === "admin"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                              : u.role === "tutor"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                          }`}
                        >
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {isTutor ? (
                          isTutorSuspended ? (
                            <Badge variant="outline" className="border-rose-400/40 bg-rose-500/10 text-rose-600 gap-1 text-[11px]">
                              <XCircle className="h-3 w-3" /> Suspended
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-600 gap-1 text-[11px]">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </Badge>
                          )
                        ) : isStudent ? (
                          isStudentSuspended ? (
                            <Badge variant="outline" className="border-rose-400/40 bg-rose-500/10 text-rose-600 gap-1 text-[11px]">
                              <XCircle className="h-3 w-3" /> Suspended
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-600 gap-1 text-[11px]">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </Badge>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">Standard</span>
                        )}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">{u.phone ?? "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {u.address ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(u.created_at)}</TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => setSelectedUser(u)}
                          >
                            <Eye className="h-3.5 w-3.5" /> Details
                          </Button>

                          {isTutor && (
                            <Button
                              variant={isTutorSuspended ? "default" : "outline"}
                              size="sm"
                              className="h-8 text-xs"
                              disabled={updatingTutorId === u.tutorProfile?.id}
                              onClick={() => u.tutorProfile && void toggleTutorStatus(u.tutorProfile)}
                            >
                              {isTutorSuspended ? "Reactivate" : "Suspend"}
                            </Button>
                          )}

                          {isStudent && (
                            <Button
                              variant={isStudentSuspended ? "default" : "outline"}
                              size="sm"
                              className="h-8 text-xs"
                              disabled={updatingStudentId === u.id}
                              onClick={() => void toggleStudentSuspension(u)}
                            >
                              {isStudentSuspended ? "Reactivate" : "Suspend"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* User Details Modal */}
      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        {selectedUser && (
          <DialogContent className="max-w-md sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>User Overview</span>
                <Badge variant="secondary" className="capitalize text-xs">
                  {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                </Badge>
              </DialogTitle>
              <DialogDescription>Account details, listing credentials, and moderation controls.</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 pt-2">
              {/* Header profile info */}
              <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                <UserAvatar
                  name={selectedUser.full_name}
                  path={selectedUser.avatar_url}
                  className="h-14 w-14 text-base"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-semibold text-foreground">{selectedUser.full_name}</h4>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{selectedUser.id}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedUser.id)}
                      className="text-primary hover:underline"
                      title="Copy User ID"
                    >
                      {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Contact Details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> Phone Number
                  </p>
                  <p className="mt-1 font-semibold text-foreground">{selectedUser.phone || "Not provided"}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" /> Member Since
                  </p>
                  <p className="mt-1 font-semibold text-foreground">{formatDate(selectedUser.created_at)}</p>
                </div>
                <div className="col-span-2 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> Address / Location
                  </p>
                  <p className="mt-1 text-foreground">{selectedUser.address || "Not provided"}</p>
                </div>
              </div>

              {/* Tutor Specific Details (if tutor) */}
              {selectedUser.tutorProfile && (
                <div className="space-y-3 rounded-xl border border-border bg-accent/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <GraduationCap className="h-4 w-4 text-primary" /> Tutor Listing Credentials
                    </span>
                    <Badge
                      variant={selectedUser.tutorProfile.is_active ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {selectedUser.tutorProfile.is_active ? "Searchable (Active)" : "Suspended (Hidden)"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Hourly Rate:</span>{" "}
                      <span className="font-semibold text-foreground">
                        {formatTaka(selectedUser.tutorProfile.hourly_rate)}/hr
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Experience:</span>{" "}
                      <span className="font-semibold text-foreground">
                        {selectedUser.tutorProfile.experience_years} years
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Rating:</span>
                        <RatingStars
                          value={selectedUser.tutorProfile.avg_rating}
                          showValue
                          count={selectedUser.tutorProfile.total_reviews}
                        />
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1 text-primary p-0 hover:underline" asChild>
                        <Link to="/admin/reviews">
                          Inspect Reviews →
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {selectedUser.tutorProfile.subjects?.length > 0 && (
                    <div className="text-xs">
                      <p className="text-muted-foreground">Subjects:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selectedUser.tutorProfile.subjects.map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px]">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedUser.tutorProfile.bio && (
                    <div className="text-xs">
                      <p className="text-muted-foreground">Bio:</p>
                      <p className="mt-0.5 line-clamp-3 text-foreground">{selectedUser.tutorProfile.bio}</p>
                    </div>
                  )}

                  {/* Suspension toggle button */}
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      {selectedUser.tutorProfile.is_active
                        ? "Hide this tutor from search results if reported."
                        : "Allow this tutor to appear in search results again."}
                    </span>
                    <Button
                      size="sm"
                      variant={selectedUser.tutorProfile.is_active ? "destructive" : "default"}
                      disabled={updatingTutorId === selectedUser.tutorProfile.id}
                      onClick={() =>
                        selectedUser.tutorProfile && void toggleTutorStatus(selectedUser.tutorProfile)
                      }
                    >
                      {selectedUser.tutorProfile.is_active ? "Suspend Listing" : "Reactivate Listing"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Student Account Standing & Moderation (if student) */}
              {selectedUser.role === "student" && (
                <div className="space-y-3 rounded-xl border border-border bg-accent/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <ShieldAlert className="h-4 w-4 text-primary" /> Student Account Standing
                    </span>
                    <Badge
                      variant={selectedUser.is_suspended ? "destructive" : "default"}
                      className="text-[10px]"
                    >
                      {selectedUser.is_suspended ? "Suspended" : "Active (Good Standing)"}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {selectedUser.is_suspended
                      ? "This student account is suspended. The student is blocked from accessing the student dashboard, creating tuition requests, and placing offers."
                      : "This student account is active with standard platform privileges to post tuition requests and accept tutor offers."}
                  </p>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      {selectedUser.is_suspended
                        ? "Restore student access to dashboard and services."
                        : "Suspend account if spamming or violating safety rules."}
                    </span>
                    <Button
                      size="sm"
                      variant={selectedUser.is_suspended ? "default" : "destructive"}
                      disabled={updatingStudentId === selectedUser.id}
                      onClick={() => void toggleStudentSuspension(selectedUser)}
                    >
                      {selectedUser.is_suspended ? "Reactivate Student" : "Suspend Account"}
                    </Button>
                  </div>
                </div>
              )}
              {/* Role Assignment & Privilege Elevation */}
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Shield className="h-4 w-4 text-primary" /> Role Assignment & Permissions
                  </span>
                  <Badge variant="outline" className="capitalize text-xs font-semibold">
                    {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  Change this account's platform role or grant administrator privileges.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {(["student", "tutor", "admin"] as const).map((r) => {
                    const isCurrent = selectedUser.role === r;
                    const isSelfDemote = selectedUser.id === currentAdmin?.id && r !== "admin";

                    return (
                      <Button
                        key={r}
                        type="button"
                        size="sm"
                        variant={isCurrent ? "secondary" : "outline"}
                        disabled={isCurrent || isSelfDemote || updatingRoleId === selectedUser.id}
                        className="h-8 text-xs capitalize"
                        onClick={() =>
                          setConfirmRoleModal({ user: selectedUser, targetRole: r })
                        }
                      >
                        {isCurrent ? `Current: ${ROLE_LABELS[r]}` : `Make ${ROLE_LABELS[r]}`}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <ConfirmModal
        open={Boolean(confirmRoleModal)}
        onOpenChange={(open) => !open && setConfirmRoleModal(null)}
        title={`Change role to ${confirmRoleModal ? ROLE_LABELS[confirmRoleModal.targetRole] : ""}?`}
        description={`Are you sure you want to change ${confirmRoleModal?.user.full_name}'s role from ${confirmRoleModal ? ROLE_LABELS[confirmRoleModal.user.role] : ""
          } to ${confirmRoleModal ? ROLE_LABELS[confirmRoleModal.targetRole] : ""}? ${confirmRoleModal?.targetRole === "admin"
            ? "WARNING: This will grant full platform administrative privileges to this user."
            : ""
          }`}
        confirmLabel="Confirm Role Change"
        destructive={confirmRoleModal?.targetRole !== "admin"}
        onConfirm={() => {
          if (confirmRoleModal) {
            void handleUpdateRole(confirmRoleModal.user, confirmRoleModal.targetRole);
          }
        }}
      />
    </div>
  );
}

