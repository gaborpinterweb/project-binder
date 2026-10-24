/**
 * Local/demo login: demo@projectbinder.local / demodemodemo
 * Seeds user_data from pb_public/seedWorkspace.json when present.
 */
const DEMO_EMAIL = "demo@projectbinder.local";
const DEMO_PASSWORD = "demodemodemo";

migrate(
  (app) => {
    let user;
    try {
      user = app.findAuthRecordByEmail("users", DEMO_EMAIL);
    } catch {
      const users = app.findCollectionByNameOrId("users");
      user = new Record(users);
      user.set("email", DEMO_EMAIL);
      user.set("password", DEMO_PASSWORD);
      user.set("passwordConfirm", DEMO_PASSWORD);
      user.set("verified", true);
      app.save(user);
    }

    const userDataCol = app.findCollectionByNameOrId("user_data");
    let existing = [];
    try {
      existing = app.findRecordsByFilter(
        userDataCol,
        "user = {:uid}",
        "",
        1,
        0,
        { uid: user.id }
      );
    } catch {
      existing = [];
    }
    if (existing.length) return;

    const row = new Record(userDataCol);
    row.set("user", user.id);

    try {
      row.set("userWorkspace", $filesystem.fileFromPath("pb_public/seedWorkspace.json"));
    } catch (e) {
      console.log("demo user: seedWorkspace.json not found yet; first login will seed", e);
    }
    try {
      row.set(
        "userArchive",
        $filesystem.fileFromBytes('{"version":2,"projects":[]}\n', "userArchive.json")
      );
    } catch {
      /* optional */
    }

    app.save(row);
  },
  (app) => {
    try {
      const user = app.findAuthRecordByEmail("users", DEMO_EMAIL);
      try {
        const rows = app.findRecordsByFilter(
          "user_data",
          "user = {:uid}",
          "",
          10,
          0,
          { uid: user.id }
        );
        for (const r of rows) app.delete(r);
      } catch {
        /* none */
      }
      app.delete(user);
    } catch {
      /* already gone */
    }
  }
);
