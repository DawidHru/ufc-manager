import type { Fighter, Division, MatchmakingSuggestion } from './database.types'

export interface FightScoreBreakdown {
  ranking: number
  hype: number
  freshness: number
  narrative: number
  availability: number
  title_context: number
  total: number
}

export interface FightCandidate {
  fighter1: Fighter
  fighter2: Fighter
  division: Division
  score: FightScoreBreakdown
  isFastTrack: boolean
  suggestedRounds: number
  isTitleFight: boolean
  isInterimTitle: boolean
  rematchAllowed: boolean
}

// ─────────────────────────────────────────
// FAST TRACK CHECK
// ─────────────────────────────────────────

export function isFastTrack(fighter: Fighter): boolean {
  return (
    fighter.hype_score >= 75 &&
    fighter.current_streak >= 3 &&
    (fighter.wins_ko + fighter.wins_sub) > (fighter.wins_dec)
  )
}

// ─────────────────────────────────────────
// FIGHT SCORE CALCULATION
// ─────────────────────────────────────────

export function calculateFightScore(
  f1: Fighter,
  f2: Fighter,
  f1Rank: number | null,
  f2Rank: number | null,
  fightHistory: { f1vsf2Count: number; lastFightHype: number | null; lastFightDominance: number | null },
  hasFeud: boolean,
  feudIntensity: number,
  currentDate: Date
): FightScoreBreakdown {

  // ── Ranking Proximity (0-25) ──
  let rankingScore = 0
  if (f1Rank !== null && f2Rank !== null) {
    const diff = Math.abs(f1Rank - f2Rank)
    if (diff <= 1)  rankingScore = 25
    else if (diff <= 3) rankingScore = 18
    else if (diff <= 5) rankingScore = 10
    else if (diff <= 8 && (isFastTrack(f1) || isFastTrack(f2))) rankingScore = 14
    else rankingScore = 3
  } else if (f1Rank !== null || f2Rank !== null) {
    rankingScore = 5
  }

  // ── Hype Factor (0-25) ──
  const combinedHype = f1.hype_score + f2.hype_score
  const hypeScore = Math.min(25, combinedHype / 8)

  // ── Freshness / Rematch (0-15, can go negative) ──
  let freshnessScore = 15
  if (fightHistory.f1vsf2Count > 0) {
    const isWarRematch =
      fightHistory.lastFightDominance !== null &&
      fightHistory.lastFightHype !== null &&
      fightHistory.lastFightDominance <= 3 &&
      fightHistory.lastFightHype >= 8

    const isTitleContext = false // handled externally

    if (isWarRematch || isTitleContext) {
      freshnessScore = 8
    } else {
      freshnessScore = -20
    }
  }

  // ── Narrative / Feud (0-15) ──
  let narrativeScore = 0
  if (hasFeud) {
    narrativeScore += Math.min(15, (feudIntensity / 100) * 15)
  }
  if (f1.current_streak >= 2 && f2.current_streak >= 2) narrativeScore += 10
  else if (f1.current_streak >= 2 || f2.current_streak >= 2) narrativeScore += 7
  narrativeScore = Math.min(15, narrativeScore)

  // ── Availability / Timing (0-10) ──
  let availabilityScore = 10
  const today = currentDate.getTime()
  const f1LastFight = f1.last_fight_date ? new Date(f1.last_fight_date).getTime() : null
  const f2LastFight = f2.last_fight_date ? new Date(f2.last_fight_date).getTime() : null
  const avgDaysSinceFight = [f1LastFight, f2LastFight]
    .filter(Boolean)
    .map(d => (today - d!) / (1000 * 60 * 60 * 24))
    .reduce((a, b) => a + b, 0) / 2 || 999

  if (avgDaysSinceFight >= 120) availabilityScore = 10
  else if (avgDaysSinceFight >= 60) availabilityScore = 6
  else availabilityScore = 2

  // ── Title Context (0-10) ──
  let titleScore = 0
  const ranks = [f1Rank, f2Rank].filter(r => r !== null) as number[]
  if (ranks.some(r => r === 1)) titleScore = 10
  else if (ranks.every(r => r <= 5)) titleScore = 8
  else if (ranks.some(r => r <= 3)) titleScore = 6

  const total = rankingScore + hypeScore + freshnessScore + narrativeScore + availabilityScore + titleScore

  return {
    ranking: Math.round(rankingScore * 10) / 10,
    hype: Math.round(hypeScore * 10) / 10,
    freshness: Math.round(freshnessScore * 10) / 10,
    narrative: Math.round(narrativeScore * 10) / 10,
    availability: Math.round(availabilityScore * 10) / 10,
    title_context: Math.round(titleScore * 10) / 10,
    total: Math.round(total * 10) / 10,
  }
}

// ─────────────────────────────────────────
// SCHEDULED ROUNDS LOGIC
// ─────────────────────────────────────────

