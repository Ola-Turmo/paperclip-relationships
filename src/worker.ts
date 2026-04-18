import type { PluginContext, PluginHealthDiagnostics } from "@paperclipai/plugin-sdk";
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { ACTION_TOOL_DEFINITIONS } from "./definitions.js";
import {
  ACTION_KEYS,
  DATA_KEYS,
  DATA_VIEW_KEYS,
  DEFAULT_BIRTHDAY_LOOKAHEAD_DAYS,
  DEFAULT_BIRTHDAY_REMINDER_DAYS,
  DEFAULT_RECONNECT_LAG_DAYS,
  FAMILY_LOGISTICS_TYPES,
  GIFT_STATUSES,
  INTERACTION_TYPES,
  JOB_KEYS,
  RELATIONSHIP_CATEGORIES,
  RELATIONSHIP_TIERS,
  SCORE_VALUES,
} from "./constants.js";
import type {
  BirthdayReminder,
  Contact,
  ConversationNote,
  EldercareCheckin,
  FamilyLogisticsItem,
  GiftIdea,
  Interaction,
  ReconnectItem,
  RuntimeState,
  SocialEvent,
} from "./types.js";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const INSTANCE_SCOPE = { scopeKind: "instance" as const };

type ActionParams = Record<string, unknown>;
type ActionHandler = (params: ActionParams) => Promise<unknown>;
type DataHandler = (params: Record<string, unknown>) => Promise<unknown>;
type IdentifiedRecord = { id: string };

type BirthdayOccurrence = {
  daysUntil: number;
  occurrenceYear: number;
  occurrenceDateIso: string;
  deliveryMarker: string;
};

type ReconnectSnapshot = {
  items: ReconnectItem[];
  created: ReconnectItem[];
  resolved: ReconnectItem[];
  staleContacts: Contact[];
  mutated: boolean;
};

let healthReporter: (() => Promise<PluginHealthDiagnostics>) | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function trimString(value: string): string {
  return value.trim();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && trimString(value).length > 0 ? trimString(value) : undefined;
}

function asRequiredString(value: unknown, fieldName: string): string {
  const normalized = asOptionalString(value);
  if (!normalized) throw new Error(`${fieldName} is required`);
  return normalized;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map(trimString).filter(Boolean))];
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new Error("Expected an array of strings");
  if (value.some((item) => typeof item !== "string")) throw new Error("Expected an array of strings");
  return dedupeStrings(value);
}

function asOptionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${fieldName} must be a finite number`);
  return value;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function assertOneOf<T extends readonly (string | number)[]>(value: unknown, allowed: T, fieldName: string): T[number] {
  if (allowed.includes(value as T[number])) return value as T[number];
  throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}`);
}

function asOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = asOptionalNumber(value, fieldName);
  if (parsed == null) return undefined;
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${fieldName} must be a positive integer`);
  return parsed;
}

function asOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = asOptionalNumber(value, fieldName);
  if (parsed == null) return undefined;
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${fieldName} must be a non-negative integer`);
  return parsed;
}

function asOptionalNonNegativeNumber(value: unknown, fieldName: string): number | undefined {
  const parsed = asOptionalNumber(value, fieldName);
  if (parsed == null) return undefined;
  if (parsed < 0) throw new Error(`${fieldName} must be zero or greater`);
  return parsed;
}

function normalizeReminderDays(value: unknown, fallback: readonly number[] = DEFAULT_BIRTHDAY_REMINDER_DAYS): number[] {
  if (value == null) return [...fallback];
  if (!Array.isArray(value)) throw new Error("reminderDaysBefore must be an array of non-negative integers");
  if (value.some((item) => typeof item !== "number" || !Number.isInteger(item) || item < 0)) {
    throw new Error("reminderDaysBefore must be an array of non-negative integers");
  }
  const normalized = [...new Set(value)].sort((a, b) => b - a);
  if (normalized.length === 0) throw new Error("reminderDaysBefore must include at least one non-negative integer");
  return normalized;
}

function ensureMonthDay(value: string, fieldName: string): string {
  const normalized = trimString(value);
  const match = /^(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) throw new Error(`${fieldName} must use MM-DD format`);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const candidate = new Date(Date.UTC(2024, month - 1, day));
  if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw new Error(`${fieldName} must be a valid calendar day`);
  }
  return normalized;
}

function asOptionalMonthDay(value: unknown, fieldName: string): string | undefined {
  if (value == null) return undefined;
  if (value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${fieldName} must be a string in MM-DD format`);
  return ensureMonthDay(value, fieldName);
}

function ensureIsoLikeDate(value: string, fieldName: string): string {
  const normalized = trimString(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-]+(?:Z|[+-]\d{2}:\d{2})?)?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a valid ISO-like date or timestamp`);
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${fieldName} must be a valid ISO-like date or timestamp`);
  return normalized;
}

function asOptionalIsoLikeDate(value: unknown, fieldName: string): string | undefined {
  if (value == null) return undefined;
  if (value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${fieldName} must be a string`);
  return ensureIsoLikeDate(value, fieldName);
}

function sortByNewest<T extends { createdAt?: string; updatedAt?: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => {
    const a = left.updatedAt ?? left.createdAt ?? "";
    const b = right.updatedAt ?? right.createdAt ?? "";
    return b.localeCompare(a);
  });
}

function sortByOccurredAt<T extends { occurredAt?: string; checkinAt?: string; addedAt?: string; date?: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => {
    const a = left.occurredAt ?? left.checkinAt ?? left.addedAt ?? left.date ?? "";
    const b = right.occurredAt ?? right.checkinAt ?? right.addedAt ?? right.date ?? "";
    return b.localeCompare(a);
  });
}

function getBirthdayOccurrence(date: string, today = new Date()): BirthdayOccurrence {
  const [month, day] = date.split("-").map(Number);
  const currentYear = today.getUTCFullYear();
  const occurrence = new Date(Date.UTC(currentYear, month - 1, day));
  const currentDate = Date.UTC(currentYear, today.getUTCMonth(), today.getUTCDate());
  if (occurrence.getTime() < currentDate) occurrence.setUTCFullYear(currentYear + 1);
  const daysUntil = Math.round((occurrence.getTime() - currentDate) / 86400000);
  const occurrenceYear = occurrence.getUTCFullYear();
  return {
    daysUntil,
    occurrenceYear,
    occurrenceDateIso: occurrence.toISOString().slice(0, 10),
    deliveryMarker: `${occurrenceYear}:${daysUntil}`,
  };
}

function daysSince(isoDate: string | undefined, today = new Date()): number {
  if (!isoDate) return Number.POSITIVE_INFINITY;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((today.getTime() - parsed.getTime()) / 86400000);
}

