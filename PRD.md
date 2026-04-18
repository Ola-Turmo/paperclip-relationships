# PRD: paperclip-relationships

## 1. Product Intent

Personal CRM plugin for Paperclip — maintains and nurtures personal relationships through birthday reminders, follow-up prompts, gift planning, social calendar management, conversation memory, reconnect tracking, family logistics, and eldercare check-ins.

## 2. Problem

Relationships require maintenance: people forget birthdays, lose track of who they haven't spoken to in months, forget what they discussed with someone last, miss gift opportunities, and have no system for eldercare check-ins.

## 3. Target Users

Single user (Ola) managing personal relationships.

## 4. Features (MVP Scope)

### Now
- **Contacts** — store name, tier (close/friend/acquaintance/family/colleague/professional), category, birthday, anniversary, contact info, tags, notes, and reconnect cadence
- **Interaction logging** — log calls, video calls, in-person meetings, messages, gifts with quality rating, topics, follow-up items, and automatically reconcile stale reconnect prompts after fresh contact
- **Birthday reminders** — track birthdays, keep contact birthdays and reminder state in sync, surface reminders N days before, and avoid duplicate reminder delivery within the same yearly reminder window
- **Gift ideas** — store gift ideas per contact with occasion, price range, status (idea/purchased/given)
- **Social calendar** — plan events with attendees, date/time, location, reminders, and upcoming-event filtering
- **Conversation notes** — per-contact notes summarizing what was discussed, tagged
- **Reconnect list** — people who need reaching out to, with suggested outreach approach, attempt tracking, automatic stale-contact generation, and automatic resolution when the relationship becomes fresh again
- **Family logistics** — track transport, scheduling, healthcare, financial items for family coordination
- **Eldercare check-ins** — log wellbeing, mobility, mood scores and concerns for elderly family members
- **Relationship summary** — get a full picture of any contact: last interaction, recent history, reconnect status/history, gifts, notes, upcoming events, and care/logistics context
- **Read models for UI** — expose dashboard, contact summary, upcoming birthday, and reconnect overview data through `ctx.data` as read-only projections

### Next
- Auto-reminder on interaction lag (if contact hasn't been reached in N days)
- Gift reminder before occasions (anniversary, birthday)
- Integration with calendar for social events
- Integration with contacts (phone, messaging apps)

## 5. Architecture

```
Relationships Plugin
├── State: instance-scoped namespaces per PRD collection
├── Actions: add/get/update/log/summary flows per feature area
├── Data views: dashboard + summary read models for future UI surfaces
├── Tools: manifest-declared agent tools mirroring the action surface
├── Jobs: scheduled birthday reminder + reconnect review digests
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
| `relationships.runtime` | runtime metadata (for example last reconnect digest day) |

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
- UI bundle implementation in this pass

## 9. Definition of Done

- Plugin builds, typechecks, and passes tests
- Manifest declares the scheduled jobs and agent tools that expose the action surface
- Each feature reads/writes the correct state namespace
- Contact birthdays and reminder state stay synchronized
- Birthday reminder jobs avoid duplicate deliveries for the same yearly reminder window
- Reconnect items are generated for stale contacts and auto-resolved after fresh interactions
- `ctx.data` exposes dashboard and summary read models for future UI surfaces without mutating persisted state
- PRD is current and reflects what was built
