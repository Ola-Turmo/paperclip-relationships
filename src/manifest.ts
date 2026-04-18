import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { ACTION_TOOL_DEFINITIONS } from "./definitions.js";
import { JOB_KEYS } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: "relationships",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Relationships",
  description: "Personal CRM — birthdays, follow-ups, gift ideas, social calendar, conversation memory, reconnect lists, family logistics, and eldercare check-ins.",
  author: "turmo.dev",
  categories: ["automation"],
  capabilities: [
    "companies.read",
    "events.subscribe",
    "jobs.schedule",
    "activity.log.write",
    "plugin.state.read",
    "plugin.state.write",
    "agent.tools.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  jobs: [
    {
      jobKey: JOB_KEYS.BIRTHDAY_REMINDERS,
      displayName: "Birthday reminders",
      description: "Scans upcoming birthdays and writes reminder activity entries.",
      schedule: "0 9 * * *",
    },
    {
      jobKey: JOB_KEYS.RECONNECT_REVIEW,
      displayName: "Reconnect review",
      description: "Refreshes the reconnect list and writes a daily stale-relationship digest.",
      schedule: "30 9 * * *",
    },
  ],
  tools: ACTION_TOOL_DEFINITIONS.map(({ actionKey: _actionKey, ...tool }) => tool),
};

export default manifest;
