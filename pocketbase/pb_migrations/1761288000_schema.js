/**
 * Product schema (squashed): users auth rules + templates, user_data, attachments,
 * shares, share_files. Email SMTP/templates with real APP_URL are applied at runtime
 * by configure-pb-mail; templates below use {APP_URL} until then.
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
    users.listRule = "id = @request.auth.id";
    users.viewRule = "id = @request.auth.id";
    users.updateRule = "id = @request.auth.id";
    users.deleteRule = "id = @request.auth.id";
    users.verificationTemplate = {
      subject: "Verify your Project Binder email",
      body: `<p>Hello,</p>
<p>Please verify your email for Project Binder by clicking the link below:</p>
<p><a href="{APP_URL}/sign-in?verify={TOKEN}">Verify email</a></p>
<p>If you did not create an account, you can ignore this email.</p>`,
    };
    users.resetPasswordTemplate = {
      subject: "Reset your Project Binder password",
      body: `<p>Hello,</p>
<p>Reset your password by clicking the link below:</p>
<p><a href="{APP_URL}/reset-password?reset={TOKEN}">Reset password</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
    };
    users.confirmEmailChangeTemplate = {
      subject: "Confirm your new Project Binder email",
      body: `<p>Hello,</p>
<p>Confirm your new email for Project Binder by clicking the link below:</p>
<p><a href="{APP_URL}/sign-in?emailChange={TOKEN}">Confirm email change</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
    };
    app.save(users);

    const ownerRule = '@request.auth.id != "" && user = @request.auth.id';
    const publicOrOwner =
      'enabled = true || (@request.auth.id != "" && user = @request.auth.id)';

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
    for (const name of ["share_files", "shares", "attachments", "user_data"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch {
        /* gone */
      }
    }
  }
);
