# Genesis Reserve Frontend Architecture

**Version**: 1.0  
**Date**: March 26, 2026  
**Stack**: Next.js 14 (App Router) + React Query + Zustand + Privy + wagmi + ZeroDev  
**Target**: Production-ready with feature flags, ownership guards, and demo gating

---

## 1. Philosophy & Core Principles

### 1.1 BFF-First Contract
- **Frontend does NOT call backend directly for launch flows.**
- All data flows through `src/app/api/gr/*` (BFF) endpoints.
- BFF owns request validation, response transformation, and feature flag resolution.
- Frontend is a **consumer of BFF contracts**, not a direct backend consumer.

### 1.2 Feature-Awareness
- Every page and component is partner-aware via feature flags.
- Feature flags are resolved at the BFF session init and passed down via context.
- Partner-specific UI paths are enforced by flag values, not hardcoded conditionals.

### 1.3 Idempotency & Safety
- All user-submission actions (send, deposit, scheduled send, batch, invoice) include idempotency key in request.
- Network failures are retried without duplicating mutations.
- Local optimistic updates are rolled back on failures.

### 1.4 Type Safety & Validation
- All BFF response shapes are TypeScript interfaces.
- Response validation happens at the hook layer (Zod or similar).
- Types are generated from BFF OpenAPI spec (post-Week 2).

### 1.5 Observability
- Every critical user action emits telemetry (action name, timestamp, success/failure).
- UI errors are captured with context (route, component, action type, error).
- Auth failures, compliance blocks, and provider errors are tagged for alerting.

---

