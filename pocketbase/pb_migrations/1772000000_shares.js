/**
 * Public link shares: stable token (= record id), enabled flag, JSON payload.
 * share_files: copied attachment bytes; guest access via getOne (ids in payload map).
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const ownerRule = '@request.auth.id != "" && user = @request.auth.id';
    const publicOrOwner =
      'enabled = true || (@request.auth.id != "" && user = @request.auth.id)';

    const shares = new Collection({
      type: "base",
      name: "shares",
      listRule: ownerRule,
      viewRule: publicOrOwner,
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
          // Must not be required: PocketBase treats false as blank on required bools.
          name: "enabled",
          type: "bool",
          required: false,
        },
        {
          name: "scope",
          type: "text",
          required: true,
          min: 1,
          max: 32,
        },
        {
          name: "projectId",
          type: "text",
          required: true,
          min: 1,
          max: 64,
        },
        {
          name: "tabId",
          type: "text",
          required: false,
          max: 64,
        },
        {
          name: "payload",
          type: "file",
          maxSelect: 1,
          maxSize: 52428800,
          mimeTypes: ["application/json", "text/plain"],
        },
      ],
      indexes: [
        "CREATE INDEX `idx_shares_user` ON `shares` (`user`)",
        "CREATE INDEX `idx_shares_project` ON `shares` (`projectId`)",
      ],
    });
    app.save(shares);

    const shareFiles = new Collection({
      type: "base",
      name: "share_files",
      listRule: ownerRule,
      viewRule: publicOrOwner,
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
          name: "share",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: shares.id,
          cascadeDelete: true,
        },
        {
          // Must not be required: PocketBase treats false as blank on required bools.
          name: "enabled",
          type: "bool",
          required: false,
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
        "CREATE UNIQUE INDEX `idx_share_files_share_key` ON `share_files` (`share`, `key`)",
      ],
    });
    app.save(shareFiles);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("share_files"));
    } catch {
      /* gone */
    }
    try {
      app.delete(app.findCollectionByNameOrId("shares"));
    } catch {
      /* gone */
    }
  }
);
