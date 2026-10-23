import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Inbox,
  Search,
  Eye,
  Calendar,
  Clock,
  MapPin,
  MessageSquare,
  DollarSign,
  AlertTriangle,
  User,
  GraduationCap,
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
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RowsSkeleton } from "@/components/shared/loading-skeleton";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { supabase } from "@/integrations/supabase/client";
import { OFFER_SELECT, type OfferRow } from "@/lib/selects";
import { DAYS, formatDate, formatTaka, formatTime } from "@/lib/edubridge";

export const Route = createFileRoute("/_authenticated/admin/offers")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "All offers — EduBridge admin" },
      { name: "description", content: "Monitor, inspect, and moderate tuition offers exchanged on EduBridge." },
      { property: "og:title", content: "All offers — EduBridge admin" },
      { property: "og:description", content: "Platform-wide tuition offer inspection and moderation." },
    ],
  }),
  component: AdminOffers,
});

const TABS = ["all", "pending", "accepted", "rejected", "cancelled"] as const;

export function AdminOffers() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("all");
  const [q, setQ] = useState("");
  const [selectedOffer, setSelectedOffer] = useState<OfferRow | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select(OFFER_SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OfferRow[];
    },
  });

  const allOffers = data ?? [];

  // Filter by tab and search query
  const filteredOffers = useMemo(() => {
    return allOffers.filter((o) => {
      const matchesTab = tab === "all" || o.status === tab;
      const query = q.toLowerCase().trim();
      const studentName = o.profiles?.full_name?.toLowerCase() ?? "";
      const tutorName = o.tutor_profiles?.profiles?.full_name?.toLowerCase() ?? "";
      const location = o.proposed_location?.toLowerCase() ?? "";
      const message = o.message?.toLowerCase() ?? "";

      const matchesQuery =
        !query ||
        studentName.includes(query) ||
        tutorName.includes(query) ||
        location.includes(query) ||
        message.includes(query) ||
        o.id.toLowerCase().includes(query);

      return matchesTab && matchesQuery;
    });
  }, [allOffers, tab, q]);

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      all: allOffers.length,
      pending: allOffers.filter((o) => o.status === "pending").length,
      accepted: allOffers.filter((o) => o.status === "accepted").length,
      rejected: allOffers.filter((o) => o.status === "rejected").length,
      cancelled: allOffers.filter((o) => o.status === "cancelled").length,
    };
  }, [allOffers]);

  async function handleAdminCancel() {
    if (!selectedOffer) return;
    setCancelling(true);

    const { error } = await supabase
      .from("offers")
      .update({ status: "cancelled" })
      .eq("id", selectedOffer.id);

    if (error) {
      setCancelling(false);
      setCancelModalOpen(false);
      toast.error(error.message);
      return;
    }

    // Explicitly release any booked schedule slots for defense-in-depth
    await supabase
      .from("schedule_slots")
      .update({ is_booked: false, booked_offer_id: null })
      .eq("booked_offer_id", selectedOffer.id);

    // Notify student and tutor
    const notificationsToInsert = [
      {
        user_id: selectedOffer.student_id,
        title: "Tuition offer cancelled by admin",
        body: "An administrator has cancelled your tuition offer. Any reserved schedule slots have been released.",
      },
    ];

    if (selectedOffer.tutor_profiles?.user_id) {
      notificationsToInsert.push({
        user_id: selectedOffer.tutor_profiles.user_id,
        title: "Tuition offer cancelled by admin",
        body: "An administrator has cancelled this tuition offer. Your booked schedule slots are now available again.",
      });
    }

    await supabase.from("notifications").insert(notificationsToInsert);

    setCancelling(false);
    setCancelModalOpen(false);

    toast.success("Offer marked as cancelled by admin and schedule slots released.");
    void queryClient.invalidateQueries({ queryKey: ["admin-offers"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });

    // Update active modal view
    setSelectedOffer((prev) => (prev ? { ...prev, status: "cancelled" } : null));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="All Tuition Offers" subtitle="Monitor and inspect every agreement between students and tutors." />

      {/* Tabs and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
          <TabsList className="w-full sm:w-auto flex justify-start overflow-x-auto no-scrollbar p-1 gap-1 h-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="shrink-0 capitalize gap-1.5">
                {t}
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
            placeholder="Search student, tutor, location..."
            className="pl-9"
            aria-label="Search offers"
          />
        </div>
      </div>

      {isLoading ? (
        <RowsSkeleton rows={4} />
      ) : filteredOffers.length === 0 ? (
        <EmptyState icon={Inbox} title="No offers found" description="Nothing matches this filter or search." />
      ) : (
        <>
          {/* Mobile Card List (< sm) */}
          <div className="space-y-3 sm:hidden">
            {filteredOffers.map((o) => (
              <div
                key={o.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar
                      name={o.profiles?.full_name ?? "Student"}
                      path={o.profiles?.avatar_url}
                      className="h-9 w-9 shrink-0 text-xs"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {o.profiles?.full_name ?? "—"}
                      </p>
                      <span className="inline-flex items-center rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        Offer #{o.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={o.status} />
                </div>

                <div className="rounded-lg bg-muted/30 p-2.5 space-y-2 text-xs border border-border/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Tutor:</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <UserAvatar
                        name={o.tutor_profiles?.profiles?.full_name ?? "Tutor"}
                        path={o.tutor_profiles?.profiles?.avatar_url}
                        className="h-5 w-5 shrink-0 text-[10px]"
                      />
                      <span className="font-medium text-foreground truncate max-w-[160px]">
                        {o.tutor_profiles?.profiles?.full_name ?? "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Schedule:</span>
                    <span className="inline-flex items-center gap-1 text-foreground font-medium">
                      <Clock className="h-3 w-3 text-primary" />
                      {o.offer_slots.length} weekly slot{o.offer_slots.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-bold text-foreground text-sm">
                      {formatTaka(o.total_amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                    <span>Submitted:</span>
                    <span>{formatDate(o.created_at)}</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-1.5 font-medium"
                  onClick={() => setSelectedOffer(o)}
                >
                  <Eye className="h-3.5 w-3.5" /> Inspect Offer
                </Button>
              </div>
            ))}
          </div>

          {/* Desktop / Tablet Scrollable Table (>= sm) */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Tutor</TableHead>
                  <TableHead>Schedule Slots</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOffers.map((o) => (
                  <TableRow key={o.id} className="hover:bg-accent/40">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          name={o.profiles?.full_name ?? "Student"}
                          path={o.profiles?.avatar_url}
                          className="h-8 w-8 text-xs"
                        />
                        <div>
                          <p className="font-medium text-foreground">{o.profiles?.full_name ?? "—"}</p>
                          <span className="inline-flex items-center rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            Offer #{o.id.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={o.tutor_profiles?.profiles?.full_name ?? "Tutor"}
                          path={o.tutor_profiles?.profiles?.avatar_url}
                          className="h-8 w-8 text-xs"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {o.tutor_profiles?.profiles?.full_name ?? "—"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>{o.offer_slots.length} weekly slot{o.offer_slots.length === 1 ? "" : "s"}</span>
                      </div>
                    </TableCell>

                    <TableCell className="font-semibold text-foreground">{formatTaka(o.total_amount)}</TableCell>

                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">{formatDate(o.created_at)}</TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => setSelectedOffer(o)}
                      >
                        <Eye className="h-3.5 w-3.5" /> Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Offer Inspection Modal */}
      <Dialog open={Boolean(selectedOffer)} onOpenChange={(open) => !open && setSelectedOffer(null)}>
        {selectedOffer && (
          <DialogContent className="max-w-lg sm:max-w-xl">
            <DialogHeader>
              <div className="flex items-center justify-between pr-4">
                <DialogTitle className="flex items-center gap-2">
                  <span>Tuition Offer Inspection</span>
                  <StatusBadge status={selectedOffer.status} />
                </DialogTitle>
              </div>
              <DialogDescription>
                Full transaction parameters, schedule commitment, and admin controls.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Amount Banner */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-accent/30 p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Agreed Monthly Tuition Fee</p>
                  <p className="text-2xl font-bold tracking-tight text-foreground">
                    {formatTaka(selectedOffer.total_amount)}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Submitted: {formatDate(selectedOffer.created_at)}</p>
                  <p className="font-mono text-[10px]">ID: {selectedOffer.id}</p>
                </div>
              </div>

              {/* Student & Tutor Cards */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Student */}
                <div className="rounded-xl border border-border bg-card p-3.5">
                  <p className="flex items-center gap-1 font-semibold text-muted-foreground">
                    <User className="h-3.5 w-3.5" /> Student / Guardian
                  </p>
                  <div className="mt-2 flex items-center gap-2.5">
                    <UserAvatar
                      name={selectedOffer.profiles?.full_name ?? "Student"}
                      path={selectedOffer.profiles?.avatar_url}
                      className="h-8 w-8 text-xs"
                    />
                    <div>
                      <p className="font-medium text-foreground">{selectedOffer.profiles?.full_name ?? "—"}</p>
                      <p className="text-muted-foreground">{selectedOffer.profiles?.phone || "No phone"}</p>
                    </div>
                  </div>
                  {selectedOffer.profiles?.address && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <span className="font-medium">Area:</span> {selectedOffer.profiles.address}
                    </p>
                  )}
                </div>

                {/* Tutor */}
                <div className="rounded-xl border border-border bg-card p-3.5">
                  <p className="flex items-center gap-1 font-semibold text-muted-foreground">
                    <GraduationCap className="h-3.5 w-3.5" /> Home Tutor
                  </p>
                  <div className="mt-2 flex items-center gap-2.5">
                    <UserAvatar
                      name={selectedOffer.tutor_profiles?.profiles?.full_name ?? "Tutor"}
                      path={selectedOffer.tutor_profiles?.profiles?.avatar_url}
                      className="h-8 w-8 text-xs"
                    />
                    <div>
                      <p className="font-medium text-foreground">
                        {selectedOffer.tutor_profiles?.profiles?.full_name ?? "—"}
                      </p>
                      <p className="text-muted-foreground">
                        Rate: {formatTaka(selectedOffer.tutor_profiles?.hourly_rate ?? 0)}/hr
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scheduled Slots */}
              <div className="rounded-xl border border-border bg-card p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Calendar className="h-3.5 w-3.5 text-primary" /> Booked Weekly Time Slots (
                  {selectedOffer.offer_slots.length})
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  {selectedOffer.offer_slots.map((s, idx) => {
                    const slot = s.schedule_slots;
                    if (!slot) return null;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                      >
                        <span className="font-medium text-foreground">{DAYS[slot.day_of_week]}</span>
                        <span className="text-muted-foreground">
                          {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Location & Message */}
              <div className="space-y-2 text-xs">
                {selectedOffer.proposed_location && (
                  <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-foreground">Proposed Location: </span>
                      <span className="text-muted-foreground">{selectedOffer.proposed_location}</span>
                    </div>
                  </div>
                )}

                {selectedOffer.message && (
                  <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-foreground">Student Message: </span>
                      <span className="text-muted-foreground">{selectedOffer.message}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Actions Footer */}
              {selectedOffer.status !== "cancelled" && (
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Admin intervention for disputed or fraudulent offers.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5"
                    onClick={() => setCancelModalOpen(true)}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Cancel Offer (Override)
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Confirmation Modal for Admin Override */}
      <ConfirmModal
        open={cancelModalOpen}
        onOpenChange={setCancelModalOpen}
        title="Force Cancel this Offer?"
        description="Are you sure you want to cancel this offer as an administrator? This action will mark the status as cancelled and free up any locked schedule slots."
        confirmLabel={cancelling ? "Cancelling..." : "Yes, Cancel Offer"}
        destructive
        onConfirm={() => void handleAdminCancel()}
      />
    </div>
  );
}