## 2. Directory Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout + provider tree
│   ├── page.tsx                      # Home/dashboard page
│   ├── globals.css                   # Tailwind + theme tokens
│   │
│   ├── (auth)/
│   │   ├── layout.tsx                # Auth wrapper (no nav)
│   │   └── login/
│   │       └── page.tsx              # Privy login surface
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx                # Dashboard layout (nav + sidebar)
│   │   ├── page.tsx                  # Dashboard home
│   │   ├── send/
│   │   │   └── page.tsx              # Send flow root
│   │   ├── send-confirm/
│   │   │   └── page.tsx              # Send confirmation screen
│   │   ├── history/
│   │   │   └── page.tsx              # History + export
│   │   ├── analytics/
│   │   │   └── page.tsx              # Advanced analytics
│   │   ├── scheduled-sends/
│   │   │   ├── page.tsx              # Scheduled sends list
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Scheduled send detail/edit
│   │   ├── batch-operations/
│   │   │   └── page.tsx              # Batch ops upload + results
│   │   ├── invoicing/
│   │   │   ├── page.tsx              # Invoice list
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Invoice detail
│   │   ├── settings/
│   │   │   └── page.tsx              # Account settings
│   │   └── admin/
│   │       ├── page.tsx              # Admin overview
│   │       ├── users/
│   │       │   └── page.tsx          # User management admin
│   │       ├── audit-logs/
│   │       │   └── page.tsx          # Audit log viewer
│   │       └── feature-flags/
│   │           └── page.tsx          # Feature flag editor (if needed)
│   │
│   └── api/
│       └── gr/
│           ├── dashboard/
│           │   └── route.ts          # GET /api/gr/dashboard
│           ├── yield/
│           │   └── route.ts          # GET /api/gr/yield
│           ├── history/
│           │   └── route.ts          # GET /api/gr/history
│           ├── send/
│           │   └── route.ts          # POST /api/gr/send
│           ├── deposit/
│           │   └── route.ts          # POST /api/gr/deposit
│           ├── notifications/
│           │   └── route.ts          # GET /api/gr/notifications
│           ├── accounts/
│           │   └── route.ts          # GET /api/gr/accounts
│           ├── scheduled-sends/
│           │   ├── route.ts          # POST for create, GET for list
│           │   └── [id]/
│           │       └── route.ts      # PUT/DELETE for edit/cancel
│           ├── batch-operations/
│           │   └── route.ts          # POST /api/gr/batch-operations
│           ├── invoices/
│           │   ├── route.ts          # POST create, GET list
│           │   └── [id]/
│           │       └── route.ts      # GET detail, PUT update
│           ├── audit-logs/
│           │   └── route.ts          # GET /api/gr/audit-logs (admin)
│           └── _lib/
│               ├── backend.ts        # BFF backend service client
│               ├── auth.ts           # Privy JWT extraction + delegation
│               └── middleware.ts     # Feature flag + ownership guard middleware
│
├── components/
│   ├── providers.tsx                 # Root provider tree
│   ├── branding/
│   │   ├── Logo.tsx                  # Runtime-branded logo
│   │   ├── ThemeProvider.tsx         # White-label theme resolver
│   │   └── PartnerBranding.tsx       # Partner-specific overrides
│   │
│   ├── layout/
│   │   ├── Header.tsx                # Top nav with account switcher
│   │   ├── Sidebar.tsx               # Left nav with feature-flag routes
│   │   ├── Footer.tsx                # Footer with links
│   │   └── Navigation.tsx            # Route-aware nav builder
│   │
│   ├── dashboard/
│   │   ├── BalanceCard.tsx           # Balance + yield ticker
│   │   ├── AccountSwitcher.tsx       # Multi-account selector (ownership guard)
│   │   ├── ComplianceStatus.tsx      # KYC tier + screening status card
│   │   ├── AllocationChart.tsx       # Pie chart (liquid + reserved + invested)
│   │   ├── AlertBox.tsx              # Pending holds + low balance warnings
│   │   └── RecentTransactions.tsx    # 5-tx snippet with links
│   │
│   ├── send/
│   │   ├── SendForm.tsx              # Quote + recipient + corridor + amount
│   │   ├── RecipientSelector.tsx     # Recent + add new
│   │   ├── CorridorPicker.tsx        # Country/corridor selection
│   │   ├── PayoutMethodSelect.tsx    # Bank/mobile money/cash
│   │   ├── FXQuoteDisplay.tsx        # Rate + spread + delivery estimate
│   │   ├── ComplianceGate.tsx        # KYC tier check + screening block
│   │   ├── SendConfirmation.tsx      # Pre-submit review
│   │   └── SendSuccess.tsx           # Post-submit + link to status
│   │
│   ├── history/
│   │   ├── HistoryTable.tsx          # Sortable, filterable tx table
│   │   ├── FilterBar.tsx             # Date + status + amount + corridor
│   │   ├── TransactionDetail.tsx     # Modal with full tx metadata
│   │   ├── ExportButton.tsx          # CSV export trigger
│   │   └── Pagination.tsx            # Page controls
│   │
│   ├── analytics/
│   │   ├── ROIChart.tsx              # Time-series return
│   │   ├── StrategyBreakdown.tsx     # Aave/Balancer/Morpho allocations
│   │   ├── RiskHeatmap.tsx           # 2D risk/return by strategy
│   │   └── YieldSnapshot.tsx         # Current APY + MoM change
│   │
│   ├── scheduled-sends/
│   │   ├── ScheduledSendsList.tsx    # Card grid with pause/cancel
│   │   ├── CreateScheduledForm.tsx   # Frequency + amount + recipient
│   │   ├── EditScheduledForm.tsx     # Update fields with idempotency
│   │   └── ConfirmCancelModal.tsx    # Confirm cancel workflow
│   │
│   ├── batch-operations/
│   │   ├── BatchUploader.tsx         # CSV file picker + preview
│   │   ├── BatchPreview.tsx          # Table of pending rows
│   │   ├── BatchSubmit.tsx           # Submit with idempotency + progress
│   │   ├── BatchResults.tsx          # Success/failure breakdown
│   │   └── ResultExport.tsx          # Export results as CSV
│   │
│   ├── invoicing/
│   │   ├── InvoiceList.tsx           # Cards with status badge
│   │   ├── CreateInvoiceForm.tsx     # Recipient + amount + description
│   │   ├── InvoiceDetail.tsx         # Full metadata + settlement status
│   │   └── InvoiceStatusBadge.tsx    # DRAFT/SENT/PENDING/SETTLED
│   │
│   ├── settings/
│   │   ├── Profile.tsx               # Name + email + KYC tier + wallet
│   │   ├── Preferences.tsx           # Notifications + currency + timezone
│   │   ├── Security.tsx              # Active sessions + login history
│   │   └── DangerZone.tsx            # Account actions
│   │
│   ├── admin/
│   │   ├── AdminNav.tsx              # Admin-scoped sidebar
│   │   ├── UserManagement.tsx        # User list + KYC actions
│   │   ├── AuditLogViewer.tsx        # Filterable audit feed
│   │   ├── FeatureFlagEditor.tsx     # Toggle feature flags (admin)
│   │   └── AdminOverview.tsx         # Partner metrics + stats
│   │
│   ├── common/
│   │   ├── Button.tsx                # Styled button primitives
│   │   ├── Input.tsx                 # Text input + validation
│   │   ├── Select.tsx                # Dropdown select
│   │   ├── Modal.tsx                 # Dialog wrapper
│   │   ├── Card.tsx                  # Card container
│   │   ├── Alert.tsx                 # Alert/warning/error/success
│   │   ├── Loading.tsx               # Spinner + skeleton
│   │   ├── ErrorBoundary.tsx         # React error boundary wrapper
│   │   ├── EmptyState.tsx            # No-data placeholder
│   │   └── ConfirmDialog.tsx         # Action confirmation
│   │
│   └── hooks/
│       └── (hook files imported from src/hooks)
│
├── hooks/
│   ├── useGenesisVault.ts            # Core vault deposit/withdraw/balances HOOK
│   ├── useYieldSnapshot.ts           # Yield APY + earnings per-second ticker
│   ├── useComplianceGate.ts          # KYC tier + screening status check
│   ├── usePartnerFlags.ts            # Feature flag resolver + bootstrap
│   ├── useBFFData.ts                 # Generic BFF query hook (React Query wrap)
│   ├── useBFFMutation.ts             # Generic BFF mutation hook (with idempotency)
│   ├── useIdempotencyKey.ts          # Gen + persist idempotency keys
│   ├── useOwnershipGuard.ts          # Account ownership validation
│   ├── useSendFlow.ts                # Quote + compliance + reserve/finalize
│   ├── useScheduledSends.ts          # List + create + update + cancel
│   ├── useBatchOperations.ts         # Upload + submit + poll results
│   ├── useInvoicing.ts               # Issue + track + settle invoices
│   ├── useYieldStrategy.ts           # Get + set strategy preference
│   ├── useAuditLogs.ts               # Admin: query + filter logs
│   ├── useOptimisticUpdate.ts        # Local update + rollback pattern
│   ├── useAccountSwitcher.ts         # Multi-account logic
│   ├── useTelemetry.ts               # Action + error emission
│   └── useTheme.ts                   # Runtime branding theme resolver
│
├── context/
│   ├── PartnerFlagsContext.tsx       # Feature flag provider
│   ├── AuthContext.tsx               # Privy session + user state
│   ├── AccountContext.tsx            # Selected account + balance
│   ├── ComplianceContext.tsx         # KYC tier + screening status (cache)
│   └── TelemetryContext.tsx          # Error + action emitter
│
├── config/
│   ├── contracts.ts                  # GenesisVault + StrategyRouter ABIs
│   ├── privyConfig.ts                # Privy appearance + login methods
│   ├── wagmiConfig.ts                # wagmi v2 + Alchemy RPC setup
│   ├── zerodevConfig.ts              # ZeroDev bundler + paymaster URLs
│   ├── constants.ts                  # App-wide constants
│   └── routes.ts                     # Route definitions + flags check
│
├── types/
│   ├── common.ts                     # CommonType, CommonResponse, CommonError
│   ├── bff.ts                        # BFF endpoint request/response shapes
│   ├── dashboard.ts                  # Dashboard data structures
│   ├── send.ts                       # SendQuote, SendOrder, SendStatus shapes
│   ├── vault.ts                      # VaultBalance, YieldSnapshot, Allocation shapes
│   ├── admin.ts                      # AdminUser, AuditLog, FeatureFlag shapes
│   ├── compliance.ts                 # ComplianceStatus, KYCTier, Screening shapes
│   ├── scheduled-sends.ts            # ScheduledSend, Frequency shapes
│   ├── batch.ts                      # BatchOperation, BatchResult shapes
│   ├── invoicing.ts                  # Invoice, InvoiceStatus shapes
│   └── partners.ts                   # Partner, PartnerFeatureFlags shapes
│
├── lib/
│   ├── utils.ts                      # General utilities (format, parse, etc.)
│   ├── validation.ts                 # Zod schemas for BFF responses
│   ├── apiClient.ts                  # Fetch wrapper with auth headers
│   ├── telemetry.ts                  # Action + error logging
│   └── idempotency.ts                # Generate + store idempotency keys
│
└── middleware.ts                     # Next.js middleware (auth + feature flag checks)
```

---

## 3. Component Hierarchy & Data Flow

### 3.1 Root Provider Tree

```
<Providers>
  <QueryClientProvider>
    <WagmiProvider>
      <PrivyProvider>
        <ZeroDev>
          <ThemeProvider (white-label)>
            <PartnerFlagsProvider>
              <AuthContextProvider>
                <TelemetryProvider>
                  <App />
                </TelemetryProvider>
              </AuthContextProvider>
            </PartnerFlagsProvider>
          </ThemeProvider>
        </ZeroDev>
      </PrivyProvider>
    </WagmiProvider>
  </QueryClientProvider>
