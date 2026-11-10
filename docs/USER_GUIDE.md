# User guide

For people using LifeTrack. The in-app **Help & Support** page (web `/help`, mobile More → Help & Support) has searchable guides and an FAQ; this guide follows the same structure and adds the details from the code.
Feature status for each area is in [FEATURES.md](FEATURES.md).

## 1. Getting started

1. **Create an account** (name, email, a password of 8–72 characters). If your project asks for email confirmation, open the link in the email (on mobile, open it on the same phone), then sign in.
2. **Sign in on every device** with the same account. Everything syncs through the cloud within about a second (the header shows *Live sync on*), or on the next time the app gains focus.
3. **Install it.** Web: Chrome/Edge → *Install app*; Android Chrome → *Add to Home screen*. The phone app is installed from the store or the APK you were given.
4. Open **Settings → Preferences** first: choose your **timezone** (all "today" calculations use it on every device), currency (INR, USD, EUR), the first day of the week, and optional daily goals (study minutes, water, steps, sleep, monthly budget).
5. The **Dashboard** shows a getting-started checklist (plan a task, create a habit, set a goal, log an expense, log sleep or water) that ticks itself off and then disappears.

LifeTrack needs an internet connection. Offline you see a banner and changes cannot be saved; nothing is silently dropped.

## 2. Finding your way

- **Web:** sidebar groups — Overview · Productivity (Planner, Focus, Habits, Notes) · Growth (Learning, Jobs, Goals) · Wellness (Fitness, Health, Food) · Money (Finance) · Insights (Analytics, Reports) · System (Notifications, Settings, Export, Help).
  On phones the bottom bar shows Dashboard, Planner, Habits, Finance and *More*.
- **Search / command palette:** `Ctrl/Cmd + K` — find tasks, notes, goals, job applications, habits and transactions, jump to any page, run quick actions, switch theme, sign out.
- **Quick add** (the **+** button): Add task · Start study · Log workout · Add expense · Log water · Complete habit · Job application.
- **Mobile:** tabs Dashboard · Planner · Habits · Finance · More; every other module is under *More*.

## 3. Daily workflow

| Goal | How |
| --- | --- |
| Plan the day | **Planner** → add tasks with a due date, priority and category; make them repeat daily/weekdays/weekly/monthly. Overdue tasks appear first; *Move to today* (web). The top three priorities are highlighted |
| See the whole day | **Dashboard → Today**: interviews and reminders by time, tasks, habits, planned workout, revisions, follow-ups and bills due. Tick tasks and habits right there |
| Build habits | **Habits** → New habit (daily, X times a week, or chosen weekdays). Tap to check in; long-press/menu for *skipped* or *rest*. Streaks and the heatmap update immediately |
| Focus | **Focus** → pick 25/50 minutes or your own, optionally link a task or topic, Start. Breaks follow your Settings. Sessions under a minute are not recorded |
| Study | **Career & Learning** → Start study (one timer at a time) or add a session manually; set goals in hours and topics with revision dates |
| Write | **Notes & Journal** → notes (Markdown, tags, pin, link to a goal/task) and one journal entry per day with mood and wins |
| Track goals | **Goals** → create a goal with milestones; progress comes from milestones, study time, completion or a manual slider |

## 4. Wellness

- **Gym & Fitness:** set a **weekly plan** (routine / rest / flexible per day), build **routines**, then *Log workout* (sets of reps × kg). *This week* shows what you planned and did; *Progress* shows personal records and per-exercise charts; *Exercises* lets
  you browse 876 exercises with start/end photos and add them to your list; *Body* stores measurements. There is no rest timer between sets.
- **Sleep & Health:** one log per day, dated the day you **woke up**: bedtime, wake time, water, steps, energy 1–5, weight. Set a sleep goal in Settings.
- **Food & Nutrition:** 
  1. *Today* → tap **Add** on a meal (Breakfast, Lunch, Evening Snacks, Dinner) or use the quick-add chips (recent, frequent, favourites).
  2. Search by name, Tamil name or a spelling variation (*thosai*, *briyani*, *kozhi kulambu*), pick the food, choose a style, serving (1 piece, cup, plate…, **100 g**, or **custom grams**) and quantity; the calories and macros update live.
  3. Not in the list? **Add a food** yourself, or edit a built-in food (your copy replaces it for you only). Built-in numbers are **estimates** and are labelled *Typical value*, *Approximate* or *Rough estimate*.
  4. *Water*: +250, +500 or a custom amount; *Undo* removes the last drink. It also updates Sleep & Health's water.
  5. *Targets* are optional — nothing is assumed for you. *Calendar* flags days with nothing logged; *Analytics* shows daily, weekly and monthly averages (only over days you actually logged).

## 5. Money

**Finance**: add expenses, income and savings with a category and payment method; navigate by month; set a monthly budget (alerts at 80 % and when over); create savings goals and add money to them; set **recurring rules**
(rent, EMI, subscriptions) — they are posted automatically, dated the day they fell due, the next time the app is open on any of your devices. Download the month as CSV on web.

## 6. Job search

**Job Switch**: add applications, drag cards across the **Board** (web) or change status from the menu, keep a prep checklist, schedule interviews, set follow-up dates. Every status change is recorded in the history. *Insights* shows your funnel, sources and package progression.

## 7. Reminders and notifications

**Notifications → Reminders**: title, kind, date, time, repeat (none/daily/weekly/monthly). They arrive in your **Inbox** and, on the phone, as push notifications if you enabled push in *Preferences* (the phone asks for permission only then). Turn kinds on/off in Preferences.
If a reminder did not fire, see the FAQ below.

## 8. Insights

- **Daily score** (Dashboard): a 0–100 blend of Learning, Career, Fitness, Habits and Sleep & Health. Only the parts that apply to your day are counted, so a rest day or a day without job-search plans is not a zero; "—" means nothing applied. Tune the weights in Settings → Daily score weights.
- **Analytics:** trends over week/month/year/custom ranges. **Reports** (web): printable summary and CSV for a range.

## 9. Your data

- **Settings → Appearance:** dark, light or follow the system — synced to your account.
- **Data Export** (web): download a JSON backup, restore it (merges, never deletes), export CSV per module, or erase everything (type `ERASE`). Details: [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).
- **Delete your account** (Settings → Account): removes your account and all data permanently.
- Privacy: your rows are readable only by your account; LifeTrack contains no analytics or ads. Policy drafts: `/privacy`, `/terms`.

## 10. Keyboard shortcuts (web)

`Ctrl/Cmd + K` search · `↑`/`↓` move · `Enter` open · `Esc` close dialog/search · `←`/`→` switch tabs when a tab bar is focused · `Home`/`End` first/last tab.

## 11. Troubleshooting

| Problem | What to try |
| --- | --- |
| Changes do not show on another device | Check the header says *Live sync on*; refocus the app; confirm both devices use the same account |
| "Today" looks like the wrong day / times are off | Settings → Preferences → Timezone |
| A reminder did not go off | Reminders fire when the server job runs (phone push) or while an app is open (2 minutes after the time). Check the reminder is active, the kind is enabled and push is enabled on the phone |
| "Can't reach the server… Nothing was saved yet." | Reconnect and repeat the action; your input stays in the form |
| "That record already exists." | Another device already created it — it will appear after a refresh |
| Nutrition/Food shows an error | Your database administrator needs to apply migrations 0009 and 0010 |
| I cannot find something I added | Check the date/month filter and category filter, and search |
