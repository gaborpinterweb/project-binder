/**
 * Owner-scoped workspace + archive files (thin PocketBase; no hooks).
 * See docs/pocketbase-master-plan.md.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    // Ensure email/password auth stays on for app signup/login (next spike).
    users.passwordAuth = {
      enabled: true,
      identityFields: ["email"],
    };
    app.save(users);

    const ownerRule =
      '@request.auth.id != "" && user = @request.auth.id';

    const userData = new Collection({
      type: "base",
      name: "user_data",
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: ownerRule,
      updateRule: ownerRule,
      deleteRule: ownerRule,
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        {
          name: "userWorkspace",
          type: "file",
          maxSelect: 1,
          maxSize: 52428800,
          mimeTypes: ["application/json", "text/plain"],
        },
        {
          name: "userArchive",
          type: "file",
          maxSelect: 1,
          maxSize: 52428800,
          mimeTypes: ["application/json", "text/plain"],
        },
      ],
      indexes: ["CREATE UNIQUE INDEX `idx_user_data_user` ON `user_data` (`user`)"],
    });

    app.save(userData);
  },
  (app) => {
    try {
      const userData = app.findCollectionByNameOrId("user_data");
      app.delete(userData);
    } catch {
      /* already gone */
    }
  }
);
