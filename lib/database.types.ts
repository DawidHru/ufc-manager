export type Division =
  | 'Flyweight'
  | 'Bantamweight'
  | 'Featherweight'
  | 'Lightweight'
  | 'Welterweight'
  | 'Middleweight'
  | 'Light Heavyweight'
  | 'Heavyweight'

export type FighterStatus = 'active' | 'injured' | 'suspended' | 'released' | 'retired'
export type FighterStyle = 'Striker' | 'Wrestler' | 'Grappler' | 'All-around'
export type EventType = 'PPV' | 'Fight Night'
export type FightResult =
  | 'KO/TKO'
  | 'Submission'
  | 'Unanimous Decision'
  | 'Split Decision'
  | 'Majority Decision'
  | 'Draw'
  | 'No Contest'
export type CardPosition = 'main_event' | 'co_main' | 'main_card' | 'prelims' | 'early_prelims'
export type TitleType = 'none' | 'title' | 'interim_title' | 'contender'

export interface Fighter {
  id: number
  first_name: string
  last_name: string
  nickname: string | null
  nationality: string | null
  age: number | null
  primary_division: Division
  secondary_division: Division | null
  style: FighterStyle
  status: FighterStatus
  wins: number
  losses: number
  draws: number
  wins_ko: number
  wins_sub: number
  wins_dec: number
  losses_ko: number
  losses_sub: number
  losses_dec: number
  hype_score: number
  dominance_score: number
  ufc_debut_date: string | null
  last_fight_date: string | null
  available_date: string | null
  injury_end_date: string | null
  injury_description: string | null
  contract_fights_remaining: number
  is_champion: boolean
  is_interim_champion: boolean
  champion_division: Division | null
  loyalty_points: number
  release_warnings: number
  current_streak: number
  created_at: string
  updated_at: string
}

export interface Event {
  id: number
  name: string
  event_date: string
  event_type: EventType
  location: string | null
  status: string
  ppv_number: number | null
  created_at: string
}

export interface Fight {
  id: number
  event_id: number
  fighter1_id: number
  fighter2_id: number
  division: Division
  card_position: CardPosition
  title_type: TitleType
  scheduled_rounds: number
  winner_id: number | null
  result_method: FightResult | null
  result_round: number | null
  result_time: string | null
  hype_rating: number | null
  dominance_rating: number | null
  bonus_fotn: boolean
  bonus_potn_winner: boolean
  bonus_sub_of_night: boolean
  bonus_ko_of_night: boolean
  notes: string | null
  created_at: string
}

export interface Ranking {
  id: number
  fighter_id: number
  division: Division
  rank: number
  snapshot_date: string
  created_at: string
  // joined from fighters view
  first_name?: string
  last_name?: string
  nickname?: string
  hype_score?: number
  dominance_score?: number
  wins?: number
  losses?: number
  draws?: number
  status?: FighterStatus
  is_champion?: boolean
  is_interim_champion?: boolean
}

export interface P4PRanking {
  id: number
  fighter_id: number
  rank: number
  p4p_score: number
  snapshot_date: string
  created_at: string
  // joined
  first_name?: string
  last_name?: string
  nickname?: string
  primary_division?: Division
  hype_score?: number
  wins?: number
  losses?: number
  is_champion?: boolean
}

export interface Feud {
  id: number
  fighter1_id: number
  fighter2_id: number
  intensity: number
  active: boolean
  created_at: string
}

export interface MatchmakingSuggestion {
  id: number
  fighter1_id: number
  fighter2_id: number
  division: Division
  fight_score: number
  score_breakdown: {
    ranking: number
    hype: number
    freshness: number
    narrative: number
    availability: number
    title_context: number
  }
  suggested_for_event_id: number | null
  status: string
  created_at: string
}

export interface SimulationConfig {
  id: number
  start_date: string
  sim_date: string
  created_at: string
}

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────

export const DIVISIONS: Division[] = [
  'Flyweight',
  'Bantamweight',
  'Featherweight',
  'Lightweight',
  'Welterweight',
  'Middleweight',
  'Light Heavyweight',
  'Heavyweight',
]

export const DIVISION_WEIGHTS: Record<Division, number> = {
  Flyweight: 125,
  Bantamweight: 135,
  Featherweight: 145,
  Lightweight: 155,
  Welterweight: 170,
  Middleweight: 185,
  'Light Heavyweight': 205,
  Heavyweight: 265,
}

// P4P multipliers (lower weight classes score higher relative to division size)
export const DIVISION_P4P_MULTIPLIER: Record<Division, number> = {
  Heavyweight: 0.85,
  'Light Heavyweight': 0.90,
  Middleweight: 0.95,
  Welterweight: 1.0,
  Lightweight: 1.05,
  Featherweight: 1.08,
  Bantamweight: 1.10,
  Flyweight: 1.12,
}

export const DATABASE: Database = {} as Database

export interface Database {
  public: {
    Tables: {
      fighters: { Row: Fighter; Insert: Partial<Fighter>; Update: Partial<Fighter> }
      events: { Row: Event; Insert: Partial<Event>; Update: Partial<Event> }
      fights: { Row: Fight; Insert: Partial<Fight>; Update: Partial<Fight> }
      rankings: { Row: Ranking; Insert: Partial<Ranking>; Update: Partial<Ranking> }
      p4p_rankings: { Row: P4PRanking; Insert: Partial<P4PRanking>; Update: Partial<P4PRanking> }
      feuds: { Row: Feud; Insert: Partial<Feud>; Update: Partial<Feud> }
      matchmaking_suggestions: { Row: MatchmakingSuggestion; Insert: Partial<MatchmakingSuggestion>; Update: Partial<MatchmakingSuggestion> }
      simulation_config: { Row: SimulationConfig; Insert: Partial<SimulationConfig>; Update: Partial<SimulationConfig> }
    }
    Views: {
      current_rankings: { Row: Ranking }
      current_p4p: { Row: P4PRanking }
    }
  }
}