function buildSuggestedOutreach(contact: Contact): string {
  switch (contact.relationship) {
    case "family":
      return "Check in personally and ask about logistics, wellbeing, and anything practical they need help with.";
    case "close":
      return "Send a warm catch-up message that references a recent topic and suggest dedicated time together.";
    case "professional":
    case "colleague":
      return "Send a short update, mention your last conversation, and ask how things are going on their side.";
    default:
      return "Send a light personal note referencing a shared memory, current season, or upcoming occasion.";
  }
}

function buildAutomaticReconnectReason(contact: Contact): string {
  return `No logged interaction in ${daysSince(contact.lastContactedAt ?? contact.createdAt)} days`;
}

function eventIncludesContact(event: SocialEvent, contactId: string): boolean {
  return event.organizerId === contactId || event.attendees.includes(contactId);
}

function birthdayDisplay(reminder: BirthdayReminder, occurrence: BirthdayOccurrence): string {
  if (occurrence.daysUntil === 0) return `Birthday today (${reminder.date})`;
  if (occurrence.daysUntil === 1) return `Birthday tomorrow (${reminder.date})`;
  return `Birthday in ${occurrence.daysUntil} days (${reminder.date})`;
}

async function getCollection<T>(ctx: PluginContext, key: string): Promise<T[]> {
  const value = await ctx.state.get({ ...INSTANCE_SCOPE, stateKey: key });
  return Array.isArray(value) ? (value as T[]) : [];
}

async function setCollection<T>(ctx: PluginContext, key: string, records: T[]): Promise<void> {
  await ctx.state.set({ ...INSTANCE_SCOPE, stateKey: key }, records);
}

async function getRuntimeState(ctx: PluginContext): Promise<RuntimeState> {
  const value = await ctx.state.get({ ...INSTANCE_SCOPE, stateKey: DATA_KEYS.RUNTIME });
  return (value && typeof value === "object" ? value : {}) as RuntimeState;
}

async function setRuntimeState(ctx: PluginContext, state: RuntimeState): Promise<void> {
  await ctx.state.set({ ...INSTANCE_SCOPE, stateKey: DATA_KEYS.RUNTIME }, state);
}

function requireRecord<T extends IdentifiedRecord>(records: T[], id: string, recordName: string): T {
  const found = records.find((record) => record.id === id);
  if (!found) throw new Error(`${recordName} not found`);
  return found;
}

async function updateRecord<T extends IdentifiedRecord>(
  ctx: PluginContext,
  key: string,
  id: string,
  updater: (record: T) => T,
  recordName: string,
): Promise<T> {
  const records = await getCollection<T>(ctx, key);
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) throw new Error(`${recordName} not found`);
  const next = [...records];
  const updated = updater(records[index]!);
  next[index] = updated;
  await setCollection(ctx, key, next);
  return updated;
}

async function requireContact(ctx: PluginContext, contactId: string): Promise<Contact> {
  const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
  return requireRecord(contacts, contactId, "Contact");
}

async function syncBirthdayReminderForContact(ctx: PluginContext, contact: Contact): Promise<BirthdayReminder | null> {
  const reminders = await getCollection<BirthdayReminder>(ctx, DATA_KEYS.BIRTHDAYS);
  const existingIndex = reminders.findIndex((reminder) => reminder.contactId === contact.id);
  const timestamp = nowIso();

  if (!contact.birthday) {
    if (existingIndex === -1) return null;
    const next = reminders.filter((reminder) => reminder.contactId !== contact.id);
    await setCollection(ctx, DATA_KEYS.BIRTHDAYS, next);
    return null;
  }

  const existing = existingIndex === -1 ? undefined : reminders[existingIndex]!;
  const nextReminder: BirthdayReminder = existing
    ? {
        ...existing,
        date: contact.birthday,
        reminderDaysBefore: existing.reminderDaysBefore.length ? existing.reminderDaysBefore : [...DEFAULT_BIRTHDAY_REMINDER_DAYS],
        deliveryLog: existing.date === contact.birthday ? existing.deliveryLog : [],
        sent: existing.date === contact.birthday ? existing.sent : false,
        lastSentYear: existing.date === contact.birthday ? existing.lastSentYear : undefined,
        updatedAt: timestamp,
      }
    : {
        id: generateId(),
        contactId: contact.id,
        date: contact.birthday,
        reminderDaysBefore: [...DEFAULT_BIRTHDAY_REMINDER_DAYS],
        sent: false,
        lastSentYear: undefined,
        deliveryLog: [],
        createdAt: timestamp,
      };

  const next = [...reminders];
  if (existingIndex === -1) next.push(nextReminder);
  else next[existingIndex] = nextReminder;
  await setCollection(ctx, DATA_KEYS.BIRTHDAYS, next);
  return nextReminder;
}

async function syncContactBirthdayFromReminder(ctx: PluginContext, contactId: string, birthday: string): Promise<Contact> {
  return updateRecord<Contact>(ctx, DATA_KEYS.CONTACTS, contactId, (contact) => ({
    ...contact,
    birthday,
    updatedAt: nowIso(),
  }), "Contact");
}

async function completeAutomaticReconnectItemsForContact(ctx: PluginContext, contactId: string, completedAt: string): Promise<number> {
  const items = await getCollection<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS);
  let changed = 0;
  const next = items.map((item) => {
    if (item.contactId !== contactId || item.source !== "automatic" || item.completed) return item;
    changed += 1;
    return {
      ...item,
      completed: true,
      completedAt,
      updatedAt: completedAt,
    };
  });
  if (changed > 0) await setCollection(ctx, DATA_KEYS.RECONNECT_LISTS, next);
  return changed;
}

async function syncContactPointers(ctx: PluginContext, contactId: string): Promise<void> {
  const interactions = await getCollection<Interaction>(ctx, DATA_KEYS.INTERACTIONS);
  const latest = sortByOccurredAt(interactions.filter((interaction) => interaction.contactId === contactId))[0];
  await updateRecord<Contact>(ctx, DATA_KEYS.CONTACTS, contactId, (contact) => ({
    ...contact,
    lastContactedAt: latest?.occurredAt ?? contact.lastContactedAt,
    lastInteractionId: latest?.id ?? contact.lastInteractionId,
    updatedAt: nowIso(),
  }), "Contact");
}

async function reconcileFreshContact(ctx: PluginContext, contactId: string): Promise<void> {
  const contact = await requireContact(ctx, contactId);
  const stale = daysSince(contact.lastContactedAt ?? contact.createdAt) >= (contact.reminderFrequencyDays ?? DEFAULT_RECONNECT_LAG_DAYS);
  if (!stale) {
    await completeAutomaticReconnectItemsForContact(ctx, contactId, nowIso());
  }
}

async function getUpcomingBirthdayEntries(ctx: PluginContext, withinDays: number): Promise<Array<BirthdayReminder & { contact?: Contact; occurrence: BirthdayOccurrence }>> {
  const reminders = await getCollection<BirthdayReminder>(ctx, DATA_KEYS.BIRTHDAYS);
  const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
  return reminders
    .map((reminder) => ({
      ...reminder,
      deliveryLog: reminder.deliveryLog ?? [],
      contact: contacts.find((contact) => contact.id === reminder.contactId),
      occurrence: getBirthdayOccurrence(reminder.date),
    }))
    .filter((entry) => entry.occurrence.daysUntil <= withinDays)
    .sort((left, right) => left.occurrence.daysUntil - right.occurrence.daysUntil || left.date.localeCompare(right.date));
}

