import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "relationships",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Relationships",
  description: "Personal CRM — birthday reminders, follow-ups, gift planning, social calendar, conversation notes, reconnect lists, family logistics, eldercare",
  author: "turmo.dev",
  categories: ["automation"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
};

export default manifest;
