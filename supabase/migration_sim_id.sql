-- Migration: add sim_id to all game tables so simulations are isolated
-- Run this once in the Supabase SQL Editor

ALTER TABLE fighters              ADD COLUMN sim_id INT REFERENCES simulation_config(id);
ALTER TABLE events                ADD COLUMN sim_id INT REFERENCES simulation_config(id);
ALTER TABLE fights                ADD COLUMN sim_id INT REFERENCES simulation_config(id);
ALTER TABLE rankings              ADD COLUMN sim_id INT REFERENCES simulation_config(id);
ALTER TABLE p4p_rankings          ADD COLUMN sim_id INT REFERENCES simulation_config(id);
ALTER TABLE matchmaking_suggestions ADD COLUMN sim_id INT REFERENCES simulation_config(id);

-- Add name column if missing
ALTER TABLE simulation_config ADD COLUMN IF NOT EXISTS name TEXT;

-- Rebuild views to scope by sim_id
DROP VIEW IF EXISTS current_rankings;
CREATE VIEW current_rankings AS
SELECT DISTINCT ON (r.sim_id, r.fighter_id, r.division)
  r.*,
  f.first_name, f.last_name, f.nickname, f.hype_score, f.dominance_score,
  f.wins, f.losses, f.draws, f.status, f.is_champion, f.is_interim_champion
FROM rankings r
JOIN fighters f ON f.id = r.fighter_id
ORDER BY r.sim_id, r.fighter_id, r.division, r.snapshot_date DESC;

DROP VIEW IF EXISTS current_p4p;
CREATE VIEW current_p4p AS
SELECT DISTINCT ON (p.sim_id, p.fighter_id)
  p.*,
  f.first_name, f.last_name, f.nickname, f.primary_division,
  f.hype_score, f.wins, f.losses, f.is_champion
FROM p4p_rankings p
JOIN fighters f ON f.id = p.fighter_id
ORDER BY p.sim_id, p.fighter_id, p.snapshot_date DESC;
