# Genesis Reserve — Fast Path Launch Plan
**Target: Live Testers in 14 Days | Current Date: April 30, 2026**

---

## Executive Summary

| Track | Goal | Timeline | Owner |
|-------|------|----------|-------|
| A — Web Beta | Testers access staging URL from browser | Days 1–5 | Eng + DevOps |
| B — iOS TestFlight | Internal testers install via TestFlight | Days 6–10 | Eng + iOS |
| C — Android Play | Internal testers install via Play Console | Days 6–10 | Eng + Android |

**Hard constraints before any track starts:**
- [ ] `.env.production` file exists with staging API keys (no placeholders)
- [ ] Apple Developer account active ($99/yr) and 2FA enrolled
- [ ] Google Play Console account active ($25 one-time)
- [ ] Mac available for iOS code signing (Track B only)
- [ ] Sentry (or equivalent) DSN ready for error capture

---

## Prerequisites Checklist

### Accounts & Credentials
- [ ] Apple Developer Program — `developer.apple.com` — enrolled, team ID known
- [ ] App Store Connect — app record created (Bundle ID: `com.genesisreserve.app`)
- [ ] Google Play Console — app created, package name: `com.genesisreserve.app`
- [ ] Vercel / Railway / Fly.io account (for staging deployment)
- [ ] Sentry project created — DSN copied to `.env.production`

### Local Machine (Mac required for iOS)
- [ ] Node 20 LTS installed
- [ ] Xcode 15+ installed from Mac App Store
- [ ] Android Studio installed (Windows or Mac)
- [ ] Java 17 JDK installed (`java -version` → 17.x)
- [ ] Capacitor CLI: `npm install -g @capacitor/cli`

### Environment File
Create `genesis-privy-integration/genesis-privy/.env.production`:
```
NEXT_PUBLIC_PRIVY_APP_ID=<staging_privy_app_id>
NEXT_PUBLIC_ZEROHASH_BASE_URL=https://api.staging.zerohash.com
NEXT_PUBLIC_SENTRY_DSN=<sentry_dsn>
NEXT_PUBLIC_APP_ENV=staging
NEXT_PUBLIC_API_BASE_URL=https://genesis-staging.yourdomain.com
```

---

## Track A — Web Beta (Days 1–5)

### Day 1: Production Build Verification

```powershell
cd "c:\Users\mrbee\OneDrive\Freedom Folder\AMB Trust Fund\Trust Business\GENESIS BANKING\GENESIS TECH\Genesis Reserve All In One\genesis-privy-integration\genesis-privy"

# Clean build
Remove-Item -Recurse -Force .next-local -ErrorAction SilentlyContinue
npm run build

# Confirm exit 0 — no TypeScript errors, no missing env vars
```

**Go/No-Go Gate A1:** Build exits 0 with no errors.

### Day 2: Staging Deployment

**Option 1 — Vercel (fastest, recommended):**
```bash
npm install -g vercel
vercel --prod
# Follow prompts: link project, confirm env vars imported
```

**Option 2 — Railway:**
```bash
# Push repo to GitHub first, then connect Railway to the repo
# Set root directory: genesis-privy-integration/genesis-privy
# Set build command: npm run build
# Set start command: npm start
# Add all .env.production vars in Railway dashboard
```

**Post-deploy checklist:**
- [ ] Staging URL loads without 500 errors
- [ ] `/api/gr/vault/positions?walletAddress=0x...` returns 200 or graceful fallback
- [ ] `/api/gr/yield/monitor` returns 200 or graceful fallback
- [ ] Privy login modal opens on staging domain
- [ ] Sentry receives a test event

### Day 3: Smoke Test Pass

Run against the staging URL — cover all 10 flows from ONBOARDING_ONE_PAGER.txt:
1. Load dashboard — no blank screens
2. Privy wallet connect (email OTP)
3. Vault strategy accordion — open/close all 3 tiers
4. Select a vault strategy — sticky bar updates
5. YieldEngine tab navigation — Overview / Allocation / Risk Ops
6. Yield APY freshness counter ticking
7. Vault positions endpoint — fallback payload visible if upstream down
8. Mobile viewport (375px width) — no overflow, sticky bar visible
9. localStorage persistence — strategy selection survives refresh
10. WebSocket disconnection banner — amber warning appears

**Go/No-Go Gate A2:** All 10 smoke test flows pass. Zero 500s in Sentry.

### Day 4: Tester Invite

1. Copy staging URL
2. Send ONBOARDING_ONE_PAGER.txt to each tester (update URL placeholder)
3. Create feedback collection channel (Slack DM / Notion form / email thread)
4. Brief testers on severity guide (P0–P3 from ONBOARDING_ONE_PAGER.txt)

### Day 5: Web Beta Live — Monitor