</Providers>
```

### 3.2 Data Flow: Frontend → BFF → Backend

**Example: Dashboard Load**

```
User lands on /dashboard
  ↓
Layout boots <PartnerFlagsProvider> → calls BFF session init
  ↓
PartnerFlagsContext resolves: features = { send: true, batch: false, invoicing: true }
  ↓
DashboardPage queries useGenesisVault() → calls useBFFData('GET /api/gr/dashboard')
  ↓
BFF route /api/gr/dashboard:
  - Extracts Privy JWT from headers
  - Delegates to backend /v1/treasury/balance + /v1/yield/snapshot + /v1/compliance/status
  - Aggregates responses
  - Returns { balance, yieldSnapshot, complianceStatus, ... }
  ↓
React Query caches (TTL 30s)
  ↓
BalanceCard renders real-time balance + YieldTicker interpolates per-second
```

**Example: Send Flow**

```
User enters Send page
  ↓
SendForm component renders (guard: useOwnershipGuard + useComplianceGate)
  ↓
User enters recipient + amount → calls useSendFlow().getQuote()
  ↓
BFF: POST /api/gr/send (with quote request)
  - Calls backend /v1/remittance/quote
  - Returns quote with rate + spread + delivery estimate + compliance screening result
  ↓
Form updates with quote; user confirms
  ↓
