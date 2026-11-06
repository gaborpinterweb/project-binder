/**
 * Optimistic concurrency token for userWorkspace / userArchive uploads.
 * Clients send the base changeId they loaded; a new UUID is written on each save.
 */
migrate(
  (app) => {
    const userData = app.findCollectionByNameOrId("user_data");
    userData.fields.add(
      new TextField({
        name: "changeId",
        required: false,
        max: 64,
      })
    );
    app.save(userData);
  },
  (app) => {
    const userData = app.findCollectionByNameOrId("user_data");
    try {
      userData.fields.removeByName("changeId");
    } catch {
      /* */
    }
    app.save(userData);
  }
);
