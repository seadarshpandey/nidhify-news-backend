Create an App Version module for a Node.js + Express + MongoDB backend.

### Requirements

Implement the project using the following structure:

* `models/appVersion.model.js`
* `controllers/appVersion.controller.js`
* `routes/appVersion.routes.js`

### MongoDB Schema

Create a collection with these fields:

* `platform` (String, enum: `android`, `ios`)
* `latestVersion` (String) 
* `minimumVersion` (String) 
* `forceUpdate` (Boolean, default `false`)
* `title` (String) (Optional)
* `message` (String) (Optional)
* `playStoreUrl` (String)
* `appStoreUrl` (String)
* `createdAt`
* `updatedAt`

Only one active document should exist per platform.

### APIs

#### GET `/api/app-version`

Query parameter:

```
platform=android
```

Response:

```json
{
  "success": true,
  "data": {
    "latestVersion": "1.0.2",
    "minimumVersion": "1.0.0",
    "forceUpdate": false,
    "title": "Update Available",
    "message": "A new version of the app is available.",
    "storeUrl": "https://play.google.com/store/apps/details?id=com.example.app"
  }
}
```

If no active configuration exists, return a 404 response.

---

#### POST `/api/app-version`

Protected same as in news controller.

Accept a request body to create or update the configuration for a platform.

If a document already exists for that platform, update it instead of creating a duplicate.

Return the updated document.

### Validation

* `platform` is required.
* `latestVersion` is required.
* `minimumVersion` is required.

### Coding Style

* Use async/await.
* Follow the existing project style.
* Export controller methods individually.
* Use Express Router.
* Handle errors with `next(err)`.
* Return consistent JSON responses:

  * `{ success: true, data: ... }`
  * `{ success: false, message: "..." }`
* Do not use TypeScript.
* Do not use comments in the code.
