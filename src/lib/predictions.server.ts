import { desc, eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { jackpots, jackpotMatches, predictions, type Prediction, type Jackpot, type JackpotMatch } from "./db/schema";

export type PredictionInput = {
  sport?: "football" | "basketball";
  league?: string;
  matchDate?: Date | string;
  team1: string;
  team2: string;
  prediction: string;
  odds?: number | string;
  predictionType?: string;
  confidence?: number;
  score1?: number | null;
  score2?: number | null;
  actualResult?: string | null;
  status?: "pending" | "won" | "lost" | "void";
  isPublished?: boolean;
};

export type JackpotMatchInput = {
  matchOrder: number;
  team1: string;
  team2: string;
  prediction: string;
  score1?: number | null;
  score2?: number | null;
  status?: "pending" | "won" | "lost" | "void";
};

export type JackpotWithMatches = Jackpot & {
  matches: JackpotMatch[];
};

// ─── Ensure Tables Exist (SQL Fallback) ──────────────────────────────────────

let tablesChecked = false;

export async function ensurePredictionTables() {
  if (tablesChecked) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS predictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sport TEXT NOT NULL DEFAULT 'football',
        league TEXT NOT NULL DEFAULT '',
        match_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        team1 TEXT NOT NULL,
        team2 TEXT NOT NULL,
        prediction TEXT NOT NULL,
        odds NUMERIC(5,2) NOT NULL DEFAULT 1.85,
        prediction_type TEXT NOT NULL DEFAULT 'Gold',
        confidence INTEGER NOT NULL DEFAULT 85,
        score1 INTEGER,
        score2 INTEGER,
        actual_result TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        is_published BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS jackpots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        jackpot_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL DEFAULT 'ODDSARENA MEGA JACKPOT',
        total_odds NUMERIC(8,2) NOT NULL DEFAULT 10.00,
        status TEXT NOT NULL DEFAULT 'OPEN',
        is_published BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS jackpot_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        jackpot_id UUID REFERENCES jackpots(id) ON DELETE CASCADE,
        match_order INTEGER NOT NULL DEFAULT 1,
        team1 TEXT NOT NULL,
        team2 TEXT NOT NULL,
        prediction TEXT NOT NULL,
        score1 INTEGER,
        score2 INTEGER,
        status TEXT NOT NULL DEFAULT 'pending'
      );
    `);
    tablesChecked = true;
  } catch (err) {
    console.error("Error creating prediction tables:", err);
  }
}

// ─── Seed Default Predictions & Jackpots ─────────────────────────────────────

export async function seedDefaultPredictions() {
  await ensurePredictionTables();

  try {
    const existingPreds = await db.select({ id: predictions.id }).from(predictions).limit(1);
    if (existingPreds.length === 0) {
      await db.insert(predictions).values([
        {
          sport: "football",
          league: "English Premier League",
          team1: "Arsenal",
          team2: "Everton",
          prediction: "Team 1 Win (1)",
          odds: "1.75",
          predictionType: "Gold",
          confidence: 88,
          status: "pending",
          isPublished: true,
        },
        {
          sport: "football",
          league: "English Premier League",
          team1: "Chelsea",
          team2: "West Ham",
          prediction: "Over 2.5 Goals",
          odds: "1.85",
          predictionType: "Gold",
          confidence: 85,
          status: "pending",
          isPublished: true,
        },
        {
          sport: "football",
          league: "La Liga",
          team1: "Real Madrid",
          team2: "Sevilla",
          prediction: "Team 1 Win (1)",
          odds: "1.65",
          predictionType: "Platinum",
          confidence: 92,
          score1: 2,
          score2: 1,
          actualResult: "2 - 1",
          status: "won",
          isPublished: true,
        },
        {
          sport: "football",
          league: "La Liga",
          team1: "Barcelona",
          team2: "Real Betis",
          prediction: "Both Teams To Score (GG)",
          odds: "1.78",
          predictionType: "Platinum",
          confidence: 86,
          status: "pending",
          isPublished: true,
        },
        {
          sport: "football",
          league: "UEFA Champions League",
          team1: "Inter Milan",
          team2: "Lazio",
          prediction: "1X & Over 1.5",
          odds: "1.95",
          predictionType: "Sapphire",
          confidence: 90,
          status: "pending",
          isPublished: true,
        },
        {
          sport: "football",
          league: "English Premier League",
          team1: "Liverpool",
          team2: "Manchester United",
          prediction: "Team 1 Win & GG",
          odds: "2.35",
          predictionType: "Ruby",
          confidence: 84,
          status: "pending",
          isPublished: true,
        },
        {
          sport: "football",
          league: "UEFA Champions League",
          team1: "Manchester City",
          team2: "Bayern Munich",
          prediction: "Over 3.5 Goals",
          odds: "2.60",
          predictionType: "Emerald",
          confidence: 82,
          status: "pending",
          isPublished: true,
        },
        {
          sport: "basketball",
          league: "NBA",
          team1: "Boston Celtics",
          team2: "LA Lakers",
          prediction: "Boston Celtics -5.5",
          odds: "1.90",
          predictionType: "Gold",
          confidence: 87,
          status: "pending",
          isPublished: true,
        },
        {
          sport: "basketball",
          league: "NBA",
          team1: "Golden State Warriors",
          team2: "Phoenix Suns",
          prediction: "Over 224.5 Points",
          odds: "1.85",
          predictionType: "Platinum",
          confidence: 89,
          status: "pending",
          isPublished: true,
        },
      ]);
    }

    const existingJackpots = await db.select({ id: jackpots.id }).from(jackpots).limit(1);
    if (existingJackpots.length === 0) {
      const [newJackpot] = await db
        .insert(jackpots)
        .values({
          jackpotCode: "JA-001",
          title: "ODDSARENA 5-GAME MEGA JACKPOT",
          totalOdds: "14.85",
          status: "OPEN",
          isPublished: true,
        })
        .returning();

      if (newJackpot) {
        await db.insert(jackpotMatches).values([
          { jackpotId: newJackpot.id, matchOrder: 1, team1: "Arsenal", team2: "Everton", prediction: "1" },
          { jackpotId: newJackpot.id, matchOrder: 2, team1: "Chelsea", team2: "West Ham", prediction: "X" },
          { jackpotId: newJackpot.id, matchOrder: 3, team1: "Real Madrid", team2: "Sevilla", prediction: "1" },
          { jackpotId: newJackpot.id, matchOrder: 4, team1: "Barcelona", team2: "Real Betis", prediction: "2" },
          { jackpotId: newJackpot.id, matchOrder: 5, team1: "Inter Milan", team2: "Lazio", prediction: "1" },
        ]);
      }
    }
  } catch (err) {
    console.error("Error seeding default predictions:", err);
  }
}

// ─── Prediction Operations ───────────────────────────────────────────────────

export async function fetchAllPredictions(): Promise<Prediction[]> {
  await ensurePredictionTables();
  await seedDefaultPredictions();
  return db.select().from(predictions).orderBy(desc(predictions.createdAt));
}

export async function createPrediction(input: PredictionInput): Promise<Prediction> {
  await ensurePredictionTables();
  const [created] = await db
    .insert(predictions)
    .values({
      sport: input.sport ?? "football",
      league: input.league ?? "",
      matchDate: input.matchDate ? new Date(input.matchDate) : new Date(),
      team1: input.team1,
      team2: input.team2,
      prediction: input.prediction,
      odds: String(input.odds ?? "1.85"),
      predictionType: input.predictionType ?? "Gold",
      confidence: input.confidence ?? 85,
      score1: input.score1 ?? null,
      score2: input.score2 ?? null,
      actualResult: input.actualResult ?? null,
      status: input.status ?? "pending",
      isPublished: input.isPublished ?? true,
    })
    .returning();
  return created;
}

export async function updatePrediction(id: string, input: Partial<PredictionInput>): Promise<Prediction> {
  await ensurePredictionTables();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.sport !== undefined) updateData.sport = input.sport;
  if (input.league !== undefined) updateData.league = input.league;
  if (input.matchDate !== undefined) updateData.matchDate = new Date(input.matchDate);
  if (input.team1 !== undefined) updateData.team1 = input.team1;
  if (input.team2 !== undefined) updateData.team2 = input.team2;
  if (input.prediction !== undefined) updateData.prediction = input.prediction;
  if (input.odds !== undefined) updateData.odds = String(input.odds);
  if (input.predictionType !== undefined) updateData.predictionType = input.predictionType;
  if (input.confidence !== undefined) updateData.confidence = input.confidence;
  if (input.score1 !== undefined) updateData.score1 = input.score1;
  if (input.score2 !== undefined) updateData.score2 = input.score2;
  if (input.actualResult !== undefined) updateData.actualResult = input.actualResult;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.isPublished !== undefined) updateData.isPublished = input.isPublished;

  const [updated] = await db
    .update(predictions)
    .set(updateData)
    .where(eq(predictions.id, id))
    .returning();
  return updated;
}

export async function deletePrediction(id: string): Promise<void> {
  await ensurePredictionTables();
  await db.delete(predictions).where(eq(predictions.id, id));
}

export async function setPredictionResult(
  id: string,
  result: { score1?: number | null; score2?: number | null; status: "pending" | "won" | "lost" | "void"; actualResult?: string },
): Promise<Prediction> {
  await ensurePredictionTables();
  const actualStr =
    result.actualResult ??
    (result.score1 !== undefined && result.score2 !== undefined && result.score1 !== null && result.score2 !== null
      ? `${result.score1} - ${result.score2}`
      : null);

  const [updated] = await db
    .update(predictions)
    .set({
      score1: result.score1 ?? null,
      score2: result.score2 ?? null,
      actualResult: actualStr,
      status: result.status,
      updatedAt: new Date(),
    })
    .where(eq(predictions.id, id))
    .returning();
  return updated;
}

// ─── Jackpot Operations ───────────────────────────────────────────────────────

export async function fetchJackpotsWithMatches(): Promise<JackpotWithMatches[]> {
  await ensurePredictionTables();
  await seedDefaultPredictions();

  const jList = await db.select().from(jackpots).orderBy(desc(jackpots.createdAt));
  const result: JackpotWithMatches[] = [];

  for (const j of jList) {
    const mList = await db
      .select()
      .from(jackpotMatches)
      .where(eq(jackpotMatches.jackpotId, j.id))
      .orderBy(jackpotMatches.matchOrder);
    result.push({ ...j, matches: mList });
  }

  return result;
}

export async function createJackpot(
  jackpotCode: string,
  title: string,
  totalOdds: number | string,
  matches: { matchOrder: number; team1: string; team2: string; prediction: string }[],
): Promise<JackpotWithMatches> {
  await ensurePredictionTables();

  const [j] = await db
    .insert(jackpots)
    .values({
      jackpotCode,
      title: title || "ODDSARENA MEGA JACKPOT",
      totalOdds: String(totalOdds),
      status: "OPEN",
      isPublished: true,
    })
    .returning();

  const createdMatches: JackpotMatch[] = [];
  if (matches.length > 0) {
    const inserted = await db
      .insert(jackpotMatches)
      .values(
        matches.map((m) => ({
          jackpotId: j.id,
          matchOrder: m.matchOrder,
          team1: m.team1,
          team2: m.team2,
          prediction: m.prediction,
          status: "pending" as const,
        })),
      )
      .returning();
    createdMatches.push(...inserted);
  }

  return { ...j, matches: createdMatches };
}

export async function updateJackpotStatus(id: string, status: "OPEN" | "CLOSED" | "SETTLED"): Promise<Jackpot> {
  await ensurePredictionTables();
  const [updated] = await db
    .update(jackpots)
    .set({ status, updatedAt: new Date() })
    .where(eq(jackpots.id, id))
    .returning();
  return updated;
}

export async function deleteJackpot(id: string): Promise<void> {
  await ensurePredictionTables();
  await db.delete(jackpots).where(eq(jackpots.id, id));
}

// ─── Dynamic SMS Customer Prediction Resolver ───────────────────────────────

export async function formatPredictionsForCustomerSms(tierName?: string): Promise<string> {
  await ensurePredictionTables();
  const allPublished = await db
    .select()
    .from(predictions)
    .where(eq(predictions.isPublished, true))
    .orderBy(desc(predictions.createdAt));

  let filtered = allPublished;
  if (tierName) {
    filtered = allPublished.filter((p) => p.predictionType.toLowerCase() === tierName.toLowerCase());
  }

  if (filtered.length === 0) {
    filtered = allPublished.slice(0, 4);
  }

  if (filtered.length === 0) {
    return "⚽ TODAY'S ODDSARENA PICKS:\n1. Arsenal vs Everton -> 1\n2. Chelsea vs West Ham -> OVER 2.5";
  }

  const lines = filtered.map(
    (p, i) => `${i + 1}. ${p.team1} vs ${p.team2} → ${p.prediction.toUpperCase()} (Odds: ${p.odds})`,
  );
  return `⚽ ODDSARENA ${tierName ? tierName.toUpperCase() : "DAILY"} PICKS:\n${lines.join("\n")}`;
}
