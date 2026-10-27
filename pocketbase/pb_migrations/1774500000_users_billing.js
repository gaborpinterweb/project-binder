/**
 * Commercial billing entitlement on users (Lemon Squeezy webhook writes these).
 * Clients may read their own fields but must not set billing fields.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.fields.add(
      new BoolField({
        name: "pro",
        required: false,
      })
    );
    users.fields.add(
      new TextField({
        name: "proStatus",
        required: false,
        max: 32,
      })
    );
    users.fields.add(
      new TextField({
        name: "lsCustomerId",
        required: false,
        max: 64,
      })
    );
    users.fields.add(
      new TextField({
        name: "lsSubscriptionId",
        required: false,
        max: 64,
      })
    );

    users.updateRule =
      'id = @request.auth.id && @request.body.pro:isset = false && @request.body.proStatus:isset = false && @request.body.lsCustomerId:isset = false && @request.body.lsSubscriptionId:isset = false';

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    try {
      users.fields.removeByName("pro");
    } catch {
      /* */
    }
    try {
      users.fields.removeByName("proStatus");
    } catch {
      /* */
    }
    try {
      users.fields.removeByName("lsCustomerId");
    } catch {
      /* */
    }
    try {
      users.fields.removeByName("lsSubscriptionId");
    } catch {
      /* */
    }
    users.updateRule = "id = @request.auth.id";
    app.save(users);
  }
);
