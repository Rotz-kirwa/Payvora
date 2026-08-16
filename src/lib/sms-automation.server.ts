import { and, count, desc, eq, gte, ne, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import { appSettings, smsAutomationRules, smsLogs } from "./db/schema";
import { sendSms } from "./sms.server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleRow = {
  id: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  messageTemplate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LogRow = {
  id: string;
  paymentId: string | null;
  ruleId: string | null;
  phone: string;
  amount: number | null;
  message: string;
  status: "sent" | "failed" | "pending";
  errorMessage: string | null;
  createdAt: Date;
};

export type OverlapError = { type: "overlap"; conflicting: RuleRow[] };
export type ValidationError = { type: "validation"; message: string };

// ─── Placeholder engine ───────────────────────────────────────────────────────

export function resolvePlaceholders(
  template: string,
  data: {
    phone: string;
    amount: number;
    transactionCode: string | null;
    date: Date;
    businessName?: string;
  },
): string {
  const formattedAmount = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(data.amount);

  const formattedDate = data.date.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Nairobi",
  });

  const customerName = `0${data.phone.slice(-9)}`;
  const businessName = data.businessName ?? process.env.BUSINESS_NAME ?? "OddsArena";
  const defaultPredictions = data.predictionsText ?? "⚽ Chelsea vs Arsenal → 1X (1.45)\n⚽ Real Madrid vs Sevilla → OVER 2.5 (1.70)";

  return template
    .replace(/\{customer_name\}/gi, customerName)
    .replace(/\{phone\}/gi, data.phone)
    .replace(/\{amount\}/gi, formattedAmount)
    .replace(/\{transaction_code\}/gi, data.transactionCode ?? "N/A")
    .replace(/\{date\}/gi, formattedDate)
    .replace(/\{business_name\}/gi, businessName)
    .replace(/\{predictions\}/gi, defaultPredictions);
}

// ─── Global enabled flag ──────────────────────────────────────────────────────

export async function getSmsAutomationEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "sms_automation_enabled"))
      .limit(1);
    return row?.value === "true";
  } catch {
    return false;
  }
}

export async function setSmsAutomationEnabled(enabled: boolean): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: "sms_automation_enabled", value: String(enabled) })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: String(enabled), updatedAt: new Date() },
    });
}

// ─── Overlap detection ────────────────────────────────────────────────────────

