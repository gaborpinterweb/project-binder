/**
 * Public email/password signup + owner-scoped attachment files.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.passwordAuth = {
      enabled: true,
      identityFields: ["email"],
    };
    // Anyone can create an account (self-host + cloud).
    users.createRule = "";
    users.listRule = 'id = @request.auth.id';
    users.viewRule = 'id = @request.auth.id';
    users.updateRule = 'id = @request.auth.id';
    users.deleteRule = 'id = @request.auth.id';
    app.save(users);

    const ownerRule =
      '@request.auth.id != "" && user = @request.auth.id';

    const attachments = new Collection({
      type: "base",
      name: "attachments",
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
          name: "key",
          type: "text",
          required: true,
          min: 1,
          max: 512,
        },
        {
          name: "file",
          type: "file",
          required: true,
          maxSelect: 1,
          maxSize: 104857600,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_attachments_user_key` ON `attachments` (`user`, `key`)",
      ],
    });
    app.save(attachments);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("attachments"));
    } catch {
      /* gone */
    }
  }
);
