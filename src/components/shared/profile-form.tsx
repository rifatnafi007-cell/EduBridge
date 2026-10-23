import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/shared/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface ProfileFormProps {
  hideAcademicFields?: boolean;
  className?: string;
}

export function ProfileForm({ hideAcademicFields = false, className }: ProfileFormProps = {}) {
  const { role, user, profile, refresh } = useAuth();
  const showAcademicFields = !hideAcademicFields && role !== "admin";
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [institution, setInstitution] = useState("");
  const [grade, setGrade] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setInstitution(profile.institution ?? "");
    setGrade(profile.grade ?? "");
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      // 1. Update user_metadata in Supabase Auth if academic fields apply
      if (showAcademicFields) {
        await supabase.auth.updateUser({
          data: {
            institution: institution.trim() || null,
            grade: grade.trim() || null,
          },
        });
      }

      // 2. Update profiles table
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
        })
        .eq("id", user.id);

      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      refresh();
      toast.success("Profile updated successfully.");
    } catch (err: unknown) {
      setSaving(false);
      const message = err instanceof Error ? err.message : "Failed to update profile.";
      toast.error(message);
    }
  }

  async function uploadAvatar(file: File) {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { error: updateError } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
    setUploading(false);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    refresh();
    toast.success("Photo updated.");
  }

  return (
    <form
      onSubmit={save}
      className={cn("w-full max-w-xl space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm", className)}
    >
      <div className="flex items-center gap-4">
        <UserAvatar name={profile?.full_name ?? "User"} path={profile?.avatar_url} className="h-16 w-16" previewable />
        <div>
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Change photo
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, up to 2MB. Tap photo to preview.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadAvatar(file);
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="full-name">Full name</Label>
        <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address / area</Label>
        <Textarea id="address" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. House 12, Road 5, Dhanmondi, Dhaka" />
        <p className="text-xs text-muted-foreground">
          {role === "admin"
            ? "Administrative contact address or office area."
            : "Required for geographic matching and distance calculation."}
        </p>
      </div>

      {showAcademicFields && (
        <>
          <div className="space-y-2">
            <Label htmlFor="institution">Current study institution or passed one</Label>
            <Input
              id="institution"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="e.g. University of Dhaka, Notre Dame College, Viqarunnisa Noon School, BUET"
            />
            <p className="text-xs text-muted-foreground">Required to verify academic background.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grade">Current grade / GPA / Academic result</Label>
            <Input
              id="grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g. Class 10 (GPA 5.00), HSC Candidate, BSc (CGPA 3.82)"
            />
            <p className="text-xs text-muted-foreground">Helps tutors evaluate your level and requirements.</p>
          </div>
        </>
      )}

      <Button type="submit" className="w-full sm:w-auto font-semibold" disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save changes
      </Button>
    </form>
  );
}
