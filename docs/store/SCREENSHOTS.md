# Screenshots

Capture on a real or simulated device with seeded demo data (never real personal data). Do this for light and dark if you want both.

## Required sizes (verify against the current store requirements before uploading)
- **iOS:** 6.9" (1320×2868) and 6.5"/6.7" iPhone; iPad 13" if `supportsTablet` stays on (it does).
- **Android:** phone (min 2 screenshots, 16:9–9:16); 7"/10" tablet optional but recommended.
- **Play feature graphic:** 1024×500. **Play icon:** 512×512.

## Shot list (in order)
1. Dashboard (score + today)  2. Planner with tasks  3. Habits with heatmap  4. Learning/study timer  5. Finance month view
6. Fitness workout  7. Health day  8. Analytics  9. Notifications/reminders

## Capture
With a dev or preview build signed in to a **demo account**, run the Maestro flow (it writes PNGs to the current directory):
```bash
maestro test apps/mobile/.maestro/screenshots/capture.yaml --env E2E_EMAIL=demo@example.com --env E2E_PASSWORD='demo-password'
```
Then add device frames/captions in your design tool. Do not include real names, emails or amounts.
