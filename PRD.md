# PRD: paperclip-relationships

## 1. Product Intent

Personal CRM plugin for Paperclip — maintains and nurtures personal relationships through birthday reminders, follow-up prompts, gift planning, social calendar management, conversation memory, reconnect tracking, family logistics, and eldercare check-ins.

## 2. Problem

Relationships require maintenance: people forget birthdays, lose track of who they haven't spoken to in months, forget what they discussed with someone last, miss gift opportunities, and have no system for eldercare check-ins.

## 3. Target Users

Single user (Ola) managing personal relationships.

## 4. Features (MVP Scope)

### Now
- **Contacts** — store name, tier (close/friend/acquaintance/family/colleague/professional), category, birthday, anniversary, contact info, tags, notes
- **Interaction logging** — log calls, video calls, in-person meetings, messages, gifts with quality rating, topics, follow-up items
- **Birthday reminders** — track birthdays, send reminders N days before
- **Gift ideas** — store gift ideas per contact with occasion, price range, status (idea/purchased/given)
- **Social calendar** — plan events with attendees, date/time, location, reminders
- **Conversation notes** — per-contact notes summarizing what was discussed, tagged
- **Reconnect list** — people who need reaching out to, with suggested outreach approach and attempt tracking
- **Family logistics** — track transport, scheduling, healthcare, financial items for family coordination
- **Eldercare check-ins** — log wellbeing, mobility, mood scores and concerns for elderly family members
- **Relationship summary** — get a full picture of any contact: last interaction, recent history, reconnect status

### Next
- Auto-reminder on interaction lag (if contact hasn't been reached in N days)
- Gift reminder before occasions (anniversary, birthday)
- Integration with calendar for social events
- Integration with contacts (phone, messaging apps)

## 5. Architecture

```
Relationships Plugin
├── State: instance-scoped
├── Actions: per feature (add, get, log, update, summary)
├── Events: subscribes to agent.run.finished for ambient reconnect nudges
└── Integrations (future): contacts API, messaging apps, calendar
```

## 6. State Schema

| Namespace | Content |
|---|---|
| `relationships.contacts` | Contact[] |
| `relationships.interactions` | Interaction[] |
| `relationships.birthdays` | BirthdayReminder[] |
| `relationships.giftIdeas` | GiftIdea[] |
| `relationships.socialCalendar` | SocialEvent[] |
| `relationships.conversationNotes` | ConversationNote[] |
| `relationships.reconnectLists` | ReconnectItem[] |
| `relationships.familyLogistics` | FamilyLogisticsItem[] |
| `relationships.eldercareCheckins` | EldercareCheckin[] |

## 7. Integrations (Future)

| Source | Data |
|---|---|
| Phone contacts | sync contacts |
| Signal/Messages | auto-log interactions |
| Google Calendar | social event sync |
| Postal service / gift APIs | gift tracking |

## 8. Non-Goals

- Professional CRM features (deals, pipeline)
- Social media scraping
- Sharing contact data externally

## 9. Definition of Done

- Plugin builds, typechecks, and passes tests
- Manifest declares all actions
- Each action reads/writes correct state namespace
- PRD is current and reflects what was built
