# Deployment

The app is a standard Next.js 16 server-rendered application. It needs a Node
runtime — it is not a static export, because authentication and session refresh
run server-side in `src/proxy.ts`.

```bash
npm ci
npm run build
npm run start          # listens on $PORT, default 3000
```

Two environment variables are all it takes to point at a real backend:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Both are `NEXT_PUBLIC_*`, so they are **inlined at build time**. Set them before
running `npm run build`, and rebuild whenever they change. The anon key is
designed to be public — row-level security, not key secrecy, is what protects
the data.

---

## Hostinger (VPS or Cloud plan with Node.js)

Shared hosting cannot run this; you need a plan with SSH and Node.js — a VPS,
or Cloud hosting with the Node.js application feature.

### 1. Prepare the server

```bash
ssh root@your-server-ip

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git
npm install -g pm2
```

### 2. Deploy the code

```bash
mkdir -p /var/www/atlas-stays && cd /var/www/atlas-stays
git clone <your-repo-url> .

cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
PORT=3000
EOF

npm ci
npm run build
```

### 3. Keep it running

```bash
pm2 start npm --name atlas-stays -- run start
pm2 save
pm2 startup        # run the command it prints, so it survives a reboot
```

Useful afterwards: `pm2 logs atlas-stays`, `pm2 restart atlas-stays`,
`pm2 monit`.

### 4. Put Nginx in front of it

`/etc/nginx/sites-available/atlas-stays`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Required for Supabase Realtime's websocket upgrade.
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        'upgrade';

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass                 $http_upgrade;
    }

    # Hashed build output never changes under a given name.
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

```bash
ln -s /etc/nginx/sites-available/atlas-stays /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 5. SSL

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot installs its own renewal timer; nothing further to schedule.

### 6. Point Supabase at the domain

In the Supabase dashboard, **Authentication → URL Configuration**:

- Site URL: `https://your-domain.com`
- Redirect URLs: `https://your-domain.com/**`

Without this, password-reset links come back to `localhost`.

### Updating a deployment

```bash
cd /var/www/atlas-stays
git pull
npm ci
npm run build
pm2 restart atlas-stays
```

Consider putting that in `deploy.sh` and running it from CI.

---

## Hostinger's Node.js application UI

If your plan exposes the Node.js panel rather than raw SSH:

| Field | Value |
|---|---|
| Application root | your upload directory |
| Application URL | your domain |
| Application startup file | `node_modules/next/dist/bin/next` |
| Node version | 20 or 22 |
| Startup arguments | `start` |

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under
environment variables, then run `npm ci && npm run build` from the panel's
terminal (or upload a locally built `.next` directory together with
`package.json`, `node_modules`, `public` and `next.config.ts`).

---

## Vercel

```bash
npm i -g vercel
vercel
```

Add the two environment variables in the project settings and redeploy. No
other configuration is needed.

---

## Docker

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time, so they must be present here.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "run", "start"]
```

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  -t atlas-stays .

docker run -p 3000:3000 atlas-stays
```

---

## Pre-flight checklist

- [ ] `0001_init.sql` and `0002_bootstrap.sql` executed on the Supabase project
- [ ] First user created and `bootstrap_workspace(...)` run for their email
- [ ] Environment variables set **before** `npm run build`
- [ ] Supabase Site URL and redirect URLs point at the production domain
- [ ] `npm run build` completes locally without errors
- [ ] HTTPS enabled — Supabase auth cookies are marked `Secure`
- [ ] Process manager configured to restart on boot
