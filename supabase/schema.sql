-- UFC Manager Schema
-- Run this in your Supabase SQL editor

-- ─────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────

CREATE TYPE division AS ENUM (
  'Flyweight',
  'Bantamweight',
  'Featherweight',
  'Lightweight',
  'Welterweight',
  'Middleweight',
  'Light Heavyweight',
  'Heavyweight'
);

CREATE TYPE fighter_status AS ENUM (
  'active',
  'injured',
  'suspended',
  'released',
  'retired'
);

CREATE TYPE fighter_style AS ENUM (
  'Striker',
  'Wrestler',
  'Grappler',
  'All-around'
);

CREATE TYPE event_type AS ENUM ('PPV', 'Fight Night');

CREATE TYPE fight_result AS ENUM (
  'KO/TKO',
  'Submission',
  'Unanimous Decision',
  'Split Decision',
  'Majority Decision',
  'Draw',
  'No Contest'
);

CREATE TYPE card_position AS ENUM (
  'main_event',
  'co_main',
  'main_card',
  'prelims',
  'early_prelims'
);

CREATE TYPE title_type AS ENUM ('none', 'title', 'interim_title', 'contender');

-- ─────────────────────────────────────────
-- SIMULATION CONFIG
-- ─────────────────────────────────────────

CREATE TABLE simulation_config (
  id          SERIAL PRIMARY KEY,
  start_date  DATE NOT NULL,
  current_date DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- FIGHTERS
-- ─────────────────────────────────────────

CREATE TABLE fighters (
  id                  SERIAL PRIMARY KEY,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  nickname            TEXT,
  nationality         TEXT,
  age                 INT,
  primary_division    division NOT NULL,
  secondary_division  division,
  style               fighter_style DEFAULT 'All-around',
  status              fighter_status DEFAULT 'active',

  -- Record
  wins                INT DEFAULT 0,
  losses              INT DEFAULT 0,
  draws               INT DEFAULT 0,
  wins_ko             INT DEFAULT 0,
  wins_sub            INT DEFAULT 0,
  wins_dec            INT DEFAULT 0,
  losses_ko           INT DEFAULT 0,
  losses_sub          INT DEFAULT 0,
  losses_dec          INT DEFAULT 0,

  -- Scores (0-100)
  hype_score          NUMERIC(5,2) DEFAULT 50,
  dominance_score     NUMERIC(5,2) DEFAULT 50,

  -- UFC tenure
  ufc_debut_date      DATE,
  last_fight_date     DATE,
  available_date      DATE,   -- null = available now
  injury_end_date     DATE,
  injury_description  TEXT,

  -- Contract
  contract_fights_remaining INT DEFAULT 4,

  -- Championship
  is_champion         BOOLEAN DEFAULT FALSE,
  is_interim_champion BOOLEAN DEFAULT FALSE,
  champion_division   division,

  -- Loyalty score for release system
  loyalty_points      INT DEFAULT 0,

  -- Warnings before release
  release_warnings    INT DEFAULT 0,

  -- Current win/loss streak (positive = win streak, negative = loss streak)
  current_streak      INT DEFAULT 0,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- EVENTS
-- ─────────────────────────────────────────

CREATE TABLE events (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  event_date  DATE NOT NULL,
  event_type  event_type NOT NULL DEFAULT 'Fight Night',
  location    TEXT,
  status      TEXT DEFAULT 'scheduled', -- scheduled | completed | cancelled
  ppv_number  INT,   -- for PPV events
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- FIGHTS
-- ─────────────────────────────────────────

CREATE TABLE fights (
  id                  SERIAL PRIMARY KEY,
  event_id            INT REFERENCES events(id) ON DELETE CASCADE,
  fighter1_id         INT REFERENCES fighters(id),
  fighter2_id         INT REFERENCES fighters(id),
  division            division NOT NULL,
  card_position       card_position NOT NULL DEFAULT 'main_card',
  title_type          title_type DEFAULT 'none',
  scheduled_rounds    INT DEFAULT 3,   -- 3 or 5

  -- Result (null until fight is completed)
  winner_id           INT REFERENCES fighters(id),
  result_method       fight_result,
  result_round        INT,
  result_time         TEXT,   -- e.g. "2:34"

  -- Fight quality (entered after fight)
  hype_rating         NUMERIC(3,1),       -- 1-10
  dominance_rating    NUMERIC(3,1),       -- 1-10 (10 = very one-sided, 1 = war)

  -- Bonuses
  bonus_fotn          BOOLEAN DEFAULT FALSE,
  bonus_potn_winner   BOOLEAN DEFAULT FALSE,
  bonus_sub_of_night  BOOLEAN DEFAULT FALSE,
  bonus_ko_of_night   BOOLEAN DEFAULT FALSE,

  -- Fight notes
  notes               TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- RANKINGS
-- ─────────────────────────────────────────

CREATE TABLE rankings (
  id          SERIAL PRIMARY KEY,
  fighter_id  INT REFERENCES fighters(id),
  division    division NOT NULL,
  rank        INT NOT NULL,   -- 1-15, 0 = champion
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fighter_id, division, snapshot_date)
);

-- Current rankings view (latest snapshot per fighter per division)
CREATE VIEW current_rankings AS
SELECT DISTINCT ON (fighter_id, division)
  r.*,
  f.first_name,
  f.last_name,
  f.nickname,
  f.hype_score,
  f.dominance_score,
  f.wins,
  f.losses,
  f.draws,
  f.status,
  f.is_champion,
  f.is_interim_champion
FROM rankings r
JOIN fighters f ON f.id = r.fighter_id
ORDER BY fighter_id, division, snapshot_date DESC;

-- ─────────────────────────────────────────
-- P4P RANKINGS
-- ─────────────────────────────────────────

CREATE TABLE p4p_rankings (
  id            SERIAL PRIMARY KEY,
  fighter_id    INT REFERENCES fighters(id),
  rank          INT NOT NULL,   -- 1-15
  p4p_score     NUMERIC(8,3),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fighter_id, snapshot_date)
);

CREATE VIEW current_p4p AS
SELECT DISTINCT ON (fighter_id)
  p.*,
  f.first_name,
  f.last_name,
  f.nickname,
  f.primary_division,
  f.hype_score,
  f.wins,
  f.losses,
  f.is_champion
FROM p4p_rankings p
JOIN fighters f ON f.id = p.fighter_id
ORDER BY fighter_id, snapshot_date DESC;

-- ─────────────────────────────────────────
-- FEUDS / NARRATIVES
-- ─────────────────────────────────────────

CREATE TABLE feuds (
  id            SERIAL PRIMARY KEY,
  fighter1_id   INT REFERENCES fighters(id),
  fighter2_id   INT REFERENCES fighters(id),
  intensity     INT DEFAULT 50,   -- 0-100
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- MATCHMAKING SUGGESTIONS
-- ─────────────────────────────────────────

CREATE TABLE matchmaking_suggestions (
  id              SERIAL PRIMARY KEY,
  fighter1_id     INT REFERENCES fighters(id),
  fighter2_id     INT REFERENCES fighters(id),
  division        division NOT NULL,
  fight_score     NUMERIC(6,2),
  score_breakdown JSONB,   -- {ranking: x, hype: x, narrative: x, ...}
  suggested_for_event_id INT REFERENCES events(id),
  status          TEXT DEFAULT 'pending',  -- pending | accepted | rejected
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────

CREATE INDEX idx_fighters_division ON fighters(primary_division);
CREATE INDEX idx_fighters_status ON fighters(status);
CREATE INDEX idx_fights_event ON fights(event_id);
CREATE INDEX idx_fights_fighter1 ON fights(fighter1_id);
CREATE INDEX idx_fights_fighter2 ON fights(fighter2_id);
CREATE INDEX idx_rankings_division ON rankings(division);
CREATE INDEX idx_rankings_snapshot ON rankings(snapshot_date);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY (disable for now, single user app)
-- ─────────────────────────────────────────

ALTER TABLE fighters ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fights ENABLE ROW LEVEL SECURITY;
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE p4p_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feuds ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_config ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon (single user, no auth needed)
CREATE POLICY "allow_all" ON fighters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON fights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON rankings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON p4p_rankings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON feuds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON matchmaking_suggestions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON simulation_config FOR ALL USING (true) WITH CHECK (true);
