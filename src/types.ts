import type {
  FAMILY_LOGISTICS_TYPES,
  GIFT_STATUSES,
  INTERACTION_TYPES,
  RELATIONSHIP_CATEGORIES,
  RELATIONSHIP_TIERS,
  SCORE_VALUES,
} from "./constants.js";

export type RelationshipTier = (typeof RELATIONSHIP_TIERS)[number];
export type RelationshipCategory = (typeof RELATIONSHIP_CATEGORIES)[number];
export type InteractionType = (typeof INTERACTION_TYPES)[number];
export type GiftStatus = (typeof GIFT_STATUSES)[number];
export type FamilyLogisticsType = (typeof FAMILY_LOGISTICS_TYPES)[number];
export type ScoreValue = (typeof SCORE_VALUES)[number];
export type ReconnectSource = "manual" | "automatic";

export interface Contact {
  id: string;
  name: string;
  relationship: RelationshipTier;
  category: RelationshipCategory;
  birthday?: string;
  anniversary?: string;
  phone?: string;
  email?: string;
  handle?: string;
  notes: string;
  tags: string[];
  lastContactedAt?: string;
  lastInteractionId?: string;
  reminderFrequencyDays?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Interaction {
  id: string;
  contactId: string;
  type: InteractionType;
  occurredAt: string;
  durationMinutes?: number;
  summary: string;
  topics: string[];
  giftGiven?: string;
  location?: string;
  notes: string;
  followUpItems: string[];
  quality: ScoreValue;
  createdAt: string;
  updatedAt?: string;
}

export interface BirthdayReminder {
  id: string;
  contactId: string;
  date: string;
  reminderDaysBefore: number[];
  sent: boolean;
  lastSentYear?: number;
  deliveryLog: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface GiftIdea {
  id: string;
  contactId: string;
  description: string;
  occasion: string;
  priceRange?: string;
  links?: string[];
  status: GiftStatus;
  purchasedAt?: string;
  givenAt?: string;
  notes: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SocialEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  attendees: string[];
  organizerId?: string;
  description: string;
  reminderDaysBefore: number[];
  notes: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ConversationNote {
  id: string;
  contactId: string;
  interactionId?: string;
  content: string;
  createdAt: string;
  tags: string[];
  updatedAt?: string;
}

export interface ReconnectItem {
  id: string;
  contactId: string;
  reason: string;
  suggestedOutreach: string;
  addedAt: string;
  lastAttemptedAt?: string;
  attempts: number;
  completed: boolean;
  completedAt?: string;
  source: ReconnectSource;
  updatedAt?: string;
}

export interface FamilyLogisticsItem {
  id: string;
  title: string;
  type: FamilyLogisticsType;
  responsibleContactId?: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
  notes: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EldercareCheckin {
  id: string;
  elderContactId: string;
  checkinAt: string;
  wellbeingScore: ScoreValue;
  mobilityScore?: ScoreValue;
  moodScore?: ScoreValue;
  concerns: string[];
  followUpActions: string[];
  notes: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RuntimeState {
  lastReconnectNudgeDate?: string;
}
