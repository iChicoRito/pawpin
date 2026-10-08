## Project

PawPin is a phone app for reporting stray animals with an exact location, so rescuers can find them. Android first; iPhone and web are secondary.

**Stack**

- Expo SDK 57, React Native 0.86, React 19, TypeScript. React Compiler is on.
- Expo Router with typed routes. Screens live in `src/app`.
- HeroUI Native for components, Uniwind (Tailwind v4) for class styling, Hugeicons for icons.
- Supabase for sign-in, the database (Postgres with PostGIS), and photo storage. No server of our own.
- Maps: MapLibre (`@maplibre/maplibre-react-native`) with free OpenStreetMap tiles. No key, no billing account. Not Google Maps. Coordinates are longitude first. Directions are handed to Google Maps or Waze by a web link, and those links take latitude first.

**Layout**

- `src/app/_layout.tsx` — providers and the route guard: signed-out users see `welcome`, signed-in users see `(tabs)`, `settings`, `components`.
- `src/app/(tabs)/` — Map, List, Report, Profile.
- `src/app/(tabs)/index.tsx` — the Map tab: nearby reports as paw pins colored by urgency, a drawer with the gist when a pin is tapped. `list.tsx` — the same reports as cards, nearest first. Each has a `.web.tsx` twin with one line saying it works in the phone app.
- `src/app/report/[id].tsx` — one report in full, opened from a card or from the drawer: photos, two tabs (Report, Reporter), and the directions buttons.
- `src/hooks/use-nearby-reports.tsx` — `useNearbyReports()`: the one copy of the nearby reports that the Map, the List, and the report page all read. It also holds the chosen search distance.
- `src/lib/nearby.ts` — the nearby search (calls the database function `nearby_reports`), the distance choices, the urgency colors. `src/lib/map.ts` — map styles for light and dark, the paw pictures. `src/lib/directions.ts` — the Google Maps and Waze links.
- `src/lib/appearance.ts` — the light, dark, or system choice on the Profile tab, kept on the phone.
- `src/app/(tabs)/report.tsx` — the Report tab on phones: permissions, then camera, then form. `report.web.tsx` is the browser version, one line saying reporting works in the phone app.
- `src/components/report-*.tsx` — the steps of reporting: `report-permissions`, `report-camera`, `report-form`, `report-sent`, `report-unsent` (a report kept on the phone after a failed send).
- `src/lib/reports.ts` — the report draft, the choice lists, sending a report, and keeping an unsent one.
- `src/app/components.tsx` — every HeroUI component on one page. Opened by the small gear button over the tabs, in development builds only.
- `src/components/app-tabs.tsx` — the custom bottom tab bar.
- `src/hooks/use-session.tsx` — `useSession()`: session, guest flag, name, photo.
- `src/lib/supabase.ts`, `src/lib/auth.ts` — Supabase client and Google sign-in.
- `supabase/migrations/` — SQL, numbered in the order it was applied.
- `supabase/tests/` — check scripts that roll themselves back. Paste into the Supabase SQL Editor to run.
- `docs/` — analysis and phase plans. Local only, see below.

**Where the plan is**

- What to build and in what order: `docs/analysis/ANALYSIS - PAWPIN PROJECT GUIDE/05 - ROADMAP.md`.
- Roadmap Phase 1 (sign-in, tabs, database) is built: `docs/implementation-plan/app-access/`. CAPTCHA for guests was dropped by the owner.
- Roadmap Phase 2 (reporting a stray) is built: `docs/implementation-plan/stray-reporting/`. Some of its screen checks were marked done by the owner without being seen line by line; each phase file says which. The notifications request (part of R-11) waits for roadmap Phase 5.
- Roadmap Phase 3 (map, list, report page, directions) is built: `docs/implementation-plan/stray-finding/`. Most of its screen checks were marked done by the owner without being reported line by line; each phase file says which. A path drawn on PawPin's own map was tried and removed: the free routing servers were not dependable.
- Next is roadmap Phase 4: claiming a report, outcomes, live changes.

**Things that have already cost time**

