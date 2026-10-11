# PawPin feedback sounds

Original soundcn assets by Kenney, licensed CC0. MP3 bytes extracted unchanged from
the registry modules installed with:

```sh
pnpm dlx shadcn add @soundcn/success-chime
pnpm dlx shadcn add @soundcn/error-003
pnpm dlx shadcn add @soundcn/notification-pop
pnpm dlx shadcn add @soundcn/question-001
```

Commands ran in an isolated staging folder to keep the browser-only sound engine
and shadcn web configuration out of this Expo app. `SoundEffects` uses `expo-audio`
for native and web playback. Files are bundled, so playback needs no network.

Registry sources:
- https://www.soundcn.xyz/r/success-chime.json
- https://www.soundcn.xyz/r/error-003.json
- https://www.soundcn.xyz/r/notification-pop.json
- https://www.soundcn.xyz/r/question-001.json

Feedback plays only while PawPin is active, uses device audio volume, and respects
silent mode on Android and iOS.
Existing system push notifications keep their background sound.
Foreground report pushes share report-ID deduplication with realtime and skip
system audio. On Android, this may also suppress the heads-up banner; the
notification remains in the notification list.