export function determineScheduledRounds(
  isTitleFight: boolean,
  isInterimTitle: boolean,
  cardPosition: string,
  eventType: 'PPV' | 'Fight Night',
  f1: Fighter,
  f2: Fighter,
  f1Rank: number | null,
  f2Rank: number | null
): number {
  if (isTitleFight || isInterimTitle) return 5
  if (cardPosition === 'main_event') return 5
  if (cardPosition === 'co_main' && eventType === 'PPV') {
    const combinedHype = f1.hype_score + f2.hype_score
    const bothTopFive = f1Rank !== null && f2Rank !== null && f1Rank <= 5 && f2Rank <= 5
    const isContenderFight = f1Rank === 1 || f2Rank === 1
    if (combinedHype >= 150 || bothTopFive || isContenderFight) return 5
  }
  return 3
}

// ─────────────────────────────────────────
// INTERIM TITLE CHALLENGER SELECTION
// ─────────────────────────────────────────

export interface InterimChallengerScore {
  fighter: Fighter
  rank: number
  score: number
  breakdown: { ranking: number; hype: number; activity: number; streak: number; narrative: number }
}

export function scoreInterimChallengerPair(
  f1: Fighter, f1Rank: number,
  f2: Fighter, f2Rank: number,
  currentDate: Date
): number {
  const rankScore = ((16 - f1Rank) + (16 - f2Rank)) / 2 * 1.5
  const hypeScore = (f1.hype_score + f2.hype_score) / 10
  const streakScore = (Math.max(0, f1.current_streak) + Math.max(0, f2.current_streak)) * 2

  const today = currentDate.getTime()
  const f1Days = f1.last_fight_date ? (today - new Date(f1.last_fight_date).getTime()) / 86400000 : 365
  const f2Days = f2.last_fight_date ? (today - new Date(f2.last_fight_date).getTime()) / 86400000 : 365
  const activityScore = Math.min(10, ((f1Days + f2Days) / 2) / 30)

  return rankScore + hypeScore + streakScore + activityScore
}

// ─────────────────────────────────────────
// RANKING SCORE (for leaderboard sorting)
// ─────────────────────────────────────────

export function calculateRankingScore(
  fighter: Fighter,
  recentFightStats: { hype: number; dominance: number; opponentRank: number | null }[]
): number {
  let score = 0

  const last3 = recentFightStats.slice(0, 3)
  const avgHype = last3.reduce((s, f) => s + f.hype, 0) / Math.max(1, last3.length)
  const avgDominance = last3.reduce((s, f) => s + f.dominance, 0) / Math.max(1, last3.length)

  score += avgHype * 0.3
  score += avgDominance * 0.2

  for (const f of last3) {
    if (f.opponentRank !== null) score += (16 - f.opponentRank) * 1.5
  }

  // inactivity penalty
  if (fighter.last_fight_date) {
    const daysSince = (Date.now() - new Date(fighter.last_fight_date).getTime()) / 86400000
    if (daysSince > 270) score -= 5
  }

  return Math.round(score * 100) / 100
}

// ─────────────────────────────────────────
// P4P SCORE
// ─────────────────────────────────────────

import { DIVISION_P4P_MULTIPLIER } from './database.types'

export function calculateP4PScore(fighter: Fighter, divisionRankScore: number): number {
  const multiplier = DIVISION_P4P_MULTIPLIER[fighter.primary_division]
  return Math.round(divisionRankScore * multiplier * 100) / 100
}

// ─────────────────────────────────────────
// INJURY SYSTEM
// ─────────────────────────────────────────

export interface InjuryResult {
  injured: boolean
  severity: 'none' | 'light' | 'medium' | 'severe'
  weeksOut: number
  description: string
}

export function rollInjury(
  fighter: Fighter,
  isWinner: boolean,
  resultMethod: string,
  resultRound: number,
  dominanceRating: number,
  scheduledRounds: number,
  fightCountLast6Months: number
): InjuryResult {
  let baseChance = 0

  if (isWinner) {
    if (resultMethod === 'KO/TKO' && resultRound === 1) baseChance = 0.02
    else if (resultMethod === 'KO/TKO') baseChance = 0.08
    else if (dominanceRating >= 7) baseChance = 0.05
    else baseChance = 0.15
  } else {
    if (resultMethod === 'KO/TKO') baseChance = 0.35
    else if (dominanceRating >= 7) baseChance = 0.20
    else baseChance = 0.30
  }

  // Modifiers
  if (scheduledRounds === 5 && resultRound === 5) baseChance += 0.10
  if ((fighter.age ?? 30) >= 35) baseChance += 0.08
  if (fightCountLast6Months >= 3) baseChance += 0.10
  if (fighter.losses_ko === 0 && resultMethod === 'KO/TKO' && !isWinner) baseChance -= 0.05

  baseChance = Math.min(0.95, Math.max(0, baseChance))

  if (Math.random() > baseChance) {
    return { injured: false, severity: 'none', weeksOut: 0, description: '' }
  }

  const severityRoll = Math.random()
  if (severityRoll < 0.60) {
    const weeks = 6 + Math.floor(Math.random() * 5)
    return { injured: true, severity: 'light', weeksOut: weeks, description: 'Minor injury' }
  } else if (severityRoll < 0.85) {
    const weeks = 12 + Math.floor(Math.random() * 9)
    return { injured: true, severity: 'medium', weeksOut: weeks, description: 'Moderate injury' }
  } else {
    const weeks = 24 + Math.floor(Math.random() * 25)
    return { injured: true, severity: 'severe', weeksOut: weeks, description: 'Severe injury' }
  }
}

