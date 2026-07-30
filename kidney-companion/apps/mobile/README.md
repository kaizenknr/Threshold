# @kidney/mobile — Expo (React Native)

iOS + Android client. Same wiring as web: Supabase JS SDK (anon key + JWT, persisted via
AsyncStorage) for RLS CRUD, and the shared typed API client for Server API calls. Public envs only.

## Run
```bash
pnpm --filter @kidney/mobile start   # Expo dev server
# then press i (iOS sim) / a (Android) or scan the QR with Expo Go
```

## Env (public only — EXPO_PUBLIC_*)
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_CONSENT_TERMS_VERSION`

## What's implemented
`App.tsx` mirrors the web flow: magic-link sign-in → consent gate → load CKD targets. `expo-image-picker`
is included for the pantry + doctor-doc capture flows.

## Roadmap (BUILD_SPEC §9 polish)
- Native barcode scanning via `expo-camera` barcode API → calls `/ai/food-check` with `mode:'barcode'`.
  Manual barcode/food entry works today; the camera scan is a mobile-only enhancement.