SendForm calls useSendFlow().submitSend() → POST /api/gr/send (with idempotency key)
  ↓
BFF: POST /api/gr/send (submit)
  - Validates idempotency key (backend deduplicates if retried)
  - Calls /v1/remittance/order → reserves USDC
  - Calls /v1/treasury/reserve (locks balance)
  - Calls /v1/compliance/screen + stores result
  - Returns orderID + status
  ↓
useOptimisticUpdate: UI shows "Sending..." locally
  ↓
On success: navigate to /send-confirm with orderID
  ↓
SendSuccess shows TxID + Arbiscan link (if on-chain deposit)
```

---

## 4. State Management Strategy

### 4.1 Where Data Lives

| Data Type | Store | TTL | Invalidation |
|---|---|---|---|
| Feature flags | Context + React Query | 5 min | BFF session init |
| User auth (Privy) | Privy provider | session | Logout |
| Account selection | Zustand | persisted | User switch |
| Balance + yield | React Query | 30s | Manual refetch |
| Compliance status | React Query | 5 min | KYC event |
| Quote cache | React Query | 5 min | User submits |
| Idempotency keys | localStorage | 24h | Post-settlement |
| Telemetry buffer | Memory | flushed on unload | Auto-flush per 30s |
| Theme/branding | Context (white-label) | runtime | Partner change |

### 4.2 Zustand Slices (if used)

```typescript
// store/account.ts
export const useAccountStore = create((set) => ({
  selectedAccountId: null,
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
}));

