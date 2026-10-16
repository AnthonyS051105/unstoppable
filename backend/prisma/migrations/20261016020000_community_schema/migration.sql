-- B15: region-based communities, membership, events, discussion, and flags.
CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'users',
  center_point geography(Point, 4326) NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 3000
    CHECK (radius_meters BETWEEN 200 AND 20000),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_communities_center
  ON communities USING GIST (center_point);

CREATE INDEX idx_communities_created_by
  ON communities (created_by);

CREATE TABLE community_members (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'moderator')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

CREATE INDEX idx_community_members_user
  ON community_members (user_id);

CREATE TABLE community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL
    CHECK (char_length(title) BETWEEN 3 AND 120),
  description TEXT
    CHECK (description IS NULL OR char_length(description) <= 1000),
  starts_at TIMESTAMPTZ NOT NULL,
  location_note TEXT,
  location geography(Point, 4326),
  created_by UUID NOT NULL REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_events_upcoming
  ON community_events (community_id, starts_at)
  WHERE cancelled_at IS NULL;

CREATE INDEX idx_community_events_created_by
  ON community_events (created_by);

CREATE TABLE community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT
    CHECK (title IS NULL OR char_length(title) <= 120),
  body TEXT NOT NULL
    CHECK (char_length(body) BETWEEN 3 AND 1000),
  status TEXT NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible', 'hidden')),
  hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  hidden_reason TEXT,
  flag_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_posts_feed
  ON community_posts (community_id, created_at DESC)
  WHERE status = 'visible';

CREATE INDEX idx_community_posts_author
  ON community_posts (author_id);

CREATE TABLE community_post_flags (
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL
    CHECK (char_length(reason) BETWEEN 3 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, reporter_id)
);

CREATE INDEX idx_community_post_flags_reporter
  ON community_post_flags (reporter_id);
