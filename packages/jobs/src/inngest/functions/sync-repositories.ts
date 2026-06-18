import { inngest } from "../client";

export const syncRepositories = inngest.createFunction(
  { id: "sync-repositories", triggers: [{ event: "repositories/sync" }] },
  async () => {
    console.log("HELLO FRIEND!");
  },
);
