-- ==============================================================================
-- Comprehensive Admin Fixes & Permissions Migration
-- 1. User Roles: Allow admins to manage, promote, and update roles
-- 2. Schedule Slots: Allow admins to update/free schedule slots & auto-free trigger
-- 3. Reviews: Allow admins to delete/moderate abusive reviews
-- 4. Profiles: Student suspension column & admin update policy
-- ==============================================================================

-- 1. Student Suspension column & policy (if not yet added)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated 
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin')) 
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- 2. User Roles: grant full management to admins
GRANT UPDATE, INSERT, DELETE ON public.user_roles TO authenticated;

DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Schedule Slots: allow admin to manage and clear slots
DROP POLICY IF EXISTS "slots_admin_manage" ON public.schedule_slots;
CREATE POLICY "slots_admin_manage" ON public.schedule_slots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Automatic slot release trigger on offer cancellation / rejection
CREATE OR REPLACE FUNCTION public.handle_offer_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'rejected') AND OLD.status != NEW.status THEN
    UPDATE public.schedule_slots
    SET is_booked = false, booked_offer_id = NULL
    WHERE booked_offer_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_offer_status_change_slots ON public.offers;
CREATE TRIGGER on_offer_status_change_slots
  AFTER UPDATE OF status ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_offer_status_change();

-- 5. Reviews: grant delete to authenticated and allow admins to delete reviews
GRANT DELETE ON public.reviews TO authenticated;

DROP POLICY IF EXISTS "reviews_admin_delete" ON public.reviews;
CREATE POLICY "reviews_admin_delete" ON public.reviews FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
