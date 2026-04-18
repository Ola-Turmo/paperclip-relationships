export type RelationshipTier = "close" | "friend" | "acquaintance" | "family" | "colleague" | "professional";
export type RelationshipCategory = "personal" | "professional" | "family" | "health" | "community";

export interface Contact {
  id: string;
  name: string;
  relationship: RelationshipTier;
  category: RelationshipCategory;
  birthday?: string; // MM-DD
  anniversary?: string;
  phone?: string;
  email?: string;
  handle?: string; // social media handle
  notes: string;
  tags: string[];
  lastContactedAt?: string;
  lastInteractionId?: string;
  reminderFrequencyDays?: number;
  createdAt: string;
}

export interface Interaction {
  id: string;
  contactId: string;
  type: "call" | "video" | "in_person" | "message" | "gift" | "event" | "other";
  occurredAt: string;
  durationMinutes?: number;
  summary: string;
  topics: string[];
  giftGiven?: string;
  location?: string;
  notes: string;
  followUpItems: string[];
  quality: 1 | 2 | 3 | 4 | 5; // 1=surface, 5=meaningful
}

export interface BirthdayReminder {
  id: string;
  contactId: string;
  date: string; // MM-DD
  reminderDaysBefore: number[];
  sent: boolean;
  lastSentYear?: number;
}

export interface GiftIdea {
  id: string;
  contactId: string;
  description: string;
  occasion: string;
  priceRange?: string;
  links?: string[];
  status: "idea" | "purchased" | "given";
  purchasedAt?: string;
  givenAt?: string;
  notes: string;
}

export interface SocialEvent {
  id: string;
  title: string;
  date: string; // ISO date
  time?: string;
  location?: string;
  attendees: string[]; // contact ids
  organizerId?: string;
  description: string;
  reminderDaysBefore: number[];
  notes: string;
}

export interface ConversationNote {
  id: string;
  contactId: string;
  interactionId?: string;
  content: string;
  createdAt: string;
  tags: string[];
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
}

export interface FamilyLogisticsItem {
  id: string;
  title: string;
  type: "transport" | "schedule" | "healthcare" | "financial" | "other";
  responsibleContactId?: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
  notes: string;
}

export interface EldercareCheckin {
  id: string;
  elderContactId: string;
  checkinAt: string;
  wellbeingScore: 1 | 2 | 3 | 4 | 5;
  mobilityScore?: 1 | 2 | 3 | 4 | 5;
  moodScore?: 1 | 2 | 3 | 4 | 5;
  concerns: string[];
  followUpActions: string[];
  notes: string;
}