// store/ui.ts
export const useUIStore = create((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  notificationCount: 0,
  setNotificationCount: (count) => set({ notificationCount: count }),
}));
```

### 4.3 React Query Setup

```typescript
// lib/queryClient.ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30s default
      gcTime: 5 * 60 * 1000, // 5 min cache
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

---

## 5. BFF Integration: Request/Response Contracts

### 5.1 Auth Middleware

BFF routes receive Privy JWT in `Authorization: Bearer <token>` header.

```typescript
// app/api/gr/_lib/auth.ts
export async function extractPriovyIdentity(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  // Call Privy verification endpoint or decode
  return { userId, walletAddress, partnerID };
}
```

### 5.2 Feature Flag Middleware

```typescript
// app/api/gr/_lib/middleware.ts
export async function resolveFeatureFlags(
  partnerID: string,
  userID: string,
): Promise<FeatureFlags> {
  // Query partner_feature_flags table
  return { send: true, batch: false, invoicing: true, analytics: true, ... };
}
```

### 5.3 Ownership Guard

```typescript
// app/api/gr/_lib/middleware.ts
export async function validateAccountOwnership(
  userID: string,
  accountID: string,
): Promise<boolean> {
  // Ensure user owns this account (account_id + user_id match in ledger)
}
```

### 5.4 Example BFF Route

```typescript
// app/api/gr/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { userId, partnerID } = await extractPrivyIdentity(req);
  const flags = await resolveFeatureFlags(partnerID, userId);
  
  // Call backend aggregation
  const [balance, yield, compliance] = await Promise.all([
    backendClient.get(`/v1/treasury/balance?user_id=${userId}`),
    backendClient.get(`/v1/yield/snapshot?user_id=${userId}`),
    backendClient.get(`/v1/compliance/status?user_id=${userId}`),
  ]);
  
  return NextResponse.json({
    balance,
    yieldSnapshot: yield,
    complianceStatus: compliance,
    featureFlags: flags,
    user: { id: userId, partnerID },
  });
}
```

---

## 6. Hooks Layer (Critical)

### 6.1 Core Hooks Pattern

```typescript
// hooks/useBFFData.ts
export function useBFFData<T>(
  endpoint: string,
  options?: { ttl?: number; skip?: boolean },
) {
  return useQuery({
    queryKey: [endpoint],
    queryFn: async () => {
      const res = await fetch(`/api/gr${endpoint}`);
      if (!res.ok) throw new Error(res.statusText);
      return (await res.json()) as T;
    },
    staleTime: options?.ttl ?? 30000,
    enabled: !options?.skip,
  });
}

// hooks/useBFFMutation.ts
export function useBFFMutation<T, V>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
) {
  const { emit } = useTelemetry();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (payload: V) => {
      const idempotencyKey = generateIdempotencyKey();
      const res = await fetch(`/api/gr${endpoint}`, {
        method,
        body: JSON.stringify({ ...payload, idempotencyKey }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(res.statusText);
      return (await res.json()) as T;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      emit('action', { name: 'submit-success', endpoint });
    },
    onError: (error) => {
      emit('error', { name: 'submit-error', endpoint, error: error.message });
    },
  });
}
```

### 6.2 Domain-Specific Hooks

```typescript
// hooks/useSendFlow.ts
export function useSendFlow() {
  const { data: quote, isLoading: quoteLoading } = useBFFData<SendQuote>(
    '/send?action=quote&recipient_id=...&amount=...'
  );
  
  const { mutate: submitSend, isPending } = useBFFMutation<SendOrderResponse, SendOrderPayload>(
    '/send',
    'POST'
  );
  
  return { quote, quoteLoading, submitSend, isPending };
}

// hooks/useGenesisVault.ts
export function useGenesisVault(userID: string) {
  const { data: vaultData, isLoading } = useBFFData<VaultSnapshot>(
    `/dashboard?user_id=${userID}`
  );
  
  const { mutate: deposit } = useBFFMutation<DepositResponse, DepositPayload>(
    '/deposit',
    'POST'
  );
  
  return { balance: vaultData?.balance, deposit, isLoading };
}
```

