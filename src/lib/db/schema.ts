import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── M-Pesa Payments ──────────────────────────────────────────────────────────

export const mpesaPayments = pgTable("mpesa_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source", { enum: ["stk_push", "c2b_till"] }).notNull().default("stk_push"),
  status: text("status", { enum: ["Pending", "Success", "Failed", "Cancelled"] })
    .notNull()
    .default("Pending"),
  phone: text("phone").notNull(),
  payerName: text("payer_name"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  businessShortcode: text("business_shortcode"),
  tillNumber: text("till_number"),
  merchantRequestId: text("merchant_request_id"),
  checkoutRequestId: text("checkout_request_id").unique(),
  mpesaReceiptNumber: text("mpesa_receipt_number").unique(),
  resultCode: integer("result_code"),
  resultDesc: text("result_desc"),
  accountReference: text("account_reference"),
  transactionDesc: text("transaction_desc"),
  rawRequestJson: jsonb("raw_request_json").$type<Record<string, unknown>>(),
  rawCallbackJson: jsonb("raw_callback_json").$type<Record<string, unknown>>(),
  initiatedBy: uuid("initiated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

// ─── SMS Automation Rules ─────────────────────────────────────────────────────

export const smsAutomationRules = pgTable("sms_automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default(""),
  minAmount: numeric("min_amount", { precision: 12, scale: 2 }).notNull(),
  maxAmount: numeric("max_amount", { precision: 12, scale: 2 }).notNull(),
  messageTemplate: text("message_template").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── SMS Logs ─────────────────────────────────────────────────────────────────

export const smsLogs = pgTable("sms_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").references(() => mpesaPayments.id, { onDelete: "set null" }),
  ruleId: uuid("rule_id").references(() => smsAutomationRules.id, { onDelete: "set null" }),
  phone: text("phone").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  message: text("message").notNull(),
  providerResponse: jsonb("provider_response").$type<Record<string, unknown>>(),
  status: text("status", { enum: ["sent", "failed", "pending"] }).notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── App Settings ─────────────────────────────────────────────────────────────

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type MpesaPayment = typeof mpesaPayments.$inferSelect;
export type SmsAutomationRule = typeof smsAutomationRules.$inferSelect;
export type SmsLog = typeof smsLogs.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
