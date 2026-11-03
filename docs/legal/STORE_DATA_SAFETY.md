# Store privacy answers (draft)

Derived from the code in this repository. Re-verify against the final build before submitting; a wrong answer can get an app rejected.

## Google Play — Data safety
| Question | Answer |
|---|---|
| Does the app collect or share user data? | Collects: **yes**. Shares with third parties for their own purposes: **no** (Supabase and Expo act as processors) |
| Data encrypted in transit | Yes (HTTPS) |
| Users can request deletion | Yes — in-app (*Settings > Delete account*) and via [support email] |
| Account creation | Email + password |
| Data types | **Personal info:** email address, name (display name). **Health and fitness:** health info (sleep, water, steps, weight, measurements), fitness info (workouts). **Financial info:** other financial info (user-entered transactions, budgets, savings goals). **Messages/Other user content:** notes, journal entries, tasks, goals. **Device or other IDs:** push token. **App activity:** in-app records the user creates |
| Purpose | App functionality, account management. **Not** advertising, analytics or personalisation by third parties |
| Optional? | All tracking data is user-provided and optional; email is required for an account; push token only if notifications are enabled |
| Ads / analytics SDKs | None |
| Required permissions | Notifications (Android 13+ `POST_NOTIFICATIONS`). No location, camera, contacts, microphone or storage permission requested |

## Apple — App Privacy ("nutrition label")
Data **linked to the user**, used for **App Functionality** only; **not** used for tracking:
Contact Info (email, name) · Health & Fitness · Financial Info · User Content (notes, journal, tasks) · Identifiers (device push token).
"Data used to track you": **None**. No third-party advertising or analytics SDKs.

Other App Store items: **Account deletion** is available in-app (guideline 5.1.1(v)); `ITSAppUsesNonExemptEncryption` is `false` (standard HTTPS only);
health data is user-entered, not read from HealthKit; privacy policy URL required (web route `/privacy`); support URL required.

## Age rating (draft answers)
No violence, gambling, user-generated content shared between users, web browsing or purchases. Suggested: 4+ / Everyone. Contains health and finance *tracking* (not advice).

## Region
Primary market: India. Both stores need the policy URL, a support contact and a content-rating questionnaire completed by the account holder.