// ─────────────────────────────────────────
// RELEASE SYSTEM
// ─────────────────────────────────────────

export function getLoyaltyPoints(fighter: Fighter, currentDate: Date): number {
  let points = 0
  if (fighter.ufc_debut_date) {
    const years = (currentDate.getTime() - new Date(fighter.ufc_debut_date).getTime()) / (365.25 * 86400000)
    if (years >= 5) points += 3
    else if (years >= 3) points += 2
    else if (years >= 1) points += 1
  }
  if (fighter.is_champion || fighter.is_interim_champion) points += 2
  return points
}

export type ReleaseStatus = 'safe' | 'warning' | 'should_release' | 'suggest_release'

export function checkReleaseStatus(
  fighter: Fighter,
  currentDate: Date
): { status: ReleaseStatus; reason: string } {
  const loyalty = getLoyaltyPoints(fighter, currentDate)
  const streak = fighter.current_streak
  const lastFourRecord = { w: 0, l: 0 } // caller should provide this

  if (streak > 0) return { status: 'safe', reason: '' }

  const lossStreak = Math.abs(Math.min(0, streak))

  if (loyalty === 0) {
    if (lossStreak >= 4) return { status: 'should_release', reason: '4 consecutive losses' }
    if (lossStreak >= 3) return { status: 'warning', reason: '3 consecutive losses' }
  } else if (loyalty === 1) {
    if (lossStreak >= 4) return { status: 'should_release', reason: '4 consecutive losses' }
    if (lossStreak >= 3) return { status: 'warning', reason: '3 consecutive losses' }
  } else if (loyalty === 2) {
    if (lossStreak >= 4) return { status: 'should_release', reason: '4 consecutive losses + ranked for over a year' }
    if (lossStreak >= 3) return { status: 'warning', reason: '3 consecutive losses' }
  } else {
    if (lossStreak >= 4) return { status: 'suggest_release', reason: 'Veteran with 4 consecutive losses – your decision' }
    if (lossStreak >= 3) return { status: 'warning', reason: '3 consecutive losses (veteran)' }
  }

  return { status: 'safe', reason: '' }
}

// ─────────────────────────────────────────
// HYPE & DOMINANCE UPDATE AFTER FIGHT
// ─────────────────────────────────────────

export function updateFighterScores(
  fighter: Fighter,
  isWinner: boolean,
  hypeRating: number,
  dominanceRating: number
): { newHype: number; newDominance: number } {
  let hype = fighter.hype_score
  let dominance = fighter.dominance_score

  const hypeImpact = (hypeRating - 5) * 3
  const dominanceImpact = isWinner
    ? (dominanceRating - 5) * 2
    : -(dominanceRating - 5) * 1.5

  hype = Math.min(100, Math.max(0, hype + hypeImpact * (isWinner ? 1 : -0.5)))
  dominance = Math.min(100, Math.max(0, dominance + dominanceImpact))

  return {
    newHype: Math.round(hype * 10) / 10,
    newDominance: Math.round(dominance * 10) / 10,
  }
}

// ─────────────────────────────────────────
// WEIGHT CLASS MOVE SUGGESTION
// ─────────────────────────────────────────

export function shouldSuggestWeightClassMove(
  fighter: Fighter,
  rank: number | null,
  last5Results: { won: boolean }[],
  currentDivisionFightCount: number
): { suggest: boolean; direction: 'up' | 'down' | null; reason: string } {
  if (rank === null || rank < 10) return { suggest: false, direction: null, reason: '' }
  if (fighter.hype_score < 65) return { suggest: false, direction: null, reason: '' }
  if (currentDivisionFightCount < 5) return { suggest: false, direction: null, reason: '' }

  const wins = last5Results.filter(r => r.won).length
  const losses = last5Results.filter(r => !r.won).length

  if (wins >= 3 && losses >= 2 && rank >= 10) {
    return {
      suggest: true,
      direction: 'up',
      reason: `Stuck at #${rank} with inconsistent results – could thrive in another division`,
    }
  }

  if (losses >= 3) {
    return {
      suggest: true,
      direction: 'down',
      reason: `Struggling at this weight – a move down could revitalise their career`,
    }
  }

  return { suggest: false, direction: null, reason: '' }
}
