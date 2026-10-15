-- Add is_suspended to profiles table if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- Allow administrators to update profiles (e.g. is_suspended)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated 
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin')) 
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
