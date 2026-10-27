/**
 * Lemon Squeezy → Polar billing fields on users.
 * Keeps pro / proStatus; renames ls* → polar*.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.fields.add(
      new TextField({
        name: "polarCustomerId",
        required: false,
        max: 64,
      })
    );
    users.fields.add(
      new TextField({
        name: "polarSubscriptionId",
        required: false,
        max: 64,
      })
    );

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

    users.updateRule =
      'id = @request.auth.id && @request.body.pro:isset = false && @request.body.proStatus:isset = false && @request.body.polarCustomerId:isset = false && @request.body.polarSubscriptionId:isset = false';

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    try {
      users.fields.removeByName("polarCustomerId");
    } catch {
      /* */
    }
    try {
      users.fields.removeByName("polarSubscriptionId");
    } catch {
      /* */
    }
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
  }
);