- [ ] Monitor Sentry for 24 hours
- [ ] Run daily standup (template in ONBOARDING_ONE_PAGER.txt)
- [ ] Fix any P0/P1 issues immediately before proceeding to Track B/C

**Go/No-Go Gate A3 (required before Track B/C):** No unresolved P0 issues. At least 2 testers have completed all 10 flows.

---

## Track B — iOS TestFlight (Days 6–10)

> Requires a Mac. All commands below run on Mac unless noted.

### Day 6: Capacitor Setup

```bash
cd genesis-privy-integration/genesis-privy

# Install Capacitor core + iOS platform
npm install @capacitor/core @capacitor/ios @capacitor/app @capacitor/haptics @capacitor/keyboard @capacitor/status-bar

# Initialize Capacitor (run once)
npx cap init "Genesis Reserve" com.genesisreserve.app --web-dir=out

# Update next.config.js for static export (required for Capacitor):
# Add: output: 'export', images: { unoptimized: true }
```

**Update `next.config.js`:**
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',          // ADD THIS
  distDir: '.next-local',
  images: { unoptimized: true },  // ADD THIS
  // ... rest of config
}
module.exports = nextConfig
```

**Build static export:**
```bash
npm run build
# Confirm: out/ directory created with index.html
```

**Add iOS platform:**
```bash
npx cap add ios
npx cap sync ios
```

### Day 7: iOS Configuration

**Open Xcode:**
```bash
npx cap open ios
```

**In Xcode:**
1. Select project → Signing & Capabilities
2. Set Team to your Apple Developer team
3. Bundle Identifier: `com.genesisreserve.app`
4. Version: `1.0.0` | Build: `1`
5. Deployment Target: iOS 16.0
6. Add capability: Push Notifications (if needed)
7. Add capability: Associated Domains (for Privy deep links)

**App icon:** Drop 1024×1024 PNG into `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

### Day 8: TestFlight Build

**Archive in Xcode:**
1. Product → Destination → Any iOS Device (arm64)
2. Product → Archive
3. Wait for archive to complete
4. Organizer opens → Distribute App → App Store Connect → Upload

**In App Store Connect (`appstoreconnect.apple.com`):**
1. My Apps → Genesis Reserve → TestFlight
2. Wait for build processing (~15 min)
3. Add Internal Testers (up to 25 with internal group)
4. No review required for internal testing

**Go/No-Go Gate B1:** Build appears in TestFlight with no "Missing Compliance" blocks.

### Day 9: TestFlight Tester Access

1. Invite testers by email in App Store Connect → TestFlight → Internal Group
2. Testers receive email → "View in TestFlight" → Install
3. Run same 10-flow smoke test on device
4. Collect feedback through same channel as web beta

### Day 10: iOS Beta Live

- [ ] Confirm all invited testers installed successfully
- [ ] Monitor crash reports in Xcode Organizer → Crashes
- [ ] Monitor Sentry for iOS-specific errors

---

## Track C — Android Play (Days 6–10)

> Can run in parallel with Track B. Android Studio works on Windows or Mac.

### Day 6: Android Capacitor Setup

```bash
cd genesis-privy-integration/genesis-privy

# Add Android platform (after Capacitor init from Track B)
npx cap add android
npx cap sync android
```

**Open Android Studio:**
```bash
npx cap open android
```

### Day 7: Android Configuration

**In Android Studio:**
1. `android/app/build.gradle` → update:
   ```gradle
   android {
     defaultConfig {
       applicationId "com.genesisreserve.app"
       minSdkVersion 26
       targetSdkVersion 34
       versionCode 1
       versionName "1.0.0"
     }
   }
   ```
2. Sync Gradle
3. Add app icons: `android/app/src/main/res/` → replace mipmap icons

**Generate signing keystore (run once, store securely):**
```bash
keytool -genkey -v -keystore genesis-release.keystore \
  -alias genesis -keyalg RSA -keysize 2048 -validity 10000
# Store this file OUTSIDE the repo — never commit it
```

**Configure signing in `android/app/build.gradle`:**
```gradle
android {
  signingConfigs {
    release {
      storeFile file("../../genesis-release.keystore")
      storePassword System.getenv("KEYSTORE_PASS")
      keyAlias "genesis"
      keyPassword System.getenv("KEY_PASS")
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release
      minifyEnabled false
    }
  }
}
```

### Day 8: Play Console AAB Upload

