export const PLUGIN_ID = "relationships";

export const RELATIONSHIP_TIERS = ["close", "friend", "acquaintance", "family", "colleague", "professional"] as const;
export const RELATIONSHIP_CATEGORIES = ["personal", "professional", "family", "health", "community"] as const;
export const INTERACTION_TYPES = ["call", "video", "in_person", "message", "gift", "event", "other"] as const;
export const GIFT_STATUSES = ["idea", "purchased", "given"] as const;
export const FAMILY_LOGISTICS_TYPES = ["transport", "schedule", "healthcare", "financial", "other"] as const;
export const SCORE_VALUES = [1, 2, 3, 4, 5] as const;

export const DEFAULT_RECONNECT_LAG_DAYS = 45;
export const DEFAULT_BIRTHDAY_LOOKAHEAD_DAYS = 30;
export const DEFAULT_BIRTHDAY_REMINDER_DAYS = [14, 7, 1] as const;

export const DATA_KEYS = {
  CONTACTS: "relationships.contacts",
  INTERACTIONS: "relationships.interactions",
  BIRTHDAYS: "relationships.birthdays",
  GIFT_IDEAS: "relationships.giftIdeas",
  SOCIAL_CALENDAR: "relationships.socialCalendar",
  CONVERSATION_NOTES: "relationships.conversationNotes",
  RECONNECT_LISTS: "relationships.reconnectLists",
  FAMILY_LOGISTICS: "relationships.familyLogistics",
  ELDERCARE_CHECKINS: "relationships.eldercareCheckins",
  RUNTIME: "relationships.runtime",
} as const;

export const DATA_VIEW_KEYS = {
  DASHBOARD: "relationships.dashboard",
  CONTACT_SUMMARY: "relationships.contact-summary",
  UPCOMING_BIRTHDAYS: "relationships.upcoming-birthdays",
  RECONNECT_OVERVIEW: "relationships.reconnect-overview",
} as const;

export const ACTION_KEYS = {
  ADD_CONTACT: "relationships.add-contact",
  GET_CONTACTS: "relationships.get-contacts",
  UPDATE_CONTACT: "relationships.update-contact",
  LOG_INTERACTION: "relationships.log-interaction",
  GET_INTERACTIONS: "relationships.get-interactions",
  UPDATE_INTERACTION: "relationships.update-interaction",
  UPSERT_BIRTHDAY_REMINDER: "relationships.upsert-birthday-reminder",
  GET_BIRTHDAYS: "relationships.get-birthdays",
  ADD_GIFT_IDEA: "relationships.add-gift-idea",
  GET_GIFT_IDEAS: "relationships.get-gift-ideas",
  UPDATE_GIFT_IDEA: "relationships.update-gift-idea",
  PLAN_SOCIAL_EVENT: "relationships.plan-social-event",
  GET_SOCIAL_CALENDAR: "relationships.get-social-calendar",
  UPDATE_SOCIAL_EVENT: "relationships.update-social-event",
  ADD_CONVERSATION_NOTE: "relationships.add-conversation-note",
  GET_CONVERSATION_NOTES: "relationships.get-conversation-notes",
  UPDATE_CONVERSATION_NOTE: "relationships.update-conversation-note",
  ADD_TO_RECONNECT_LIST: "relationships.add-to-reconnect-list",
  GET_RECONNECT_LIST: "relationships.get-reconnect-list",
  UPDATE_RECONNECT_ITEM: "relationships.update-reconnect-item",
  REFRESH_RECONNECT_LIST: "relationships.refresh-reconnect-list",
  LOG_FAMILY_LOGISTICS: "relationships.log-family-logistics",
  GET_FAMILY_LOGISTICS: "relationships.get-family-logistics",
  UPDATE_FAMILY_LOGISTICS: "relationships.update-family-logistics",
  ADD_ELDERCARE_CHECKIN: "relationships.add-eldercare-checkin",
  GET_ELDERCARE_CHECKINS: "relationships.get-eldercare-checkins",
  UPDATE_ELDERCARE_CHECKIN: "relationships.update-eldercare-checkin",
  GET_RELATIONSHIP_SUMMARY: "relationships.get-relationship-summary",
} as const;

export const JOB_KEYS = {
  BIRTHDAY_REMINDERS: "birthday-reminders",
  RECONNECT_REVIEW: "reconnect-review",
} as const;