---

## 7. Type Safety Layer

### 7.1 BFF Response Validation

```typescript
// types/bff.ts
export const DashboardResponseSchema = z.object({
  balance: z.object({
    available: z.string(),
    reserved: z.string(),
    invested: z.string(),
  }),
  yieldSnapshot: z.object({
    apy: z.number(),
    earned: z.string(),
    lastHarvest: z.number(),
  }),
  complianceStatus: z.object({
    kycTier: z.enum(['BASIC', 'ENHANCED', 'INSTITUTIONAL']),
    sanctioned: z.boolean(),
    pendingReview: z.boolean(),
  }),
  featureFlags: z.record(z.boolean()),
});

export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
```

### 7.2 Validation in Hooks

```typescript
// hooks/useBFFData.ts (updated)
export function useBFFData<T>(endpoint: string, schema?: z.ZodSchema) {
  return useQuery({
    queryFn: async () => {
      const res = await fetch(`/api/gr${endpoint}`);
      const json = await res.json();
      if (schema) return schema.parse(json); // Validate
      return json as T;
    },
  });
}
```

---

## 8. Feature Flags in UI Components

### 8.1 Conditional Rendering

```typescript
// components/layout/Sidebar.tsx
import { usePartnerFlags } from '@/hooks/usePartnerFlags';

export function Sidebar() {
  const flags = usePartnerFlags();
  
  return (
    <nav>
      <NavLink href="/send">Send</NavLink>
      {flags.scheduled_sends && <NavLink href="/scheduled-sends">Scheduled</NavLink>}
      {flags.batch_operations && <NavLink href="/batch">Batch</NavLink>}
      {flags.invoicing && <NavLink href="/invoicing">Invoices</NavLink>}
      {flags.analytics && <NavLink href="/analytics">Analytics</NavLink>}
      {flags.admin && <NavLink href="/admin">Admin</NavLink>}
    </nav>
  );
}
```

### 8.2 Route Protection

```typescript
// app/(dashboard)/analytics/page.tsx
export default function AnalyticsPage() {
  const flags = usePartnerFlags();
  const router = useRouter();
  
  if (!flags.analytics) {
    return <NotFound />;
  }
  
  return <AnalyticsContent />;
}
```

---

## 9. Idempotency & Optimistic Updates

### 9.1 Idempotency Key Pattern

```typescript
// lib/idempotency.ts
export function generateIdempotencyKey(): string {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(`idempotency:${userID}`, key);
  return key;
}

export function getStoredKey(actionType: string): string | null {
  return localStorage.getItem(`idempotency:${actionType}`);
}
```

### 9.2 Optimistic Update

```typescript
// hooks/useOptimisticUpdate.ts
export function useOptimisticUpdate<T>(
  mutationFn: (payload: any) => Promise<T>,
  queryKey: string[],
) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn,
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: T) => ({
        ...old,
        ...payload,
        isPending: true,
      }));
      return { prev };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(queryKey, ctx?.prev);
    },
  });
}
```

---

## 10. Telemetry & Error Handling

### 10.1 Telemetry Context

```typescript
// context/TelemetryContext.tsx
export const TelemetryContext = createContext<{
  emit: (type: 'action' | 'error', payload: any) => void;
}>(null!);

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const emit = (type: string, payload: any) => {
    const event = {
      type,
      timestamp: Date.now(),
      ...payload,
    };
    // Post to /api/telemetry or queue locally
    console.log('[Telemetry]', event);
  };
  
  return (
    <TelemetryContext.Provider value={{ emit }}>
      {children}
    </TelemetryContext.Provider>
  );
}
```

### 10.2 Actions & Errors

```typescript
// hooks/useTelemetry.ts
export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  return {
    emit: (type: string, payload: any) => ctx.emit(type, payload),
    action: (name: string, details?: any) =>
      ctx.emit('action', { name, details, route: usePathname() }),
    error: (name: string, error: Error, context?: any) =>
      ctx.emit('error', { name, message: error.message, context, route: usePathname() }),
  };
}
```