**Build release AAB:**
```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

**In Google Play Console (`play.google.com/console`):**
1. Your app → Testing → Internal Testing
2. Create new release
3. Upload `app-release.aab`
4. Add release notes
5. Save → Review → Start rollout to Internal Testing (no review required)

**Go/No-Go Gate C1:** AAB uploaded, no policy violations flagged.

### Day 9: Play Internal Tester Access

1. Play Console → Internal Testing → Testers → Manage
2. Add tester email addresses (or share opt-in link)
3. Testers receive email with Play Store install link
4. Run same 10-flow smoke test on Android device

### Day 10: Android Beta Live

- [ ] Confirm tester installs successful
- [ ] Monitor Android Vitals in Play Console
- [ ] Monitor Sentry for Android-specific errors

---

## Master Day-by-Day Matrix

| Day | Track A (Web) | Track B (iOS) | Track C (Android) | Owner |
|-----|--------------|--------------|-------------------|-------|
| 1 | Production build verify | — | — | Eng |
| 2 | Deploy to staging | — | — | DevOps |
| 3 | Smoke test all 10 flows | — | — | QA |
| 4 | Tester invite + brief | — | — | PM |
| 5 | Web beta live, monitor | — | — | Eng + PM |
| 6 | P0/P1 fixes | Capacitor install + static export | Capacitor Android add | Eng |
| 7 | Monitor Sentry | iOS Xcode config + signing | Android Studio config + keystore | Eng |
| 8 | Daily standup | Xcode archive + TestFlight upload | AAB build + Play upload | Eng |
| 9 | Monitor | TestFlight invite testers | Play invite testers | PM + QA |
| 10 | — | iOS beta live | Android beta live | All |

---

## Go/No-Go Gates Summary

| Gate | Condition | Pass Action | Fail Action |
|------|-----------|-------------|-------------|
| A1 (Day 1) | `npm run build` exits 0 | Proceed to deploy | Fix build errors, rerun |
| A2 (Day 3) | All 10 flows pass, zero 500s | Invite testers | Fix blocking issues |
| A3 (Day 5) | No P0s, 2+ testers completed flows | Start Track B/C | Hold until P0s resolved |
| B1 (Day 8) | Build in TestFlight, no compliance blocks | Invite TestFlight testers | Fix Xcode/signing issues |
| C1 (Day 8) | AAB uploaded, no policy violations | Invite Play testers | Fix manifest/signing issues |
| LAUNCH (Day 14) | No P0/P1 open, 5+ testers completed | Expand tester group | Extend beta 1 week |

---

## Environment Configuration Reference

### Endpoint Map by Environment

| Service | Dev (local) | Staging | Production |
|---------|------------|---------|------------|
| App URL | http://localhost:3200 | https://genesis-staging.yourdomain.com | https://app.genesisreserve.com |
| ZeroHash | mock/fallback | api.staging.zerohash.com | api.zerohash.com |
| Privy App ID | dev app id | staging app id | production app id |
| Sentry | disabled | enabled (staging env) | enabled (production env) |

### Capacitor API URL Override
For mobile builds pointing to staging, update `capacitor.config.ts`:
```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.genesisreserve.app',
  appName: 'Genesis Reserve',
  webDir: 'out',
  server: {
    // Remove this block for production builds
    url: 'https://genesis-staging.yourdomain.com',
    cleartext: false,
  },
};

export default config;
```

---

## Known Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Static export breaks API routes | High | High | Use `output: 'export'` + move BFF calls to external API or use Capacitor HTTP plugin |
| Apple review rejects TestFlight | Low | Medium | Internal testing doesn't require review; only external does |
| Windows EBUSY lock on build | Medium | Low | Use `.next-local` distDir (already configured) |
| Privy auth broken on staging domain | Medium | High | Add staging domain to Privy app's allowed origins |
| ZeroHash staging API down | Medium | Medium | Graceful fallback already implemented in vault/positions |
| Keystore lost | Low | Critical | Store keystore in 1Password or encrypted cloud backup immediately |

### Critical: Static Export + API Routes
Next.js `output: 'export'` does **not** support API routes (`/app/api/...`). Before Track B/C:
- Either deploy the Next.js app to Vercel/Railway as a server (no static export, Capacitor fetches from staging URL)
- Or migrate BFF routes to a standalone Express/Fastify server

**Recommended path:** Keep server deployment on Vercel. In `capacitor.config.ts`, point `server.url` to your staging Vercel URL. This avoids the static export problem entirely and keeps API routes working.

```ts
// capacitor.config.ts — server mode (no static export needed)
const config: CapacitorConfig = {
  appId: 'com.genesisreserve.app',
  appName: 'Genesis Reserve',
  webDir: 'out',          // still need a minimal out/ for cap sync
  server: {
    url: 'https://genesis-staging.yourdomain.com',  // Vercel staging URL
    cleartext: false,
  },
};
```

With `server.url` set, the WebView loads the remote URL, so API routes work normally.

---

## Immediate Next Actions (Today)

1. **Confirm `.env.production`** — fill in all placeholder values
2. **Run `npm run build`** — confirm exit 0 (Gate A1)
3. **Create Vercel account / link project** — execute Day 2 deploy
4. **Register Apple Developer account** if not active
5. **Register Google Play Console account** if not active
6. **Store this file** — share with team as execution reference

---

*Fast Path Plan v1.0 — Genesis Reserve | April 30, 2026*
