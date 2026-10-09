-- Connecteam (team_connect) — company social feed.
-- Groups (Announcements, General, department teams), per-group member roles,
-- posts with image/file attachments, reactions, threaded comments and comment
-- likes. Writes go through server actions (service role) that enforce group
-- roles; RLS grants read access to group members so the client can subscribe
-- to realtime changes later (chat phase).
--
-- Group roles:
--   admin       → manage group settings and members, post, moderate
--   moderator   → post, pin, remove anyone's posts / comments
--   contributor → create posts, comment, react
--   viewer      → read, comment, react (cannot start posts)

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connect_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'users',
  color TEXT NOT NULL DEFAULT '#818a40',
  sort_order INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS connect_groups_venue_name_idx
  ON public.connect_groups (venue_id, lower(name));

DROP TRIGGER IF EXISTS connect_groups_set_updated_at ON public.connect_groups;
CREATE TRIGGER connect_groups_set_updated_at
  BEFORE UPDATE ON public.connect_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.connect_group_members (
  group_id UUID NOT NULL REFERENCES public.connect_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'contributor'
    CHECK (role IN ('admin', 'moderator', 'contributor', 'viewer')),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS connect_group_members_user_idx
  ON public.connect_group_members (user_id, venue_id);

DROP TRIGGER IF EXISTS connect_group_members_set_updated_at ON public.connect_group_members;
CREATE TRIGGER connect_group_members_set_updated_at
  BEFORE UPDATE ON public.connect_group_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Posts, attachments, reactions, comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connect_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.connect_groups(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'post' CHECK (kind IN ('post', 'celebration')),
  -- Celebration posts congratulate a staff member (birthday / work anniversary).
  celebration_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  celebration_kind TEXT CHECK (celebration_kind IN ('birthday', 'anniversary', 'shoutout')),
  celebration_years INT,
  pinned_at TIMESTAMPTZ,
  pinned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connect_posts_group_idx
  ON public.connect_posts (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS connect_posts_venue_idx
  ON public.connect_posts (venue_id, created_at DESC);

DROP TRIGGER IF EXISTS connect_posts_set_updated_at ON public.connect_posts;
CREATE TRIGGER connect_posts_set_updated_at
  BEFORE UPDATE ON public.connect_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.connect_post_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.connect_posts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  file_size BIGINT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connect_post_attachments_post_idx
  ON public.connect_post_attachments (post_id, sort_order);

CREATE TABLE IF NOT EXISTS public.connect_post_reactions (
  post_id UUID NOT NULL REFERENCES public.connect_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'like'
    CHECK (reaction IN ('like', 'love', 'celebrate', 'laugh', 'wow')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.connect_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.connect_posts(id) ON DELETE CASCADE,
  -- Replies thread one level under a top-level comment.
  parent_id UUID REFERENCES public.connect_comments(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connect_comments_post_idx
  ON public.connect_comments (post_id, created_at);

DROP TRIGGER IF EXISTS connect_comments_set_updated_at ON public.connect_comments;
CREATE TRIGGER connect_comments_set_updated_at
  BEFORE UPDATE ON public.connect_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.connect_comment_likes (
  comment_id UUID NOT NULL REFERENCES public.connect_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- RLS — read access for group members and Connecteam settings admins.
-- All writes go through server actions using the service role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.connect_can_view_group(
  check_group_id uuid,
  check_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.connect_group_members m
    WHERE m.group_id = check_group_id AND m.user_id = check_user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.connect_groups g
    WHERE g.id = check_group_id
      AND public.has_feature_permission(check_user_id, 'team_connect', 'settings', 'view', g.venue_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.connect_can_view_group(uuid, uuid) TO authenticated;

ALTER TABLE public.connect_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_post_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connect_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connect_groups_select" ON public.connect_groups;
CREATE POLICY "connect_groups_select" ON public.connect_groups
  FOR SELECT TO authenticated
  USING (public.connect_can_view_group(id));

DROP POLICY IF EXISTS "connect_group_members_select" ON public.connect_group_members;
CREATE POLICY "connect_group_members_select" ON public.connect_group_members
  FOR SELECT TO authenticated
  USING (public.connect_can_view_group(group_id));

DROP POLICY IF EXISTS "connect_posts_select" ON public.connect_posts;
CREATE POLICY "connect_posts_select" ON public.connect_posts
  FOR SELECT TO authenticated
  USING (public.connect_can_view_group(group_id));

DROP POLICY IF EXISTS "connect_post_attachments_select" ON public.connect_post_attachments;
CREATE POLICY "connect_post_attachments_select" ON public.connect_post_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.connect_posts p
    WHERE p.id = post_id AND public.connect_can_view_group(p.group_id)
  ));

DROP POLICY IF EXISTS "connect_post_reactions_select" ON public.connect_post_reactions;
CREATE POLICY "connect_post_reactions_select" ON public.connect_post_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.connect_posts p
    WHERE p.id = post_id AND public.connect_can_view_group(p.group_id)
  ));

DROP POLICY IF EXISTS "connect_comments_select" ON public.connect_comments;
CREATE POLICY "connect_comments_select" ON public.connect_comments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.connect_posts p
    WHERE p.id = post_id AND public.connect_can_view_group(p.group_id)
  ));

DROP POLICY IF EXISTS "connect_comment_likes_select" ON public.connect_comment_likes;
CREATE POLICY "connect_comment_likes_select" ON public.connect_comment_likes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.connect_comments c
    JOIN public.connect_posts p ON p.id = c.post_id
    WHERE c.id = comment_id AND public.connect_can_view_group(p.group_id)
  ));

GRANT SELECT ON public.connect_groups TO authenticated;
GRANT SELECT ON public.connect_group_members TO authenticated;
GRANT SELECT ON public.connect_posts TO authenticated;
GRANT SELECT ON public.connect_post_attachments TO authenticated;
GRANT SELECT ON public.connect_post_reactions TO authenticated;
GRANT SELECT ON public.connect_comments TO authenticated;
GRANT SELECT ON public.connect_comment_likes TO authenticated;
GRANT ALL ON public.connect_groups TO service_role;
GRANT ALL ON public.connect_group_members TO service_role;
GRANT ALL ON public.connect_posts TO service_role;
GRANT ALL ON public.connect_post_attachments TO service_role;
GRANT ALL ON public.connect_post_reactions TO service_role;
GRANT ALL ON public.connect_comments TO service_role;
GRANT ALL ON public.connect_comment_likes TO service_role;

-- ---------------------------------------------------------------------------
-- Default groups for every venue (no members — admins assign them).
-- ---------------------------------------------------------------------------
INSERT INTO public.connect_groups (venue_id, name, description, icon, color, sort_order)
SELECT v.id, g.name, g.description, g.icon, g.color, g.sort_order
FROM public.venues v
CROSS JOIN (VALUES
  ('Announcements', 'Official news and updates from management.', 'megaphone', '#B4532A', 10),
  ('General', 'Everyday chat, photos and shout-outs for the whole team.', 'messages-square', '#818a40', 20),
  ('Restaurant Team', 'Floor team — service notes, sections and shift updates.', 'utensils', '#2F6F8F', 30),
  ('Kitchen Team', 'Kitchen brigade — prep, specials and deliveries.', 'chef-hat', '#8A5A2B', 40),
  ('Bar Team', 'Bar team — menus, stock and cocktail specs.', 'martini', '#7A3E7A', 50)
) AS g(name, description, icon, color, sort_order)
WHERE NOT v.is_global
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Storage — post images and files (unguessable UUID paths, public read like
-- other venue media buckets).
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('connect-media', 'connect-media', true, 26214400, NULL)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "connect_media_public_read" ON storage.objects;
CREATE POLICY "connect_media_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'connect-media');

NOTIFY pgrst, 'reload schema';
