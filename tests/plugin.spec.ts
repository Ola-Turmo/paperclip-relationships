import { beforeEach, describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { ACTION_KEYS, DATA_KEYS, DATA_VIEW_KEYS, JOB_KEYS } from "../src/constants.js";

const TEST_COMPANY_ID = "company-1";

async function createHarness() {
  const harness = createTestHarness({ manifest });
  harness.seed({
    companies: [
      {
        id: TEST_COMPANY_ID,
        name: "Personal",
        description: null,
        status: "active",
        pauseReason: null,
        pausedAt: null,
        issuePrefix: "REL",
        issueCounter: 1,
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
        requireBoardApprovalForNewAgents: false,
        feedbackDataSharingEnabled: false,
        feedbackDataSharingConsentAt: null,
        feedbackDataSharingConsentByUserId: null,
        feedbackDataSharingTermsVersion: null,
        brandColor: null,
        logoAssetId: null,
        logoUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

describe("Relationships plugin", () => {
  let harness: Awaited<ReturnType<typeof createHarness>>;

  beforeEach(async () => {
    harness = await createHarness();
  });

  it("declares tools and data views, and reports real health diagnostics", async () => {
    expect(manifest.jobs?.map((job) => job.jobKey)).toEqual([JOB_KEYS.BIRTHDAY_REMINDERS, JOB_KEYS.RECONNECT_REVIEW]);
    expect(manifest.tools?.length).toBeGreaterThan(10);

    await harness.executeTool("add-contact", { name: "Ada Lovelace", relationship: "close", birthday: "12-10" });

    const dashboard = await harness.getData<{ counts: { contacts: number } }>(DATA_VIEW_KEYS.DASHBOARD, {});
    expect(dashboard.counts.contacts).toBe(1);

    const health = await plugin.definition.onHealth?.();
    expect(health?.status).toBe("ok");
    expect(health?.details).toMatchObject({ contacts: 1, openReconnectItems: 0 });
  });

  it("keeps birthdays synced and exposes matching action/data summaries", async () => {
    const { contact } = await harness.performAction<{ contact: { id: string } }>(ACTION_KEYS.ADD_CONTACT, {
      name: "Linus",
      relationship: "friend",
      category: "personal",
      birthday: "04-18",
      tags: ["systems", "systems"],
      reminderFrequencyDays: 10,
    });

    const birthdaysState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.BIRTHDAYS }) as Array<{ contactId: string; date: string }>;
    expect(birthdaysState).toHaveLength(1);
    expect(birthdaysState[0]).toMatchObject({ contactId: contact.id, date: "04-18" });

    await harness.performAction(ACTION_KEYS.LOG_INTERACTION, {
      contactId: contact.id,
      type: "call",
      occurredAt: new Date().toISOString(),
      summary: "Caught up about family plans",
      followUpItems: ["Send article", "Send article"],
    });

    await harness.performAction(ACTION_KEYS.ADD_GIFT_IDEA, {
      contactId: contact.id,
      description: "Rare tea sampler",
      occasion: "birthday",
    });

    await harness.performAction(ACTION_KEYS.ADD_CONVERSATION_NOTE, {
      contactId: contact.id,
      content: "Mentioned a planned hiking trip.",
      tags: ["travel", "travel"],
    });

    const actionSummary = await harness.performAction<{
      contact: { id: string; birthday?: string; tags: string[] };
      recentInteractions: Array<{ contactId: string; followUpItems: string[] }>;
      conversationNotes: Array<{ contactId: string; tags: string[] }>;
      giftIdeas: Array<{ contactId: string }>;
    }>(ACTION_KEYS.GET_RELATIONSHIP_SUMMARY, { contactId: contact.id });

    const dataSummary = await harness.getData<typeof actionSummary>(DATA_VIEW_KEYS.CONTACT_SUMMARY, { contactId: contact.id });

    expect(actionSummary.contact.id).toBe(contact.id);
    expect(actionSummary.contact.birthday).toBe("04-18");
    expect(actionSummary.contact.tags).toEqual(["systems"]);
    expect(actionSummary.recentInteractions[0]?.followUpItems).toEqual(["Send article"]);
    expect(actionSummary.conversationNotes[0]?.tags).toEqual(["travel"]);
    expect(actionSummary.giftIdeas[0]?.contactId).toBe(contact.id);
    expect(dataSummary).toEqual(actionSummary);
  });

  it("dedupes birthday reminder delivery across repeated job runs", async () => {
    const { contact } = await harness.performAction<{ contact: { id: string } }>(ACTION_KEYS.ADD_CONTACT, {
      name: "Grandma",
      relationship: "family",
      birthday: new Date().toISOString().slice(5, 10),
    });

    await harness.performAction(ACTION_KEYS.UPSERT_BIRTHDAY_REMINDER, {
      contactId: contact.id,
      date: new Date().toISOString().slice(5, 10),
      reminderDaysBefore: [0],
    });

    await harness.runJob(JOB_KEYS.BIRTHDAY_REMINDERS);
    await harness.runJob(JOB_KEYS.BIRTHDAY_REMINDERS);

    const birthdayActivities = harness.activity.filter((entry) => entry.message.includes("Birthday reminder for Grandma"));
    expect(birthdayActivities).toHaveLength(1);

    const birthdayState = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.BIRTHDAYS }) as Array<{ contactId: string; deliveryLog: string[]; sent: boolean }>;
    const grandmaReminder = birthdayState.find((item) => item.contactId === contact.id);
    expect(grandmaReminder?.sent).toBe(true);
    expect(grandmaReminder?.deliveryLog).toHaveLength(1);
  });

  it("auto-resolves stale automatic reconnect items after a fresh interaction", async () => {
    const { contact } = await harness.performAction<{ contact: { id: string } }>(ACTION_KEYS.ADD_CONTACT, {
      name: "Old Friend",
      relationship: "friend",
      reminderFrequencyDays: 1,
    });

    await harness.performAction(ACTION_KEYS.UPDATE_CONTACT, {
      contactId: contact.id,
      lastContactedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    });

    await harness.performAction(ACTION_KEYS.REFRESH_RECONNECT_LIST, {});

    const before = await harness.performAction<{ items: Array<{ id: string; completed: boolean; source: string }> }>(ACTION_KEYS.GET_RECONNECT_LIST, {
      contactId: contact.id,
      includeCompleted: true,
    });
    expect(before.items.some((item) => item.source === "automatic" && item.completed === false)).toBe(true);

    await harness.performAction(ACTION_KEYS.LOG_INTERACTION, {
      contactId: contact.id,
      type: "message",
      occurredAt: new Date().toISOString(),
      summary: "Reconnected",
    });

    const after = await harness.performAction<{ items: Array<{ completed: boolean; source: string; completedAt?: string }> }>(ACTION_KEYS.GET_RECONNECT_LIST, {
      contactId: contact.id,
      includeCompleted: true,
    });
    expect(after.items.some((item) => item.source === "automatic" && item.completed === true && Boolean(item.completedAt))).toBe(true);
  });

  it("keeps reconnect overview read-only while still projecting stale contacts", async () => {
    const { contact } = await harness.performAction<{ contact: { id: string } }>(ACTION_KEYS.ADD_CONTACT, {
      name: "Needs Ping",
      reminderFrequencyDays: 1,
    });

    await harness.performAction(ACTION_KEYS.UPDATE_CONTACT, {
      contactId: contact.id,
      lastContactedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    });

    expect(harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.RECONNECT_LISTS }) ?? []).toEqual([]);

    const overview = await harness.getData<{
      staleContacts: Array<{ id: string }>;
      created: unknown[];
      resolved: unknown[];
      openItems: Array<{ contactId: string; source: string; completed: boolean }>;
    }>(DATA_VIEW_KEYS.RECONNECT_OVERVIEW, {});

    expect(overview.staleContacts.map((entry) => entry.id)).toContain(contact.id);
    expect(overview.openItems.some((item) => item.contactId === contact.id && item.source === "automatic" && item.completed === false)).toBe(true);
    expect(overview.created).toEqual([]);
    expect(overview.resolved).toEqual([]);
    expect(harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.RECONNECT_LISTS }) ?? []).toEqual([]);

    await harness.performAction(ACTION_KEYS.REFRESH_RECONNECT_LIST, {});
    const persisted = harness.getState({ scopeKind: "instance", stateKey: DATA_KEYS.RECONNECT_LISTS }) as Array<{ contactId: string }>;
    expect(persisted.some((item) => item.contactId === contact.id)).toBe(true);
  });

  it("rejects invalid date inputs with clear validation", async () => {
    await expect(
      harness.performAction(ACTION_KEYS.ADD_CONTACT, {
        name: "Broken",
        birthday: "13-40",
      }),
    ).rejects.toThrow("birthday");

    await expect(
      harness.performAction(ACTION_KEYS.PLAN_SOCIAL_EVENT, {
        title: "Impossible",
        date: "not-a-date",
      }),
    ).rejects.toThrow("date");

    const { contact } = await harness.performAction<{ contact: { id: string } }>(ACTION_KEYS.ADD_CONTACT, {
      name: "Needs Validation",
    });

    await expect(
      harness.performAction(ACTION_KEYS.UPDATE_CONTACT, {
        contactId: contact.id,
        lastContactedAt: "still-not-a-date",
      }),
    ).rejects.toThrow("lastContactedAt");
  });

  it("rejects invalid numeric and array inputs instead of silently coercing them", async () => {
    const { contact } = await harness.performAction<{ contact: { id: string } }>(ACTION_KEYS.ADD_CONTACT, {
      name: "Strict Validation",
    });

    await expect(
      harness.performAction(ACTION_KEYS.LOG_INTERACTION, {
        contactId: contact.id,
        durationMinutes: -5,
      }),
    ).rejects.toThrow("durationMinutes");

    await expect(
      harness.performAction(ACTION_KEYS.ADD_CONVERSATION_NOTE, {
        contactId: contact.id,
        content: "Hello",
        tags: ["valid", 42],
      }),
    ).rejects.toThrow("array of strings");

    await expect(
      harness.performAction(ACTION_KEYS.GET_BIRTHDAYS, {
        days: -1,
      }),
    ).rejects.toThrow("days");
  });
});
