/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "confirmEmailChangeTemplate": {
      "body": "<p>Hello,</p>\n<p>Confirm your new email for Project Binder by clicking the link below:</p>\n<p><a href=\"http://127.0.0.1:8090/?emailChange={TOKEN}\">Confirm email change</a></p>\n<p>If you did not request this, you can ignore this email.</p>"
    },
    "resetPasswordTemplate": {
      "body": "<p>Hello,</p>\n<p>Reset your password by clicking the link below:</p>\n<p><a href=\"http://127.0.0.1:8090/?reset={TOKEN}\">Reset password</a></p>\n<p>If you did not request this, you can ignore this email.</p>"
    },
    "verificationTemplate": {
      "body": "<p>Hello,</p>\n<p>Please verify your email for Project Binder by clicking the link below:</p>\n<p><a href=\"http://127.0.0.1:8090/?verify={TOKEN}\">Verify email</a></p>\n<p>If you did not create an account, you can ignore this email.</p>"
    }
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "confirmEmailChangeTemplate": {
      "body": "<p>Hello,</p>\n<p>Confirm your new email for Project Binder by clicking the link below:</p>\n<p><a href=\"{APP_URL}/?emailChange={TOKEN}\">Confirm email change</a></p>\n<p>If you did not request this, you can ignore this email.</p>"
    },
    "resetPasswordTemplate": {
      "body": "<p>Hello,</p>\n<p>Reset your password by clicking the link below:</p>\n<p><a href=\"{APP_URL}/?reset={TOKEN}\">Reset password</a></p>\n<p>If you did not request this, you can ignore this email.</p>"
    },
    "verificationTemplate": {
      "body": "<p>Hello,</p>\n<p>Please verify your email for Project Binder by clicking the link below:</p>\n<p><a href=\"{APP_URL}/?verify={TOKEN}\">Verify email</a></p>\n<p>If you did not create an account, you can ignore this email.</p>"
    }
  }, collection)

  return app.save(collection)
})