- Never commit or push anything under `docs/`. It is in `.gitignore`; do not force-add it.
- Import Hugeicons one file per icon: `import MapsIcon from '@hugeicons/core-free-icons/MapsIcon'`. The package's main entry loads 12,000 files and crashes Metro.
- After adding a screen, start the dev server once before `npx tsc --noEmit`. Route types are regenerated on start; until then the new route is a type error.
- Google sign-in works in the Android build only. It returns to `pawpin://`, which Expo Go does not handle. Guest sign-in works everywhere.
- HeroUI color tokens built with `color-mix` (such as `accent-soft`) do not resolve through `useThemeColor`. Use the plain tokens.
- The accent color is too light for small text on a white background (3.7:1). Use it for icons and filled buttons, not for small labels.
- New database changes go in a new numbered file in `supabase/migrations/`. Test in a transaction that is rolled back before applying.
- `npm run lint` reports one known error in the untouched Expo starter file `src/hooks/use-color-scheme.web.ts`. Lint the files you changed.
- The `android/` folder is generated and ignored by Git. After changing a plugin in `app.json`, run `npx expo prebuild --platform android` before `npm run android`, or the change is not in the build.
- `npm run android` builds for the connected phone's chip only. That app file does not run on the emulator.
- A report's place and time are fixed when the first photo is taken, never when the form is sent. Do not read the location again later in the flow.
- A report's id is made on the phone and saved as the row's id, and its photos go to `report-photos/<user id>/<report id>/`. That is what stops a second copy when a report is sent twice.
- Signed-in users may change only some columns of their own reports. `id`, `reporter_id`, and `created_at` are closed, and `created_at` is set by the database (`supabase/migrations/0005_guest_report_limit.sql`).
- The MapLibre and location libraries do not work in a browser. Keep them out of anything the web version shows. A component that needs the map gets a `.web.tsx` twin, as `report-place-map` has.
- A fresh location read often fails indoors or just after the phone wakes ("Current location is unavailable"), with location switched on. Fall back to `getLastKnownPositionAsync`, then to the last place read, before showing an error (`use-nearby-reports.tsx`).
- The viewer's location for searching is read once per search, never watched. The dot on the Map is drawn from that place; MapLibre's `UserLocation` would keep the GPS on.
- Pins on the map are layers drawn by the map itself (`GeoJSONSource` with `Layer`), not one React view per report. Read the names from the installed package's type files; they are exact for the version in the build.
- The map follows the app's theme. The dark style is a file in the app, `src/lib/map-dark.json`, made by `scripts/make-dark-map-style.js`; the tile service's own `dark` style is close to black and hard to read.
- `Uniwind.setTheme('light' | 'dark' | 'system')` switches the whole app, the map included. Read the theme with `useColorScheme`, as the rest of the code does.
- To center something in what is left under a `FlatList` header, put it in `ListFooterComponent` with `ListFooterComponentStyle={{ flexGrow: 1 }}`. The empty slot cannot be stretched.
- The reporter's name, photo, join month, and report count are shown on the report page to every signed-in user, guests included. The database already allowed reading them; think before showing more.

## Commands

```bash
npm run android        # build and install the Android app (needs JAVA_HOME and ANDROID_HOME)
npm start              # dev server only, for Expo Go or an already installed build
npm run web            # run in a browser
npx tsc --noEmit       # type check
npm run lint           # lint the whole project
npx eslint src/app     # lint a folder or file
npx expo export --platform web --output-dir dist-check   # prove every screen bundles; delete dist-check after
```

Secrets live in `.env.local`, which Git ignores: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, and `SUPABASE_DB_URL`. Only names starting with `EXPO_PUBLIC_` are shipped inside the app, so the database password must never get that prefix.

## Rules



For any task bigger than a small fix:

1. Understand the goal and read the code it touches.
2. Write a short plan: what changes, which files, which skills or plugins are needed.
3. Check that the plan is not over-engineered.
4. Implement. Keep the code as simple as the plan.

### 2. Keep it simple and focused

- Do only what the user asked. The latest instruction wins.
- Prefer the smallest change that correctly solves the task.
- Reuse existing code and project patterns before writing new code.
- Do not add abstractions, layers, features, or libraries without a clear need.
- Do not change, clean up, or restructure unrelated code.
- Keep existing working behavior unless the task requires a change.

### 3. Skills and plugins

Use a skill or plugin only when it directly helps the current task. Do not load one just because it is available.

### 5. Git

- Never commit unless the user asks.
- Commit messages contain only the approved message. No `Co-Authored-By`, no Claude or AI author lines, no other author changes.

### 6. Check work before finishing

- Review the changes for mistakes.
- Run the checks that match the change.
- Say clearly what was not checked.
- Never claim something works without checking it when checking was possible.

### 7. Plain language

Use simple, clear words. Keep explanations short. Explain any technical term that is needed.
