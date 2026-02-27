# Splitter

A shared expense splitting app built on Cloudflare Pages + Workers KV.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- A [Cloudflare](https://cloudflare.com) account

## Setup

```bash
pnpm install
```

## Configuration

### 1. Create a Cloudflare Pages project

```bash
pnpm wrangler pages project create splitter
```

### 2. Create a KV namespace

```bash
pnpm wrangler kv namespace create SPLITTER_KV
```

Copy the `id` from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SPLITTER_KV"
id = "<your-kv-namespace-id>"
```

### 3. Generate VAPID keys (one-time, per project)

VAPID keys are required for Web Push notifications. Generate them once and store them — **do not regenerate** after users have subscribed or their subscriptions will break.

```bash
npx tsx scripts/generate-vapid-keys.ts
```

Output example:
```
Add to wrangler.toml [vars]:
VAPID_PUBLIC_KEY = "BExamplePublicKey..."

Add to .dev.vars (and wrangler secret put for production):
VAPID_PRIVATE_KEY=ExamplePrivateKey...
```

**Public key** → add to `wrangler.toml` under `[vars]`:
```toml
VAPID_PUBLIC_KEY = "BExamplePublicKey..."
VAPID_SUBJECT = "mailto:admin@split.vietcha.in"
```

**Private key** → add to `.dev.vars` for local development:
```
VAPID_PRIVATE_KEY=ExamplePrivateKey...
```

**Private key** → set as a Cloudflare secret for production (never commit this):
```bash
pnpm wrangler pages secret put VAPID_PRIVATE_KEY --project-name splitter
```

### 4. Set production secrets

Set these via the Cloudflare dashboard or wrangler CLI — do not commit them:

```bash
# A secure random string, at least 32 characters
pnpm wrangler pages secret put JWT_SECRET --project-name splitter

# Already handled above
pnpm wrangler pages secret put VAPID_PRIVATE_KEY --project-name splitter
```

### 5. Update domain config in `wrangler.toml`

```toml
[vars]
RP_ID = "split.vietcha.in"
RP_NAME = "Splitter"
RP_ORIGIN = "https://split.vietcha.in"
VAPID_SUBJECT = "mailto:admin@split.vietcha.in"
```

## Local Development

Create a `.dev.vars` file (gitignored) with your local secrets:

```
JWT_SECRET=dev-secret-not-for-production-use-only
DEV_MODE=true
VAPID_PRIVATE_KEY=<your-generated-private-key>
```

Then run:

```bash
pnpm dev
```

## Deployment

```bash
pnpm build
pnpm wrangler pages deploy dist --project-name splitter
```