function buildReconnectSnapshot(
  contacts: Contact[],
  items: ReconnectItem[],
  defaultLagDays = DEFAULT_RECONNECT_LAG_DAYS,
  timestamp = nowIso(),
): ReconnectSnapshot {
  const staleContacts = contacts.filter((contact) => daysSince(contact.lastContactedAt ?? contact.createdAt) >= (contact.reminderFrequencyDays ?? defaultLagDays));
  const staleContactIds = new Set(staleContacts.map((contact) => contact.id));
  const resolved: ReconnectItem[] = [];
  let mutated = false;
  const next = items.map((item) => {
    if (item.source === "automatic" && !item.completed && !staleContactIds.has(item.contactId)) {
      const updated: ReconnectItem = {
        ...item,
        completed: true,
        completedAt: timestamp,
        updatedAt: timestamp,
      };
      resolved.push(updated);
      mutated = true;
      return updated;
    }
    if (item.source === "automatic" && !item.completed) {
      const contact = staleContacts.find((entry) => entry.id === item.contactId);
      if (!contact) return item;
      const nextReason = buildAutomaticReconnectReason(contact);
      const nextSuggestedOutreach = buildSuggestedOutreach(contact);
      if (item.reason === nextReason && item.suggestedOutreach === nextSuggestedOutreach) return item;
      mutated = true;
      return {
        ...item,
        reason: nextReason,
        suggestedOutreach: nextSuggestedOutreach,
        updatedAt: timestamp,
      };
    }
    return item;
  });

  const created: ReconnectItem[] = [];
  for (const contact of staleContacts) {
    const hasOpenItem = next.some((item) => item.contactId === contact.id && !item.completed);
    if (hasOpenItem) continue;
    const createdItem: ReconnectItem = {
      id: generateId(),
      contactId: contact.id,
      reason: buildAutomaticReconnectReason(contact),
      suggestedOutreach: buildSuggestedOutreach(contact),
      addedAt: timestamp,
      attempts: 0,
      completed: false,
      source: "automatic",
    };
    next.push(createdItem);
    created.push(createdItem);
    mutated = true;
  }

  return { items: next, created, resolved, staleContacts, mutated };
}

async function refreshReconnectList(ctx: PluginContext, defaultLagDays = DEFAULT_RECONNECT_LAG_DAYS): Promise<ReconnectSnapshot> {
  const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
  const items = await getCollection<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS);
  const snapshot = buildReconnectSnapshot(contacts, items, defaultLagDays);
  if (snapshot.mutated) await setCollection(ctx, DATA_KEYS.RECONNECT_LISTS, snapshot.items);
  return snapshot;
}

async function listCompanies(ctx: PluginContext): Promise<Array<{ id: string }>> {
  return (await ctx.companies.list({ limit: 100 })) as Array<{ id: string }>;
}

async function runBirthdayReminderDigest(ctx: PluginContext): Promise<{ logged: number }> {
  const companies = await listCompanies(ctx);
  const reminders = await getCollection<BirthdayReminder>(ctx, DATA_KEYS.BIRTHDAYS);
  const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
  const timestamp = nowIso();
  let changed = false;
  let logged = 0;
  const nextReminders: BirthdayReminder[] = [];

  for (const reminder of reminders) {
    const occurrence = getBirthdayOccurrence(reminder.date);
    const deliveryLog = reminder.deliveryLog ?? [];
    const shouldLog = reminder.reminderDaysBefore.includes(occurrence.daysUntil) || occurrence.daysUntil === 0;
    if (!shouldLog || deliveryLog.includes(occurrence.deliveryMarker)) {
      nextReminders.push({ ...reminder, deliveryLog });
      continue;
    }

    const contact = contacts.find((entry) => entry.id === reminder.contactId);
    if (!contact) {
      nextReminders.push({ ...reminder, deliveryLog });
      continue;
    }

    for (const company of companies) {
      await ctx.activity.log({
        companyId: company.id,
        message: `Birthday reminder for ${contact.name}: ${birthdayDisplay(reminder, occurrence)}`,
        entityType: "contact",
        entityId: contact.id,
        metadata: {
          contactId: contact.id,
          birthday: reminder.date,
          daysUntil: occurrence.daysUntil,
          occurrenceDate: occurrence.occurrenceDateIso,
        },
      });
      logged += 1;
    }

    changed = true;
    nextReminders.push({
      ...reminder,
      deliveryLog: [...deliveryLog, occurrence.deliveryMarker],
      sent: true,
      lastSentYear: occurrence.occurrenceYear,
      updatedAt: timestamp,
    });
  }

  if (changed) {
    await setCollection(ctx, DATA_KEYS.BIRTHDAYS, nextReminders);
  }

  return { logged };
}

async function runReconnectDigest(ctx: PluginContext, force = false): Promise<{ logged: boolean; staleCount: number; createdCount: number; resolvedCount: number }> {
  const companies = await listCompanies(ctx);
  const { created, resolved, staleContacts } = await refreshReconnectList(ctx);
  const today = new Date().toISOString().slice(0, 10);
  const runtime = await getRuntimeState(ctx);

  if (!force && runtime.lastReconnectNudgeDate === today) {
    return { logged: false, staleCount: staleContacts.length, createdCount: created.length, resolvedCount: resolved.length };
  }

  if (staleContacts.length === 0) {
    return { logged: false, staleCount: 0, createdCount: created.length, resolvedCount: resolved.length };
  }

  const names = staleContacts.slice(0, 5).map((contact) => contact.name).join(", ");
  for (const company of companies) {
    await ctx.activity.log({
      companyId: company.id,
      message: `Reconnect nudge: ${staleContacts.length} relationship${staleContacts.length === 1 ? "" : "s"} need attention (${names}).`,
      metadata: {
        staleContactIds: staleContacts.map((contact) => contact.id),
        createdReconnectItemIds: created.map((item) => item.id),
        resolvedReconnectItemIds: resolved.map((item) => item.id),
      },
    });
  }

  await setRuntimeState(ctx, { ...runtime, lastReconnectNudgeDate: today });
  return { logged: true, staleCount: staleContacts.length, createdCount: created.length, resolvedCount: resolved.length };
}