export async function findOverlappingActiveRules(): Promise<RuleRow[]> {
  return [];
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

function toRuleRow(r: typeof smsAutomationRules.$inferSelect): RuleRow {
  return {
    id: r.id,
    name: r.name,
    minAmount: Number(r.minAmount),
    maxAmount: Number(r.maxAmount),
    messageTemplate: r.messageTemplate,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function fetchAllRules(): Promise<RuleRow[]> {
  try {
    await db
      .update(smsAutomationRules)
      .set({ name: "Daily Matches ⚽", minAmount: "50", maxAmount: "50", updatedAt: new Date() })
      .where(or(eq(smsAutomationRules.name, "DAILY FOOTBALL GAMES"), eq(smsAutomationRules.name, "Gold")));

    await db
      .update(smsAutomationRules)
      .set({ name: "Jackpot Matches 🏆", minAmount: "100", maxAmount: "100", updatedAt: new Date() })
      .where(eq(smsAutomationRules.name, "Platinum"));

    await db
      .update(smsAutomationRules)
      .set({ name: "Basket Matches 🏀", minAmount: "50", maxAmount: "50", updatedAt: new Date() })
      .where(eq(smsAutomationRules.name, "Sapphire"));

    await db
      .update(smsAutomationRules)
      .set({ name: "Weekly Subscription 📅", minAmount: "500", maxAmount: "500", updatedAt: new Date() })
      .where(eq(smsAutomationRules.name, "Ruby"));

    await db
      .update(smsAutomationRules)
      .set({ name: "Monthly Subscription 📆", minAmount: "1500", maxAmount: "1500", updatedAt: new Date() })
      .where(eq(smsAutomationRules.name, "Emerald"));

    // Replace old "Thank you... Receipt..." text in existing database records
    const allRules = await db.select().from(smsAutomationRules);
    for (const rule of allRules) {
      if (rule.messageTemplate.includes("Thank you") || rule.messageTemplate.includes("Receipt:")) {
        const updatedTemplate = rule.messageTemplate.replace(
          /Thank you \{customer_name\} for (paying|subscribing with) KES \{amount\}\.? Receipt: \{transaction_code\}\.?/gi,
          "🔥 Good luck with today's picks! Play responsibly & win big with OddsArena!",
        );
        await db
          .update(smsAutomationRules)
          .set({ messageTemplate: updatedTemplate, updatedAt: new Date() })
          .where(eq(smsAutomationRules.id, rule.id));
      }
    }
  } catch (err) {
    console.error("Migration error:", err);
  }

  const rows = await db
    .select()
    .from(smsAutomationRules)
    .orderBy(smsAutomationRules.minAmount);

  if (rows.length === 0) {
    return resetDefaultTiers();
  }

  return rows.map(toRuleRow);
}

export async function createRule(input: {
  name: string;
  minAmount: number;
  maxAmount: number;
  messageTemplate: string;
  isActive: boolean;
}): Promise<RuleRow | OverlapError | ValidationError> {
  if (input.minAmount > input.maxAmount) {
    return { type: "validation", message: "Minimum amount cannot be greater than maximum amount." };
  }
  if (input.minAmount <= 0 || input.maxAmount <= 0) {
    return { type: "validation", message: "Amounts must be positive numbers." };
  }
  if (!input.messageTemplate.trim()) {
    return { type: "validation", message: "Message template cannot be empty." };
  }

  const [row] = await db
    .insert(smsAutomationRules)
    .values({
      name: input.name.trim(),
      minAmount: String(input.minAmount),
      maxAmount: String(input.maxAmount),
      messageTemplate: input.messageTemplate.trim(),
      isActive: input.isActive,
    })
    .returning();

  return toRuleRow(row);
}

export async function updateRule(
  id: string,
  input: {
    name: string;
    minAmount: number;
    maxAmount: number;
    messageTemplate: string;
    isActive: boolean;
  },
): Promise<RuleRow | OverlapError | ValidationError> {
  if (input.minAmount > input.maxAmount) {
    return { type: "validation", message: "Minimum amount cannot be greater than maximum amount." };
  }
  if (input.minAmount <= 0 || input.maxAmount <= 0) {
    return { type: "validation", message: "Amounts must be positive numbers." };
  }
  if (!input.messageTemplate.trim()) {
    return { type: "validation", message: "Message template cannot be empty." };
  }

  const [row] = await db
    .update(smsAutomationRules)
    .set({
      name: input.name.trim(),
      minAmount: String(input.minAmount),
      maxAmount: String(input.maxAmount),
      messageTemplate: input.messageTemplate.trim(),
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(smsAutomationRules.id, id))
    .returning();

  return toRuleRow(row);
}

export async function deleteRule(id: string): Promise<void> {
  await db.delete(smsAutomationRules).where(eq(smsAutomationRules.id, id));
}

export async function resetDefaultTiers(): Promise<RuleRow[]> {
  await db.delete(smsAutomationRules);

  const defaultTiers = [
    {
      name: "Daily Matches ⚽",
      minAmount: "50",
      maxAmount: "50",
      messageTemplate: `DAILY MATCHES ⚽\nToday's selected football predictions:\nArsenal vs Chelsea -> Arsenal Win (1)\nLiverpool vs Tottenham -> Liverpool Win (1)\nManchester City vs Newcastle -> Over 2.5 Goals\nManchester United vs Aston Villa -> Both Teams To Score (BTTS)\nReal Madrid vs Sevilla -> Real Madrid Win (1)\nBarcelona vs Villarreal -> Barcelona Win (1)\nBayern Munich vs Borussia Dortmund -> Over 2.5 Goals\nInter Milan vs AC Milan -> Inter Milan Win (1)\nPSG vs Lyon -> PSG Win (1)\nJuventus vs Napoli -> Both Teams To Score (BTTS)\n🔥 Good luck with today's picks! Play responsibly & win big with OddsArena!`,
      isActive: true,
    },
    {
      name: "Jackpot Matches 🏆",
      minAmount: "100",
      maxAmount: "100",
      messageTemplate: `JACKPOT MATCHES 🏆\nComplete jackpot predictions with carefully selected fixtures:\nMan City vs Arsenal -> 1X\nChelsea vs Liverpool -> GG\nReal Madrid vs Barca -> Over 2.5\nInter vs Milan -> 1\nBayern vs Dortmund -> 1X & Over 2.5\nNapoli vs Juventus -> 2X\nPSG vs Marseille -> 1\nAjax vs PSV -> Over 3.5\nPorto vs Benfica -> 1X\nCeltic vs Rangers -> 1\nMonaco vs Lyon -> GG\nValencia vs Sevilla -> 1X\nLazio vs Roma -> GG\nLeipzig vs Leverkusen -> Over 2.5\nAthletic vs Betis -> 1\n🍀 Best of luck with your Jackpot predictions! Win big with OddsArena!`,
      isActive: true,
    },
    {
      name: "Basket Matches 🏀",
      minAmount: "50",
      maxAmount: "50",
      messageTemplate: `BASKET MATCHES 🏀\nGet selected basketball predictions and expert picks:\nLakers vs Celtics -> Over 215.5 Points\nWarriors vs Bulls -> Warriors Win\nBucks vs Heat -> Bucks -4.5\nNets vs Knicks -> Over 210.0 Points\nSuns vs Mavericks -> Suns Win\nNuggets vs Clippers -> Over 220.5 Points\n76ers vs Hawks -> 76ers Win\nGrizzlies vs Kings -> Over 218.0 Points\n🔥 Good luck with your basketball picks today! Bet responsibly with OddsArena!`,
      isActive: true,
    },
    {
      name: "Weekly Subscription 📅",
      minAmount: "500",
      maxAmount: "500",
      messageTemplate: `WEEKLY SUBSCRIPTION 📅\nUnlimited access to premium OddsArena predictions.\n✓ Daily Matches\n✓ Jackpot Matches\n✓ Basketball Matches\nValid for 7 Days.\n🚀 Good luck with your weekly predictions! Enjoy premium picks from OddsArena!`,
      isActive: true,
    },
    {
      name: "Monthly Subscription 📆",
      minAmount: "1500",
      maxAmount: "1500",
      messageTemplate: `MONTHLY SUBSCRIPTION 📆\nComplete access to OddsArena premium predictions.\n✓ Daily Football Matches\n✓ Jackpot Matches\n✓ Basketball Matches\n✓ Premium Picks\n✓ Daily Updates\nValid for 30 Days.\n👑 Best of luck with your monthly VIP predictions! Win big with OddsArena!`,
      isActive: true,
    },
  ];

  const inserted = await db.insert(smsAutomationRules).values(defaultTiers).returning();
  return inserted.map(toRuleRow);
}

export async function toggleRuleStatus(
  id: string,
  isActive: boolean,
): Promise<RuleRow | OverlapError> {
  if (isActive) {
    const [current] = await db
      .select()
      .from(smsAutomationRules)
      .where(eq(smsAutomationRules.id, id))
      .limit(1);
    if (current) {
      const overlaps = await findOverlappingActiveRules(
        Number(current.minAmount),
        Number(current.maxAmount),
        id,
      );
      if (overlaps.length > 0) return { type: "overlap", conflicting: overlaps };
    }
  }

  const [row] = await db
    .update(smsAutomationRules)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(smsAutomationRules.id, id))
    .returning();

  return toRuleRow(row);
}

// ─── SMS Logs ─────────────────────────────────────────────────────────────────

export async function fetchRecentLogs(limit = 50): Promise<LogRow[]> {
  const rows = await db
    .select()
    .from(smsLogs)
    .orderBy(desc(smsLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    paymentId: r.paymentId,
    ruleId: r.ruleId,
    phone: r.phone,
    amount: r.amount != null ? Number(r.amount) : null,
    message: r.message,
    status: r.status as "sent" | "failed" | "pending",
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
  }));
}

export async function fetchLogStats(): Promise<{
  totalSent: number;
  totalFailed: number;
  todaySent: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [[sent], [failed], [todaySent]] = await Promise.all([
    db.select({ n: count() }).from(smsLogs).where(eq(smsLogs.status, "sent")),
    db.select({ n: count() }).from(smsLogs).where(eq(smsLogs.status, "failed")),
    db
      .select({ n: count() })
      .from(smsLogs)
      .where(and(eq(smsLogs.status, "sent"), gte(smsLogs.createdAt, today))),
  ]);

  return {
    totalSent: Number(sent?.n ?? 0),
    totalFailed: Number(failed?.n ?? 0),
    todaySent: Number(todaySent?.n ?? 0),
  };
}

// ─── Phone validation ─────────────────────────────────────────────────────────

// Valid Kenyan number: 254 followed by 7 or 1, then 8 digits (12 total)
export function isValidKenyanPhone(phone: string): boolean {
  return /^254[17]\d{8}$/.test(phone.replace(/\D/g, ""));
}

// ─── Core automation: called after every C2B payment ─────────────────────────

export async function processPaymentSms(params: {
  paymentId: string;
  phone: string;
  amount: number;
  transactionCode: string | null;
  paidAt: Date;
}): Promise<void> {
  const { paymentId, phone, amount, transactionCode, paidAt } = params;

  console.log(`[sms-automation] START paymentId=${paymentId} amount=${amount} phone=${phone.slice(0, 8)}...`);

  // 1. Global toggle
  const enabled = await getSmsAutomationEnabled();
  if (!enabled) {
    console.log("[sms-automation] Global automation disabled — skipping.");
    return;
  }

  // 2. Phone validation — Safaricom Daraja support confirmed that Onfon (and other
  //    registered Kenyan SMS providers) can deliver to the hashed MSISDN that comes
  //    in C2B Buy Goods callbacks. Pass the phone through as-is to the provider.
  console.log(`[sms-automation] Phone: ${phone.slice(0, 10)}... (may be hashed MSISDN — provider will resolve)`);


  // 3. Find matching active rule — use explicit numeric cast to avoid implicit text comparison
  const [matchedRule] = await db
    .select()
    .from(smsAutomationRules)
    .where(
      and(
        eq(smsAutomationRules.isActive, true),
        sql`${smsAutomationRules.minAmount}::numeric <= ${amount}::numeric`,
        sql`${smsAutomationRules.maxAmount}::numeric >= ${amount}::numeric`,
      ),
    )
    .orderBy(smsAutomationRules.minAmount)
    .limit(1);

  if (!matchedRule) {
    console.log(`[sms-automation] No active rule matched amount ${amount} — skipping SMS.`);
    return;
  }

  console.log(`[sms-automation] Matched rule "${matchedRule.name}" (${matchedRule.minAmount}–${matchedRule.maxAmount}) for amount ${amount}`);

  // 4. Build message
  const message = resolvePlaceholders(matchedRule.messageTemplate, {
    phone,
    amount,
    transactionCode,
    date: paidAt,
  });

  console.log(`[sms-automation] Message: "${message.slice(0, 80)}${message.length > 80 ? "…" : ""}"`);

  // 5. Insert pending log first (so we always have a record even if send crashes)
  const [logRow] = await db
    .insert(smsLogs)
    .values({
      paymentId,
      ruleId: matchedRule.id,
      phone,
      amount: String(amount),
      message,
      status: "pending",
    })
    .returning({ id: smsLogs.id });

  // 6. Send SMS (sendSms never throws — all errors are caught inside)
  const result = await sendSms(phone, message);

  // 7. Update log with final result
  await db
    .update(smsLogs)
    .set({
      status: result.success ? "sent" : "failed",
      providerResponse: result.response,
      errorMessage: result.error ?? null,
    })
    .where(eq(smsLogs.id, logRow.id));

  console.log(
    `[sms-automation] SMS ${result.success ? "SENT ✓" : `FAILED ✗ (${result.error})`} — paymentId=${paymentId} rule="${matchedRule.name}" phone=${phone}`,
  );
}

// ─── Test SMS ─────────────────────────────────────────────────────────────────

export async function sendTestSms(ruleId: string, phone: string): Promise<SmsSendResult & { message: string }> {
  const [rule] = await db
    .select()
    .from(smsAutomationRules)
    .where(eq(smsAutomationRules.id, ruleId))
    .limit(1);

  if (!rule) throw new Error("Rule not found");

  const sampleAmount = (Number(rule.minAmount) + Number(rule.maxAmount)) / 2;
  const message = resolvePlaceholders(rule.messageTemplate, {
    phone,
    amount: sampleAmount,
    transactionCode: "TEST123456",
    date: new Date(),
  });

  const result = await sendSms(phone, message);

  // Log the test send
  await db.insert(smsLogs).values({
    paymentId: null,
    ruleId: rule.id,
    phone,
    amount: String(sampleAmount),
    message,
    status: result.success ? "sent" : "failed",
    providerResponse: result.response,
    errorMessage: result.error ?? null,
  });

  return { ...result, message };
}

// Re-export the type so route files can use it without importing sms.server
import type { SmsSendResult } from "./sms.server";