---

## 11. White-Labeling & Runtime Branding

### 11.1 Theme Provider

```typescript
// components/branding/ThemeProvider.tsx
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const partnerId = usePartnerId(); // From context
  const [theme, setTheme] = useState<Theme>();
  
  useEffect(() => {
    // Fetch /api/gr/branding?partner_id=X or hardcode Partner 1-10 themes
    fetch(`/api/branding?partner_id=${partnerId}`)
      .then(r => r.json())
      .then(t => setTheme(t));
  }, [partnerId]);
  
  return (
    <style>{`
      :root {
        --primary: ${theme?.primaryColor};
        --logo-url: url('${theme?.logoUrl}');
        --company-name: ${theme?.companyName};
      }
    `}</style>
  );
}
```

### 11.2 Branding Component

```typescript
// components/branding/PartnerBranding.tsx
export function PartnerBranding() {
  const theme = useContext(ThemeContext);
  
  return (
    <div className="flex items-center gap-2">
      <img src={theme.logoUrl} alt={theme.companyName} className="h-6" />
      <span className="font-bold">{theme.companyName}</span>
    </div>
  );
}
```

---

## 12. Accessibility Standards

Every component must meet:
- **WCAG 2.1 AA**: Color contrast, keyboard navigation
- **Semantic HTML**: `<button>`, `<input>`, `<label>` with `htmlFor`
- **ARIA Labels**: `aria-label` on icon buttons, `aria-live` on alerts
- **Keyboard**: Tab order, Enter/Space for buttons, Escape for modals
- **Responsive**: Mobile-first, tested on 320px–1920px

---

## 13. Testing Strategy

### 13.1 Unit Tests (component logic)
- Button click handlers → verify mutation called
- Input validation → verify error message rendered
- Feature flag checks → verify route hidden/shown

### 13.2 Integration Tests (page + data hooks)
- Dashboard load → verify balance + yield rendered
- Send form → quote fetched → form updated
- Send submit → idempotency key sent → mutation succeeds

### 13.3 E2E Smoke (critical flows only)
- Login → dashboard → send quote → submit → success
- Dashboard → history → export CSV
- Scheduled send → create → list shows → edit → cancel

**Test Framework**: Vitest + React Testing Library + Playwright (e2e)

---

## 14. Definition of Done (Component)

A component is launch-ready when:

1. ✅ Implements feature flag checks (if applicable)
2. ✅ Validates ownership guard (if account-scoped)
3. ✅ Uses BFF contract (no direct backend calls)
4. ✅ Handles errors + loading + empty states
5. ✅ All submit actions include idempotency keys
6. ✅ Emits telemetry (action + error)
7. ✅ Responsive + accessible (WCAG 2.1 AA)
8. ✅ Unit + integration tests pass
9. ✅ Types generated from BFF schema (Zod validated)
10. ✅ Code reviewed by Frontend Lead + QA signed off

---

## 15. Immediate Build Order (Week 2–4)

**Week 2:**
- [ ] Providers root tree + context setup
- [ ] BFF routes: `/dashboard`, `/yield`, `/history` (GET)
- [ ] Hooks: `useBFFData`, `useGenesisVault`, `useYieldSnapshot`
- [ ] Dashboard page + BalanceCard + AccountSwitcher
- [ ] Sidebar + feature-aware nav

**Week 3:**
- [ ] Send flow: `/send` route, SendForm, quote fetch
- [ ] Send submit: idempotency + optimistic update
- [ ] History page + HistoryTable + CSV export
- [ ] Scheduled sends (create/list/edit)
- [ ] Batch operations (upload + preview + submit)

**Week 4:**
- [ ] Invoicing lifecycle
- [ ] Analytics dashboards
- [ ] Compliance gate integration
- [ ] Audit logs (admin)
- [ ] White-labeling + theme resolution

**Week 5:**
- [ ] Mobile readiness (responsive + native parity)
- [ ] Canary RC build + smoke tests
- [ ] Performance + accessibility audit

---

This Frontend Architecture is the execution blueprint. Every component, hook, and route listed here has a specific purpose in the launch flow.
