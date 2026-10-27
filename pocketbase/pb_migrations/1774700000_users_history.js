/**
 * Per-user history map: { [key]: ISO timestamp }.
 * e.g. { "onboarding_dialog_finished": "2026-06-28T18:32:32.000Z" }
 * Clients may update their own history; billing fields stay blocked by updateRule.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(
      new JSONField({
        name: "history",
        required: false,
      })
    );
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    try {
      users.fields.removeByName("history");
    } catch {
      /* */
    }
    app.save(users);
  }
);