function buildRelationshipSummary(input: {
  contact: Contact;
  interactions: Interaction[];
  birthdays: BirthdayReminder[];
  giftIdeas: GiftIdea[];
  socialEvents: SocialEvent[];
  conversationNotes: ConversationNote[];
  reconnectItems: ReconnectItem[];
  familyItems: FamilyLogisticsItem[];
  eldercareCheckins: EldercareCheckin[];
}) {
  const { contact, interactions, birthdays, giftIdeas, socialEvents, conversationNotes, reconnectItems, familyItems, eldercareCheckins } = input;
  const recentInteractions = sortByOccurredAt(interactions.filter((interaction) => interaction.contactId === contact.id)).slice(0, 5);
  const lastInteraction = recentInteractions[0] ?? null;
  const reconnectItem = reconnectItems.find((item) => item.contactId === contact.id && !item.completed) ?? null;
  const birthdayReminder = birthdays
    .filter((birthday) => birthday.contactId === contact.id)
    .map((birthday) => ({ ...birthday, occurrence: getBirthdayOccurrence(birthday.date) }))
    .sort((left, right) => left.occurrence.daysUntil - right.occurrence.daysUntil)[0] ?? null;
  const now = Date.now();
  const upcomingEvents = socialEvents
    .filter((event) => eventIncludesContact(event, contact.id))
    .filter((event) => new Date(event.date).getTime() >= now)
    .sort((left, right) => left.date.localeCompare(right.date));

  return {
    contact,
    birthdayReminder,
    lastInteraction,
    recentInteractions,
    conversationNotes: sortByNewest(conversationNotes.filter((note) => note.contactId === contact.id)).slice(0, 10),
    giftIdeas: sortByNewest(giftIdeas.filter((gift) => gift.contactId === contact.id)),
    reconnectItem,
    reconnectHistory: sortByOccurredAt(reconnectItems.filter((item) => item.contactId === contact.id)).slice(0, 10),
    upcomingEvents,
    familyItems: sortByNewest(familyItems.filter((item) => item.responsibleContactId === contact.id)),
    eldercareCheckins: sortByOccurredAt(eldercareCheckins.filter((checkin) => checkin.elderContactId === contact.id)).slice(0, 10),
  };
}

async function buildDashboard(ctx: PluginContext) {
  const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
  const upcomingBirthdays = await getUpcomingBirthdayEntries(ctx, DEFAULT_BIRTHDAY_LOOKAHEAD_DAYS);
  const reconnectItems = await getCollection<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS);
  const openReconnectItems = reconnectItems.filter((item) => !item.completed);
  const socialEvents = await getCollection<SocialEvent>(ctx, DATA_KEYS.SOCIAL_CALENDAR);
  const now = Date.now();
  const upcomingEvents = socialEvents
    .filter((event) => new Date(event.date).getTime() >= now)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 10);

  return {
    counts: {
      contacts: contacts.length,
      upcomingBirthdays: upcomingBirthdays.length,
      openReconnectItems: openReconnectItems.length,
      upcomingEvents: upcomingEvents.length,
    },
    contactsByTier: RELATIONSHIP_TIERS.reduce<Record<string, number>>((acc, tier) => {
      acc[tier] = contacts.filter((contact) => contact.relationship === tier).length;
      return acc;
    }, {}),
    upcomingBirthdays,
    openReconnectItems: sortByOccurredAt(openReconnectItems).slice(0, 10),
    upcomingEvents,
  };
}

