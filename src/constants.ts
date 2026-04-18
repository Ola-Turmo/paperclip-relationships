export const PLUGIN_ID = "relationships";

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
} as const;

export const ACTION_KEYS = {
  ADD_CONTACT: "relationships.add-contact",
  GET_CONTACTS: "relationships.get-contacts",
  LOG_INTERACTION: "relationships.log-interaction",
  GET_INTERACTIONS: "relationships.get-interactions",
  ADD_BIRTHDAY: "relationships.add-birthday",
  GET_BIRTHDAYS: "relationships.get-birthdays",
  ADD_GIFT_IDEA: "relationships.add-gift-idea",
  GET_GIFT_IDEAS: "relationships.get-gift-ideas",
  PLAN_SOCIAL_EVENT: "relationships.plan-social-event",
  GET_SOCIAL_CALENDAR: "relationships.get-social-calendar",
  ADD_CONVERSATION_NOTE: "relationships.add-conversation-note",
  GET_CONVERSATION_NOTES: "relationships.get-conversation-notes",
  ADD_TO_RECONNECT_LIST: "relationships.add-to-reconnect-list",
  GET_RECONNECT_LIST: "relationships.get-reconnect-list",
  LOG_FAMILY_LOGISTICS: "relationships.log-family-logistics",
  GET_FAMILY_LOGISTICS: "relationships.get-family-logistics",
  ADD_ELDERCARE_CHECKIN: "relationships.add-eldercare-checkin",
  GET_ELDERCARE_CHECKINS: "relationships.get-eldercare-checkins",
  GET_RELATIONSHIP_SUMMARY: "relationships.get-relationship-summary",
} as const;
