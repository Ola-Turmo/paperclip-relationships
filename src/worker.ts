import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { ACTION_KEYS, DATA_KEYS } from "./constants.js";
import type { Contact, Interaction, BirthdayReminder, GiftIdea, SocialEvent, ConversationNote, ReconnectItem, FamilyLogisticsItem, EldercareCheckin } from "./types.js";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const INSTANCE = { scopeKind: "instance" as const };

async function getArr<T>(ctx: any, key: string): Promise<T[]> {
  const val = await ctx.state.get({ ...INSTANCE, stateKey: key });
  return (Array.isArray(val) ? val : []) as T[];
}

async function setArr<T>(ctx: any, key: string, val: T[]): Promise<void> {
  await ctx.state.set({ ...INSTANCE, stateKey: key }, val);
}

const plugin = definePlugin({
  async setup(ctx) {

    // ── Contacts ─────────────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_CONTACT, async (params: any) => {
      const contact: Contact = { id: generateId(), name: params.name, relationship: params.relationship ?? "acquaintance", category: params.category ?? "personal", birthday: params.birthday, anniversary: params.anniversary, phone: params.phone, email: params.email, handle: params.handle, notes: params.notes ?? "", tags: params.tags ?? [], reminderFrequencyDays: params.reminderFrequencyDays, createdAt: new Date().toISOString() };
      const contacts = await getArr<Contact>(ctx, DATA_KEYS.CONTACTS);
      contacts.push(contact);
      await setArr(ctx, DATA_KEYS.CONTACTS, contacts);
      return { success: true, id: contact.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_CONTACTS, async (params: any) => {
      const contacts = await getArr<Contact>(ctx, DATA_KEYS.CONTACTS);
      if (params.tier) return { contacts: contacts.filter(c => c.relationship === params.tier) };
      if (params.category) return { contacts: contacts.filter(c => c.category === params.category) };
      if (params.tag) return { contacts: contacts.filter(c => c.tags.includes(params.tag)) };
      return { contacts };
    });

    // ── Interactions ─────────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.LOG_INTERACTION, async (params: any) => {
      const interaction: Interaction = { id: generateId(), contactId: params.contactId, type: params.type ?? "other", occurredAt: params.occurredAt ?? new Date().toISOString(), durationMinutes: params.durationMinutes, summary: params.summary ?? "", topics: params.topics ?? [], giftGiven: params.giftGiven, location: params.location, notes: params.notes ?? "", followUpItems: params.followUpItems ?? [], quality: params.quality ?? 3 };
      const interactions = await getArr<Interaction>(ctx, DATA_KEYS.INTERACTIONS);
      interactions.push(interaction);
      await setArr(ctx, DATA_KEYS.INTERACTIONS, interactions);
      // Update lastContactedAt on contact
      const contacts = await getArr<Contact>(ctx, DATA_KEYS.CONTACTS);
      const idx = contacts.findIndex(c => c.id === params.contactId);
      if (idx !== -1) { contacts[idx].lastContactedAt = interaction.occurredAt; contacts[idx].lastInteractionId = interaction.id; await setArr(ctx, DATA_KEYS.CONTACTS, contacts); }
      return { success: true, id: interaction.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_INTERACTIONS, async (params: any) => {
      const interactions = await getArr<Interaction>(ctx, DATA_KEYS.INTERACTIONS);
      return { interactions: params.contactId ? interactions.filter(i => i.contactId === params.contactId) : interactions };
    });

    // ── Birthdays ────────────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_BIRTHDAY, async (params: any) => {
      const reminder: BirthdayReminder = { id: generateId(), contactId: params.contactId, date: params.date, reminderDaysBefore: params.reminderDaysBefore ?? [7, 1], sent: false };
      const reminders = await getArr<BirthdayReminder>(ctx, DATA_KEYS.BIRTHDAYS);
      reminders.push(reminder);
      await setArr(ctx, DATA_KEYS.BIRTHDAYS, reminders);
      return { success: true, id: reminder.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_BIRTHDAYS, async (params: any) => {
      const reminders = await getArr<BirthdayReminder>(ctx, DATA_KEYS.BIRTHDAYS);
      const withinDays = params.days ?? 30;
      const today = new Date();
      const upcoming = reminders.filter(r => {
        const [month, day] = r.date.split("-").map(Number);
        const upcomingDate = new Date(today.getFullYear(), month - 1, day);
        if (upcomingDate < today) upcomingDate.setFullYear(today.getFullYear() + 1);
        const diff = (upcomingDate.getTime() - today.getTime()) / 86400000;
        return diff <= withinDays;
      });
      const contacts = await getArr<Contact>(ctx, DATA_KEYS.CONTACTS);
      return { birthdays: upcoming.map(r => ({ ...r, contact: contacts.find(c => c.id === r.contactId) })) };
    });

    // ── Gift ideas ───────────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_GIFT_IDEA, async (params: any) => {
      const idea: GiftIdea = { id: generateId(), contactId: params.contactId, description: params.description, occasion: params.occasion ?? "", priceRange: params.priceRange, links: params.links, status: "idea", notes: params.notes ?? "" };
      const ideas = await getArr<GiftIdea>(ctx, DATA_KEYS.GIFT_IDEAS);
      ideas.push(idea);
      await setArr(ctx, DATA_KEYS.GIFT_IDEAS, ideas);
      return { success: true, id: idea.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_GIFT_IDEAS, async (params: any) => {
      const ideas = await getArr<GiftIdea>(ctx, DATA_KEYS.GIFT_IDEAS);
      return { ideas: params.contactId ? ideas.filter(i => i.contactId === params.contactId) : ideas };
    });

    // ── Social calendar ──────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.PLAN_SOCIAL_EVENT, async (params: any) => {
      const event: SocialEvent = { id: generateId(), title: params.title, date: params.date, time: params.time, location: params.location, attendees: params.attendees ?? [], organizerId: params.organizerId, description: params.description ?? "", reminderDaysBefore: params.reminderDaysBefore ?? [7, 1], notes: params.notes ?? "" };
      const events = await getArr<SocialEvent>(ctx, DATA_KEYS.SOCIAL_CALENDAR);
      events.push(event);
      await setArr(ctx, DATA_KEYS.SOCIAL_CALENDAR, events);
      return { success: true, id: event.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_SOCIAL_CALENDAR, async (params: any) => {
      const events = await getArr<SocialEvent>(ctx, DATA_KEYS.SOCIAL_CALENDAR);
      const cutoff = params.days ? new Date(Date.now() + params.days * 86400000).toISOString() : undefined;
      return { events: cutoff ? events.filter(e => e.date <= cutoff) : events };
    });

    // ── Conversation notes ────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_CONVERSATION_NOTE, async (params: any) => {
      const note: ConversationNote = { id: generateId(), contactId: params.contactId, interactionId: params.interactionId, content: params.content, createdAt: new Date().toISOString(), tags: params.tags ?? [] };
      const notes = await getArr<ConversationNote>(ctx, DATA_KEYS.CONVERSATION_NOTES);
      notes.push(note);
      await setArr(ctx, DATA_KEYS.CONVERSATION_NOTES, notes);
      return { success: true, id: note.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_CONVERSATION_NOTES, async (params: any) => {
      const notes = await getArr<ConversationNote>(ctx, DATA_KEYS.CONVERSATION_NOTES);
      return { notes: params.contactId ? notes.filter(n => n.contactId === params.contactId) : notes };
    });

    // ── Reconnect lists ──────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_TO_RECONNECT_LIST, async (params: any) => {
      const item: ReconnectItem = { id: generateId(), contactId: params.contactId, reason: params.reason, suggestedOutreach: params.suggestedOutreach ?? "", addedAt: new Date().toISOString(), attempts: 0, completed: false };
      const items = await getArr<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS);
      items.push(item);
      await setArr(ctx, DATA_KEYS.RECONNECT_LISTS, items);
      return { success: true, id: item.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_RECONNECT_LIST, async (_params: any) => {
      const items = await getArr<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS);
      const contacts = await getArr<Contact>(ctx, DATA_KEYS.CONTACTS);
      return { items: items.filter(i => !i.completed).map(i => ({ ...i, contact: contacts.find(c => c.id === i.contactId) })) };
    });

    // ── Family logistics ────────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.LOG_FAMILY_LOGISTICS, async (params: any) => {
      const item: FamilyLogisticsItem = { id: generateId(), title: params.title, type: params.type ?? "other", responsibleContactId: params.responsibleContactId, dueDate: params.dueDate, completed: false, notes: params.notes ?? "" };
      const items = await getArr<FamilyLogisticsItem>(ctx, DATA_KEYS.FAMILY_LOGISTICS);
      items.push(item);
      await setArr(ctx, DATA_KEYS.FAMILY_LOGISTICS, items);
      return { success: true, id: item.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_FAMILY_LOGISTICS, async (params: any) => {
      const items = await getArr<FamilyLogisticsItem>(ctx, DATA_KEYS.FAMILY_LOGISTICS);
      if (params.status === "completed") return { items: items.filter(i => i.completed) };
      if (params.status === "pending") return { items: items.filter(i => !i.completed) };
      return { items };
    });

    // ── Eldercare check-ins ──────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.ADD_ELDERCARE_CHECKIN, async (params: any) => {
      const checkin: EldercareCheckin = { id: generateId(), elderContactId: params.elderContactId, checkinAt: new Date().toISOString(), wellbeingScore: params.wellbeingScore ?? 3, mobilityScore: params.mobilityScore, moodScore: params.moodScore, concerns: params.concerns ?? [], followUpActions: params.followUpActions ?? [], notes: params.notes ?? "" };
      const checkins = await getArr<EldercareCheckin>(ctx, DATA_KEYS.ELDERCARE_CHECKINS);
      checkins.push(checkin);
      await setArr(ctx, DATA_KEYS.ELDERCARE_CHECKINS, checkins);
      return { success: true, id: checkin.id };
    });

    ctx.actions.register(ACTION_KEYS.GET_ELDERCARE_CHECKINS, async (params: any) => {
      const checkins = await getArr<EldercareCheckin>(ctx, DATA_KEYS.ELDERCARE_CHECKINS);
      return { checkins: params.contactId ? checkins.filter(c => c.elderContactId === params.contactId) : checkins };
    });

    // ── Relationship summary ─────────────────────────────────────
    ctx.actions.register(ACTION_KEYS.GET_RELATIONSHIP_SUMMARY, async (params: any) => {
      const contacts = await getArr<Contact>(ctx, DATA_KEYS.CONTACTS);
      const interactions = await getArr<Interaction>(ctx, DATA_KEYS.INTERACTIONS);
      const reconnectItems = await getArr<ReconnectItem>(ctx, DATA_KEYS.RECONNECT_LISTS);
      const contact = contacts.find(c => c.id === params.contactId);
      if (!contact) return { error: "Contact not found" };
      const contactInteractions = interactions.filter(i => i.contactId === params.contactId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      const lastInteraction = contactInteractions[0];
      const reconnectItem = reconnectItems.find(r => r.contactId === params.contactId && !r.completed);
      return { contact, lastInteraction, recentInteractions: contactInteractions.slice(0, 5), reconnectItem: reconnectItem ?? null };
    });

    ctx.logger.info("Relationships plugin initialized");
  },
});

runWorker(plugin, import.meta.url);