function buildActionHandlers(ctx: PluginContext): Record<string, ActionHandler> {
  return {
    [ACTION_KEYS.ADD_CONTACT]: async (params) => {
      const contact: Contact = {
        id: generateId(),
        name: asRequiredString(params.name, "name"),
        relationship: params.relationship ? assertOneOf(params.relationship, RELATIONSHIP_TIERS, "relationship") : "acquaintance",
        category: params.category ? assertOneOf(params.category, RELATIONSHIP_CATEGORIES, "category") : "personal",
        birthday: asOptionalMonthDay(params.birthday, "birthday"),
        anniversary: asOptionalIsoLikeDate(params.anniversary, "anniversary"),
        phone: asOptionalString(params.phone),
        email: asOptionalString(params.email),
        handle: asOptionalString(params.handle),
        notes: asOptionalString(params.notes) ?? "",
        tags: asOptionalStringArray(params.tags) ?? [],
        reminderFrequencyDays: asOptionalPositiveInteger(params.reminderFrequencyDays, "reminderFrequencyDays"),
        createdAt: nowIso(),
      };
      const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
      contacts.push(contact);
      await setCollection(ctx, DATA_KEYS.CONTACTS, contacts);
      const reminder = await syncBirthdayReminderForContact(ctx, contact);
      return { success: true, contact, birthdayReminder: reminder };
    },

    [ACTION_KEYS.GET_CONTACTS]: async (params) => {
      const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
      const tier = asOptionalString(params.tier);
      const category = asOptionalString(params.category);
      const tag = asOptionalString(params.tag);
      const query = asOptionalString(params.query)?.toLowerCase();
      return {
        contacts: sortByNewest(contacts.filter((contact) => {
          if (tier && contact.relationship !== tier) return false;
          if (category && contact.category !== category) return false;
          if (tag && !contact.tags.includes(tag)) return false;
          if (query) {
            const haystack = [contact.name, contact.notes, ...contact.tags].join(" ").toLowerCase();
            if (!haystack.includes(query)) return false;
          }
          return true;
        })),
      };
    },

    [ACTION_KEYS.UPDATE_CONTACT]: async (params) => {
      const contactId = asRequiredString(params.contactId, "contactId");
      const updated = await updateRecord<Contact>(ctx, DATA_KEYS.CONTACTS, contactId, (contact) => ({
        ...contact,
        name: asOptionalString(params.name) ?? contact.name,
        relationship: params.relationship ? assertOneOf(params.relationship, RELATIONSHIP_TIERS, "relationship") : contact.relationship,
        category: params.category ? assertOneOf(params.category, RELATIONSHIP_CATEGORIES, "category") : contact.category,
        birthday: params.birthday === "" ? undefined : (asOptionalMonthDay(params.birthday, "birthday") ?? contact.birthday),
        anniversary: params.anniversary === "" ? undefined : (asOptionalIsoLikeDate(params.anniversary, "anniversary") ?? contact.anniversary),
        phone: params.phone === "" ? undefined : asOptionalString(params.phone) ?? contact.phone,
        email: params.email === "" ? undefined : asOptionalString(params.email) ?? contact.email,
        handle: params.handle === "" ? undefined : asOptionalString(params.handle) ?? contact.handle,
        notes: asOptionalString(params.notes) ?? contact.notes,
        tags: asOptionalStringArray(params.tags) ?? contact.tags,
        reminderFrequencyDays: asOptionalPositiveInteger(params.reminderFrequencyDays, "reminderFrequencyDays") ?? contact.reminderFrequencyDays,
        lastContactedAt: params.lastContactedAt === "" ? undefined : (asOptionalIsoLikeDate(params.lastContactedAt, "lastContactedAt") ?? contact.lastContactedAt),
        updatedAt: nowIso(),
      }), "Contact");
      const reminder = await syncBirthdayReminderForContact(ctx, updated);
      await reconcileFreshContact(ctx, contactId);
      return { success: true, contact: updated, birthdayReminder: reminder };
    },

    [ACTION_KEYS.LOG_INTERACTION]: async (params) => {
      const contactId = asRequiredString(params.contactId, "contactId");
      await requireContact(ctx, contactId);
      const interaction: Interaction = {
        id: generateId(),
        contactId,
        type: params.type ? assertOneOf(params.type, INTERACTION_TYPES, "type") : "other",
        occurredAt: asOptionalIsoLikeDate(params.occurredAt, "occurredAt") ?? nowIso(),
        durationMinutes: asOptionalNonNegativeNumber(params.durationMinutes, "durationMinutes"),
        summary: asOptionalString(params.summary) ?? "",
        topics: asOptionalStringArray(params.topics) ?? [],
        giftGiven: asOptionalString(params.giftGiven),
        location: asOptionalString(params.location),
        notes: asOptionalString(params.notes) ?? "",
        followUpItems: asOptionalStringArray(params.followUpItems) ?? [],
        quality: params.quality ? assertOneOf(params.quality, SCORE_VALUES, "quality") : 3,
        createdAt: nowIso(),
      };
      const interactions = await getCollection<Interaction>(ctx, DATA_KEYS.INTERACTIONS);
      interactions.push(interaction);
      await setCollection(ctx, DATA_KEYS.INTERACTIONS, interactions);
      await syncContactPointers(ctx, contactId);
      await reconcileFreshContact(ctx, contactId);
      return { success: true, interaction };
    },

    [ACTION_KEYS.GET_INTERACTIONS]: async (params) => {
      const interactions = await getCollection<Interaction>(ctx, DATA_KEYS.INTERACTIONS);
      const contactId = asOptionalString(params.contactId);
      return { interactions: sortByOccurredAt(contactId ? interactions.filter((interaction) => interaction.contactId === contactId) : interactions) };
    },

    [ACTION_KEYS.UPDATE_INTERACTION]: async (params) => {
      const interactionId = asRequiredString(params.interactionId, "interactionId");
      const updated = await updateRecord<Interaction>(ctx, DATA_KEYS.INTERACTIONS, interactionId, (interaction) => ({
        ...interaction,
        type: params.type ? assertOneOf(params.type, INTERACTION_TYPES, "type") : interaction.type,
        occurredAt: asOptionalIsoLikeDate(params.occurredAt, "occurredAt") ?? interaction.occurredAt,
        durationMinutes: params.durationMinutes == null
          ? interaction.durationMinutes
          : asOptionalNonNegativeNumber(params.durationMinutes, "durationMinutes"),
        summary: asOptionalString(params.summary) ?? interaction.summary,
        topics: asOptionalStringArray(params.topics) ?? interaction.topics,
        giftGiven: params.giftGiven === "" ? undefined : asOptionalString(params.giftGiven) ?? interaction.giftGiven,
        location: params.location === "" ? undefined : asOptionalString(params.location) ?? interaction.location,
        notes: asOptionalString(params.notes) ?? interaction.notes,
        followUpItems: asOptionalStringArray(params.followUpItems) ?? interaction.followUpItems,
        quality: params.quality ? assertOneOf(params.quality, SCORE_VALUES, "quality") : interaction.quality,
        updatedAt: nowIso(),
      }), "Interaction");
      await syncContactPointers(ctx, updated.contactId);
      await reconcileFreshContact(ctx, updated.contactId);
      return { success: true, interaction: updated };
    },

    [ACTION_KEYS.UPSERT_BIRTHDAY_REMINDER]: async (params) => {
      const contactId = asRequiredString(params.contactId, "contactId");
      const date = asRequiredString(params.date, "date");
      await requireContact(ctx, contactId);
      const normalizedDate = ensureMonthDay(date, "date");
      const reminders = await getCollection<BirthdayReminder>(ctx, DATA_KEYS.BIRTHDAYS);
      const existingIndex = reminders.findIndex((reminder) => reminder.contactId === contactId);
      const timestamp = nowIso();
      const existing = existingIndex === -1 ? undefined : reminders[existingIndex]!;
      const reminder: BirthdayReminder = existing
        ? {
            ...existing,
            date: normalizedDate,
            reminderDaysBefore: params.reminderDaysBefore != null ? normalizeReminderDays(params.reminderDaysBefore) : existing.reminderDaysBefore,
            sent: asOptionalBoolean(params.sent) ?? existing.sent,
            lastSentYear: asOptionalPositiveInteger(params.lastSentYear, "lastSentYear") ?? existing.lastSentYear,
            deliveryLog: existing.date === normalizedDate ? existing.deliveryLog ?? [] : [],
            updatedAt: timestamp,
          }
        : {
            id: generateId(),
            contactId,
            date: normalizedDate,
            reminderDaysBefore: normalizeReminderDays(params.reminderDaysBefore),
            sent: asOptionalBoolean(params.sent) ?? false,
            lastSentYear: asOptionalPositiveInteger(params.lastSentYear, "lastSentYear"),
            deliveryLog: [],
            createdAt: timestamp,
          };
      const next = [...reminders];
      if (existingIndex === -1) next.push(reminder);
      else next[existingIndex] = reminder;
      await setCollection(ctx, DATA_KEYS.BIRTHDAYS, next);
      const contact = await syncContactBirthdayFromReminder(ctx, contactId, normalizedDate);
      return { success: true, reminder, contact };
    },

    [ACTION_KEYS.GET_BIRTHDAYS]: async (params) => {
      const withinDays = asOptionalNonNegativeInteger(params.days, "days") ?? DEFAULT_BIRTHDAY_LOOKAHEAD_DAYS;
      return { birthdays: await getUpcomingBirthdayEntries(ctx, withinDays) };
    },

    [ACTION_KEYS.ADD_GIFT_IDEA]: async (params) => {
      const contactId = asRequiredString(params.contactId, "contactId");
      await requireContact(ctx, contactId);
      const status = params.status ? assertOneOf(params.status, GIFT_STATUSES, "status") : "idea";
      const timestamp = nowIso();
      const giftIdea: GiftIdea = {
        id: generateId(),
        contactId,
        description: asRequiredString(params.description, "description"),
        occasion: asOptionalString(params.occasion) ?? "",
        priceRange: asOptionalString(params.priceRange),
        links: asOptionalStringArray(params.links),
        status,
        purchasedAt: status === "purchased" ? timestamp : undefined,
        givenAt: status === "given" ? timestamp : undefined,
        notes: asOptionalString(params.notes) ?? "",
        createdAt: timestamp,
      };
      const ideas = await getCollection<GiftIdea>(ctx, DATA_KEYS.GIFT_IDEAS);
      ideas.push(giftIdea);
      await setCollection(ctx, DATA_KEYS.GIFT_IDEAS, ideas);
      return { success: true, giftIdea };
    },

    [ACTION_KEYS.GET_GIFT_IDEAS]: async (params) => {
      const ideas = await getCollection<GiftIdea>(ctx, DATA_KEYS.GIFT_IDEAS);
      const contactId = asOptionalString(params.contactId);
      const status = asOptionalString(params.status);
      return { ideas: sortByNewest(ideas.filter((idea) => (!contactId || idea.contactId === contactId) && (!status || idea.status === status))) };
    },

    [ACTION_KEYS.UPDATE_GIFT_IDEA]: async (params) => {
      const giftIdeaId = asRequiredString(params.giftIdeaId, "giftIdeaId");
      const updated = await updateRecord<GiftIdea>(ctx, DATA_KEYS.GIFT_IDEAS, giftIdeaId, (idea) => {
        const status = params.status ? assertOneOf(params.status, GIFT_STATUSES, "status") : idea.status;
        return {
          ...idea,
          description: asOptionalString(params.description) ?? idea.description,
          occasion: asOptionalString(params.occasion) ?? idea.occasion,
          priceRange: params.priceRange === "" ? undefined : asOptionalString(params.priceRange) ?? idea.priceRange,
          links: asOptionalStringArray(params.links) ?? idea.links,
          notes: asOptionalString(params.notes) ?? idea.notes,
          status,
          purchasedAt: status === "purchased" ? idea.purchasedAt ?? nowIso() : idea.purchasedAt,
          givenAt: status === "given" ? idea.givenAt ?? nowIso() : idea.givenAt,
          updatedAt: nowIso(),
        };
      }, "Gift idea");
      return { success: true, giftIdea: updated };
    },

    [ACTION_KEYS.PLAN_SOCIAL_EVENT]: async (params) => {
      const attendees = asOptionalStringArray(params.attendees) ?? [];
      for (const attendeeId of attendees) await requireContact(ctx, attendeeId);
      const organizerId = asOptionalString(params.organizerId);
      if (organizerId) await requireContact(ctx, organizerId);
      const event: SocialEvent = {
        id: generateId(),
        title: asRequiredString(params.title, "title"),
        date: asRequiredString(params.date, "date"),
        time: asOptionalString(params.time),
        location: asOptionalString(params.location),
        attendees,
        organizerId,
        description: asOptionalString(params.description) ?? "",
        reminderDaysBefore: normalizeReminderDays(params.reminderDaysBefore),
        notes: asOptionalString(params.notes) ?? "",
        createdAt: nowIso(),
      };
      event.date = ensureIsoLikeDate(event.date, "date");
      const events = await getCollection<SocialEvent>(ctx, DATA_KEYS.SOCIAL_CALENDAR);
      events.push(event);
      await setCollection(ctx, DATA_KEYS.SOCIAL_CALENDAR, events);
      return { success: true, event };
    },

    [ACTION_KEYS.GET_SOCIAL_CALENDAR]: async (params) => {
      const events = await getCollection<SocialEvent>(ctx, DATA_KEYS.SOCIAL_CALENDAR);
      const days = asOptionalNonNegativeInteger(params.days, "days");
      const attendeeId = asOptionalString(params.attendeeId);
      const includePast = asOptionalBoolean(params.includePast) ?? false;
      const cutoff = typeof days === "number" ? Date.now() + days * 86400000 : undefined;
      return {
        events: events
          .filter((event) => (!attendeeId || eventIncludesContact(event, attendeeId)))
          .filter((event) => includePast || new Date(event.date).getTime() >= Date.now())
          .filter((event) => (typeof cutoff === "number" ? new Date(event.date).getTime() <= cutoff : true))
          .sort((left, right) => left.date.localeCompare(right.date)),
      };
    },

    [ACTION_KEYS.UPDATE_SOCIAL_EVENT]: async (params) => {
      const eventId = asRequiredString(params.eventId, "eventId");
      const attendees = asOptionalStringArray(params.attendees);
      if (attendees) for (const attendeeId of attendees) await requireContact(ctx, attendeeId);
      const organizerId = asOptionalString(params.organizerId);
      if (organizerId) await requireContact(ctx, organizerId);
      const updated = await updateRecord<SocialEvent>(ctx, DATA_KEYS.SOCIAL_CALENDAR, eventId, (event) => ({
        ...event,
        title: asOptionalString(params.title) ?? event.title,
        date: params.date ? ensureIsoLikeDate(asRequiredString(params.date, "date"), "date") : event.date,
        time: params.time === "" ? undefined : asOptionalString(params.time) ?? event.time,
        location: params.location === "" ? undefined : asOptionalString(params.location) ?? event.location,
        attendees: attendees ?? event.attendees,
        organizerId: params.organizerId === "" ? undefined : organizerId ?? event.organizerId,
        description: asOptionalString(params.description) ?? event.description,
        reminderDaysBefore: params.reminderDaysBefore != null ? normalizeReminderDays(params.reminderDaysBefore) : event.reminderDaysBefore,
        notes: asOptionalString(params.notes) ?? event.notes,
        updatedAt: nowIso(),
      }), "Social event");
      return { success: true, event: updated };
    },

    [ACTION_KEYS.ADD_CONVERSATION_NOTE]: async (params) => {
      const contactId = asRequiredString(params.contactId, "contactId");
      await requireContact(ctx, contactId);
      const interactionId = asOptionalString(params.interactionId);
      if (interactionId) {
        const interactions = await getCollection<Interaction>(ctx, DATA_KEYS.INTERACTIONS);
        requireRecord(interactions, interactionId, "Interaction");
      }
      const note: ConversationNote = {
        id: generateId(),
        contactId,
        interactionId,
        content: asRequiredString(params.content, "content"),
        createdAt: nowIso(),
        tags: asOptionalStringArray(params.tags) ?? [],
      };
      const notes = await getCollection<ConversationNote>(ctx, DATA_KEYS.CONVERSATION_NOTES);
      notes.push(note);
      await setCollection(ctx, DATA_KEYS.CONVERSATION_NOTES, notes);
      return { success: true, note };
    },

    [ACTION_KEYS.GET_CONVERSATION_NOTES]: async (params) => {
      const notes = await getCollection<ConversationNote>(ctx, DATA_KEYS.CONVERSATION_NOTES);
      const contactId = asOptionalString(params.contactId);
      const tag = asOptionalString(params.tag);
      return {
        notes: sortByNewest(notes.filter((note) => (!contactId || note.contactId === contactId) && (!tag || note.tags.includes(tag)))),
      };
    },

    [ACTION_KEYS.UPDATE_CONVERSATION_NOTE]: async (params) => {
      const noteId = asRequiredString(params.noteId, "noteId");
      const interactionId = asOptionalString(params.interactionId);
      if (interactionId) {
        const interactions = await getCollection<Interaction>(ctx, DATA_KEYS.INTERACTIONS);
        requireRecord(interactions, interactionId, "Interaction");
      }
      const updated = await updateRecord<ConversationNote>(ctx, DATA_KEYS.CONVERSATION_NOTES, noteId, (note) => ({
        ...note,
        interactionId: params.interactionId === "" ? undefined : interactionId ?? note.interactionId,
        content: asOptionalString(params.content) ?? note.content,
        tags: asOptionalStringArray(params.tags) ?? note.tags,
        updatedAt: nowIso(),
      }), "Conversation note");
      return { success: true, note: updated };
    },

    [ACTION_KEYS.ADD_TO_RECONNECT_LIST]: async (params) => {
      const contactId = asRequiredString(params.contactId, "contactId");
      const contact = await requireContact(ctx, contactId);
      const item: ReconnectItem = {
        id: generateId(),
        contactId,
        reason: asRequiredString(params.reason, "reason"),
        suggestedOutreach: asOptionalString(params.suggestedOutreach) ?? buildSuggestedOutreach(contact),
        addedAt: nowIso(),
        attempts: 0,
        completed: false,
        source: "manual",
      };
      const items = await getCollection<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS);
      items.push(item);
      await setCollection(ctx, DATA_KEYS.RECONNECT_LISTS, items);
      return { success: true, item };
    },

    [ACTION_KEYS.GET_RECONNECT_LIST]: async (params) => {
      const items = await getCollection<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS);
      const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
      const includeCompleted = asOptionalBoolean(params.includeCompleted) ?? false;
      const contactId = asOptionalString(params.contactId);
      return {
        items: sortByOccurredAt(items)
          .filter((item) => (includeCompleted || !item.completed) && (!contactId || item.contactId === contactId))
          .map((item) => ({ ...item, contact: contacts.find((contact) => contact.id === item.contactId) })),
      };
    },

    [ACTION_KEYS.UPDATE_RECONNECT_ITEM]: async (params) => {
      const reconnectItemId = asRequiredString(params.reconnectItemId, "reconnectItemId");
      const updated = await updateRecord<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS, reconnectItemId, (item) => {
        const incrementAttempts = asOptionalBoolean(params.incrementAttempts) ?? false;
        const completed = asOptionalBoolean(params.completed);
        return {
          ...item,
          reason: asOptionalString(params.reason) ?? item.reason,
          suggestedOutreach: asOptionalString(params.suggestedOutreach) ?? item.suggestedOutreach,
          attempts: incrementAttempts ? item.attempts + 1 : item.attempts,
          lastAttemptedAt: asOptionalIsoLikeDate(params.lastAttemptedAt, "lastAttemptedAt") ?? (incrementAttempts ? nowIso() : item.lastAttemptedAt),
          completed: completed ?? item.completed,
          completedAt: completed === true ? (asOptionalIsoLikeDate(params.completedAt, "completedAt") ?? nowIso()) : completed === false ? undefined : item.completedAt,
          updatedAt: nowIso(),
        };
      }, "Reconnect item");
      return { success: true, item: updated };
    },

    [ACTION_KEYS.REFRESH_RECONNECT_LIST]: async (params) => {
      const defaultLagDays = asOptionalPositiveInteger(params.defaultLagDays, "defaultLagDays") ?? DEFAULT_RECONNECT_LAG_DAYS;
      const result = await refreshReconnectList(ctx, defaultLagDays);
      return { success: true, created: result.created, resolved: result.resolved, staleContacts: result.staleContacts, items: result.items };
    },

    [ACTION_KEYS.LOG_FAMILY_LOGISTICS]: async (params) => {
      const responsibleContactId = asOptionalString(params.responsibleContactId);
      if (responsibleContactId) await requireContact(ctx, responsibleContactId);
      const completed = asOptionalBoolean(params.completed) ?? false;
      const item: FamilyLogisticsItem = {
        id: generateId(),
        title: asRequiredString(params.title, "title"),
        type: params.type ? assertOneOf(params.type, FAMILY_LOGISTICS_TYPES, "type") : "other",
        responsibleContactId,
        dueDate: asOptionalIsoLikeDate(params.dueDate, "dueDate"),
        completed,
        completedAt: completed ? nowIso() : undefined,
        notes: asOptionalString(params.notes) ?? "",
        createdAt: nowIso(),
      };
      const items = await getCollection<FamilyLogisticsItem>(ctx, DATA_KEYS.FAMILY_LOGISTICS);
      items.push(item);
      await setCollection(ctx, DATA_KEYS.FAMILY_LOGISTICS, items);
      return { success: true, item };
    },

    [ACTION_KEYS.GET_FAMILY_LOGISTICS]: async (params) => {
      const items = await getCollection<FamilyLogisticsItem>(ctx, DATA_KEYS.FAMILY_LOGISTICS);
      const status = asOptionalString(params.status);
      const responsibleContactId = asOptionalString(params.responsibleContactId);
      return {
        items: sortByNewest(items.filter((item) => {
          if (status === "completed" && !item.completed) return false;
          if (status === "pending" && item.completed) return false;
          if (responsibleContactId && item.responsibleContactId !== responsibleContactId) return false;
          return true;
        })),
      };
    },

    [ACTION_KEYS.UPDATE_FAMILY_LOGISTICS]: async (params) => {
      const familyLogisticsId = asRequiredString(params.familyLogisticsId, "familyLogisticsId");
      const responsibleContactId = asOptionalString(params.responsibleContactId);
      if (responsibleContactId) await requireContact(ctx, responsibleContactId);
      const completed = asOptionalBoolean(params.completed);
      const updated = await updateRecord<FamilyLogisticsItem>(ctx, DATA_KEYS.FAMILY_LOGISTICS, familyLogisticsId, (item) => ({
        ...item,
        title: asOptionalString(params.title) ?? item.title,
        type: params.type ? assertOneOf(params.type, FAMILY_LOGISTICS_TYPES, "type") : item.type,
        responsibleContactId: params.responsibleContactId === "" ? undefined : responsibleContactId ?? item.responsibleContactId,
        dueDate: params.dueDate === "" ? undefined : (asOptionalIsoLikeDate(params.dueDate, "dueDate") ?? item.dueDate),
        completed: completed ?? item.completed,
        completedAt: completed === true ? (asOptionalIsoLikeDate(params.completedAt, "completedAt") ?? nowIso()) : completed === false ? undefined : item.completedAt,
        notes: asOptionalString(params.notes) ?? item.notes,
        updatedAt: nowIso(),
      }), "Family logistics item");
      return { success: true, item: updated };
    },

    [ACTION_KEYS.ADD_ELDERCARE_CHECKIN]: async (params) => {
      const elderContactId = asRequiredString(params.elderContactId, "elderContactId");
      await requireContact(ctx, elderContactId);
      const checkin: EldercareCheckin = {
        id: generateId(),
        elderContactId,
        checkinAt: asOptionalIsoLikeDate(params.checkinAt, "checkinAt") ?? nowIso(),
        wellbeingScore: params.wellbeingScore ? assertOneOf(params.wellbeingScore, SCORE_VALUES, "wellbeingScore") : 3,
        mobilityScore: params.mobilityScore ? assertOneOf(params.mobilityScore, SCORE_VALUES, "mobilityScore") : undefined,
        moodScore: params.moodScore ? assertOneOf(params.moodScore, SCORE_VALUES, "moodScore") : undefined,
        concerns: asOptionalStringArray(params.concerns) ?? [],
        followUpActions: asOptionalStringArray(params.followUpActions) ?? [],
        notes: asOptionalString(params.notes) ?? "",
        createdAt: nowIso(),
      };
      const checkins = await getCollection<EldercareCheckin>(ctx, DATA_KEYS.ELDERCARE_CHECKINS);
      checkins.push(checkin);
      await setCollection(ctx, DATA_KEYS.ELDERCARE_CHECKINS, checkins);
      return { success: true, checkin };
    },

    [ACTION_KEYS.GET_ELDERCARE_CHECKINS]: async (params) => {
      const checkins = await getCollection<EldercareCheckin>(ctx, DATA_KEYS.ELDERCARE_CHECKINS);
      const contactId = asOptionalString(params.contactId);
      return { checkins: sortByOccurredAt(contactId ? checkins.filter((checkin) => checkin.elderContactId === contactId) : checkins) };
    },

    [ACTION_KEYS.UPDATE_ELDERCARE_CHECKIN]: async (params) => {
      const eldercareCheckinId = asRequiredString(params.eldercareCheckinId, "eldercareCheckinId");
      const updated = await updateRecord<EldercareCheckin>(ctx, DATA_KEYS.ELDERCARE_CHECKINS, eldercareCheckinId, (checkin) => ({
        ...checkin,
        checkinAt: asOptionalIsoLikeDate(params.checkinAt, "checkinAt") ?? checkin.checkinAt,
        wellbeingScore: params.wellbeingScore ? assertOneOf(params.wellbeingScore, SCORE_VALUES, "wellbeingScore") : checkin.wellbeingScore,
        mobilityScore: params.mobilityScore ? assertOneOf(params.mobilityScore, SCORE_VALUES, "mobilityScore") : checkin.mobilityScore,
        moodScore: params.moodScore ? assertOneOf(params.moodScore, SCORE_VALUES, "moodScore") : checkin.moodScore,
        concerns: asOptionalStringArray(params.concerns) ?? checkin.concerns,
        followUpActions: asOptionalStringArray(params.followUpActions) ?? checkin.followUpActions,
        notes: asOptionalString(params.notes) ?? checkin.notes,
        updatedAt: nowIso(),
      }), "Eldercare check-in");
      return { success: true, checkin: updated };
    },

    [ACTION_KEYS.GET_RELATIONSHIP_SUMMARY]: async (params) => {
      const contactId = asRequiredString(params.contactId, "contactId");
      const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
      const contact = requireRecord(contacts, contactId, "Contact");
      return buildRelationshipSummary({
        contact,
        interactions: await getCollection<Interaction>(ctx, DATA_KEYS.INTERACTIONS),
        birthdays: await getCollection<BirthdayReminder>(ctx, DATA_KEYS.BIRTHDAYS),
        giftIdeas: await getCollection<GiftIdea>(ctx, DATA_KEYS.GIFT_IDEAS),
        socialEvents: await getCollection<SocialEvent>(ctx, DATA_KEYS.SOCIAL_CALENDAR),
        conversationNotes: await getCollection<ConversationNote>(ctx, DATA_KEYS.CONVERSATION_NOTES),
        reconnectItems: await getCollection<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS),
        familyItems: await getCollection<FamilyLogisticsItem>(ctx, DATA_KEYS.FAMILY_LOGISTICS),
        eldercareCheckins: await getCollection<EldercareCheckin>(ctx, DATA_KEYS.ELDERCARE_CHECKINS),
      });
    },
  };
}

