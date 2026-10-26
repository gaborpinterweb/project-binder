/**
 * PocketBase rejects enabled=false on required bool fields ("Cannot be blank").
 * Make shares.enabled and share_files.enabled optional so unshare works.
 */
migrate(
  (app) => {
    for (const name of ["shares", "share_files"]) {
      const col = app.findCollectionByNameOrId(name);
      const field = col.fields.getByName("enabled");
      if (field) {
        field.required = false;
        app.save(col);
      }
    }
  },
  (app) => {
    for (const name of ["shares", "share_files"]) {
      try {
        const col = app.findCollectionByNameOrId(name);
        const field = col.fields.getByName("enabled");
        if (field) {
          field.required = true;
          app.save(col);
        }
      } catch {
        /* collection may not exist */
      }
    }
  }
);
