# Atlas.AI — AI Upskilling Platform ("Red Button")

A cross-platform application (iOS, Android, Web) built with Expo, React Native Web, TypeScript, and Supabase that eliminates "AI overwhelm" for working developers by pairing a real-time actionable AI news feed with a self-updating learning roadmap DAG.

---

## Repository Structure

```
/apps
  /mobile-web        # Expo app (iOS, Android, Web) using Expo Router & TypeScript
/packages
  /graph             # Pure TypeScript roadmap DAG validation, injection, and override logic (no I/O)
  /schemas           # Shared Zod validation schemas and TypeScript types
  /llm               # Provider-agnostic LLM interface, prompts, and eval harness
/supabase
  /migrations        # Versioned PostgreSQL database migrations
  /functions         # Supabase Edge Functions (news ingestion, verdicts, guides)
  config.toml        # Local Supabase configuration
/evals
  /golden            # Golden-set test cases in JSON format for verdict evals
/docs
  PRD.md             # Product Requirements Document (single source of truth)
  PROGRESS.md        # Migration progress and agent handoff state
  decisions.md       # Architectural and implementation decisions log
```

---

## Prerequisites

- **Node.js**: `v20.x` LTS or later (tested on `v26.x`)
- **pnpm**: `v10.x` or `v12.x` (`npm i -g pnpm`)
- **Docker Desktop**: Required for local Supabase containers (`supabase start`)

---

## Getting Started

### 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

### 2. Environment Configuration

Copy the environment template files:

```bash
# Root environment configuration (backend & services)
cp .env.example .env

# Client environment configuration (Expo mobile-web)
cp apps/mobile-web/.env.example apps/mobile-web/.env
```

Update values in `.env` and `apps/mobile-web/.env` with your local or staging keys as needed. Never commit `.env` files to git.

### 3. Run the Web Application

Start the Expo development server:

```bash
pnpm web
# Or:
pnpm dev
```

Open [http://localhost:8081](http://localhost:8081) in your browser to view the app with the Feed and Roadmap placeholder tabs.

For mobile platforms (simulators/emulators):

```bash
pnpm ios       # Open in iOS simulator
pnpm android   # Open in Android emulator
```

### 4. Run Tests & Validation

```bash
# Run Vitest test suites across all packages
pnpm test

# Run TypeScript strict type-checking across packages and apps
pnpm typecheck

# Run ESLint across the codebase
pnpm lint

# Format code with Prettier
pnpm format
```

### 5. Local Database (Supabase)

```bash
# Start local Supabase containers (requires Docker Desktop running)
pnpm db:start

# Reset database and apply migrations
pnpm db:reset

# Apply latest migrations
pnpm db:migrate
```
