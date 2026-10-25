/**
 * Product schema: owner-scoped workspace files + attachments, public signup.
 * Email SMTP/templates for verify/reset/email-change are applied at runtime by
 * configure-pb-mail (APP_URL from env). Templates below use {APP_URL} so links
 * stay host-agnostic until mail configure runs.
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
<p><a href="{APP_URL}/?verify={TOKEN}">Verify email</a></p>
<p>If you did not create an account, you can ignore this email.</p>`,
    };
    users.resetPasswordTemplate = {
      subject: "Reset your Project Binder password",
      body: `<p>Hello,</p>
<p>Reset your password by clicking the link below:</p>
<p><a href="{APP_URL}/?reset={TOKEN}">Reset password</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
    };
    users.confirmEmailChangeTemplate = {
      subject: "Confirm your new Project Binder email",
      body: `<p>Hello,</p>
<p>Confirm your new email for Project Binder by clicking the link below:</p>
<p><a href="{APP_URL}/?emailChange={TOKEN}">Confirm email change</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
    };
    app.save(users);

    const ownerRule = '@request.auth.id != "" && user = @request.auth.id';

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
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("attachments"));
    } catch {
      /* gone */
    }
    try {
      app.delete(app.findCollectionByNameOrId("user_data"));
    } catch {
      /* gone */
    }
  }
);