function buildDataHandlers(ctx: PluginContext, actionHandlers: Record<string, ActionHandler>): Record<string, DataHandler> {
  return {
    [DATA_VIEW_KEYS.DASHBOARD]: async () => buildDashboard(ctx),
    [DATA_VIEW_KEYS.CONTACT_SUMMARY]: async (params) => actionHandlers[ACTION_KEYS.GET_RELATIONSHIP_SUMMARY](params),
    [DATA_VIEW_KEYS.UPCOMING_BIRTHDAYS]: async (params) => actionHandlers[ACTION_KEYS.GET_BIRTHDAYS](params),
    [DATA_VIEW_KEYS.RECONNECT_OVERVIEW]: async () => {
      const contacts = await getCollection<Contact>(ctx, DATA_KEYS.CONTACTS);
      const items = await getCollection<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS);
      const snapshot = buildReconnectSnapshot(contacts, items);
      return {
        staleContacts: snapshot.staleContacts,
        created: [],
        resolved: [],
        openItems: snapshot.items
          .filter((item) => !item.completed)
          .map((item) => ({ ...item, contact: contacts.find((contact) => contact.id === item.contactId) })),
      };
    },
  };
}

export const plugin = definePlugin({
  async setup(ctx) {
    const actionHandlers = buildActionHandlers(ctx);
    for (const [actionKey, handler] of Object.entries(actionHandlers)) {
      ctx.actions.register(actionKey, handler);
    }

    const dataHandlers = buildDataHandlers(ctx, actionHandlers);
    for (const [dataKey, handler] of Object.entries(dataHandlers)) {
      ctx.data.register(dataKey, handler);
    }

    for (const tool of ACTION_TOOL_DEFINITIONS) {
      const handler = actionHandlers[tool.actionKey];
      ctx.tools.register(tool.name, {
        displayName: tool.displayName,
        description: tool.description,
        parametersSchema: tool.parametersSchema,
      }, async (params) => ({
        content: `${tool.displayName} completed`,
        data: await handler((params ?? {}) as ActionParams),
      }));
    }

    ctx.jobs.register(JOB_KEYS.BIRTHDAY_REMINDERS, async () => {
      await runBirthdayReminderDigest(ctx);
    });

    ctx.jobs.register(JOB_KEYS.RECONNECT_REVIEW, async () => {
      await runReconnectDigest(ctx, true);
    });

    ctx.events.on("agent.run.finished", async () => {
      await runReconnectDigest(ctx, false);
    });

    healthReporter = async () => {
      const dashboard = await buildDashboard(ctx);
      return {
        status: "ok",
        message: `${dashboard.counts.contacts} contacts, ${dashboard.counts.openReconnectItems} open reconnect items, ${dashboard.counts.upcomingBirthdays} upcoming birthdays`,
        details: dashboard.counts,
      };
    };

    ctx.logger.info("Relationships plugin initialized", {
      actionCount: Object.keys(actionHandlers).length,
      toolCount: ACTION_TOOL_DEFINITIONS.length,
      dataViewCount: Object.keys(dataHandlers).length,
    });
  },

  async onHealth() {
    if (!healthReporter) {
      return { status: "degraded", message: "Worker not initialized yet" };
    }
    return healthReporter();
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
