# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Android guest account cooldown

One Android device ID can create a new guest account every 72 hours. Existing
sessions and Google sign-in are unaffected. The database enforces the limit, even
when someone calls anonymous signup directly without the app's status check.

### Deployment

1. Apply `supabase/migrations/0022_guest_creation_cooldown.sql` after the existing
   migrations, using the Supabase SQL Editor or your normal migration process.
2. Run `supabase/tests/guest-creation.sql` in the SQL Editor. Test changes roll back.
3. In Supabase Authentication rate-limit settings, verify the anonymous-sign-in
   IP limit is enabled. Supabase defaults to 30 requests per IP per hour; lower it
   if needed. This repository does not change the hosted Auth settings.
4. Build a new Android APK to include `expo-application`. Keep the same signing
   key across updates and reinstalls.
5. On a test phone, create a guest, sign out, and attempt another creation. Repeat
   after clearing app data and after reinstalling the same signed APK. Creation
   must remain blocked until the server's cooldown expires. Check that Google
   sign-in still works.

Apply the database change before distributing the new APK. Old APKs and web/iOS
clients cannot create new guests because they do not send an Android device ID;
they can still use Google sign-in. Existing guests start a device cooldown only
when they next create an account with the updated APK. Existing accounts are not
retroactively linked to devices.

### Security limits

Android ID normally survives uninstalling and clearing app data, but can change
after a factory reset, a signing-key change, or a switch of Android user. Modified
clients can spoof it. This is best-effort abuse prevention, not device attestation.
The private cooldown table stores a hash instead of the raw ID and does not reset
when an account is deleted. Reinstalls do not recover the previous guest session.
Document this abuse-prevention use of device data in your privacy notice before
distribution. Guest signup fails closed if the status service is unavailable.
