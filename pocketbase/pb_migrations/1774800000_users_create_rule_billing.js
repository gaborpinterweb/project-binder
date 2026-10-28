/**
 * Public signup must not set billing (or verified) fields on create.
 * updateRule already blocked those on PATCH; createRule was open ("").
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.createRule =
      "@request.body.pro:isset = false && @request.body.proStatus:isset = false && @request.body.polarCustomerId:isset = false && @request.body.polarSubscriptionId:isset = false && @request.body.verified:isset = false";
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.createRule = "";
    app.save(users);
  }
);
