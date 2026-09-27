# RetailIQ — Unified Retail Intelligence on Snowflake

RetailIQ is a demo shopper-intelligence app for a multi-store retailer and its brand partners. Sales, products, stores, shoppers, and partner agreements all live in **one governed copy in Snowflake**. Every persona (merchant, category manager, vendor) works from that same data and sees exactly the slice they are entitled to.

![Dashboard](docs/images/dashboard.jpg)

---

## Why unified data matters

Retail data usually sits in separate systems: POS transactions in one warehouse, the product master in another, loyalty and shopper profiles in a CRM, and vendor agreements in a shared drive. Each team exports its own copy, the numbers drift, and sharing data with a brand partner means building yet another extract.

With everything unified in Snowflake, RetailIQ unlocks:

| Capability | What it takes when data is siloed | With unified data |
|---|---|---|
| **Market-basket analysis** | Joining POS and product masters by hand | "What sells with Greek yogurt?" answered in seconds |
| **Shopper cohorts** | CRM and POS teams trading files | Build a segment like "bought Kraft in the last 30 days" and size it instantly |
| **Vendor collaboration** | Custom extracts for every brand | Vendors log in and see *only their brands*, enforced by the database |
| **Conversational analytics** | An analyst writing SQL for each question | Ask the AI Assistant in plain English and get governed answers with charts |
| **One version of the truth** | Each dashboard with its own numbers | Every screen, persona, and AI answer reads the same tables through the same policies |

---

## Personas and workflows

| Persona | Demo login | What they see | Typical workflow |
|---|---|---|---|
| **Retail admin / merchant** | `admin@retailiq.com` / `admin123` | All categories, stores, and brands, plus the Admin Portal | Monitor chain performance, manage who sees what, keep the demo data current |
| **Category manager (Dairy)** | `dairy_manager@retailiq.com` / `dairy123` | Dairy products and the baskets that contain them | Track category sales, find cross-sell partners, build cohorts for promotions |
| **Vendor (Kraft)** | `kraft_vendor@retailiq.com` / `kraft123` | Kraft-brand products only, across categories | Review brand velocity by store and share insights with the retailer |
| **Store operations** | admin login (or any scope with the Operations modules) | Store performance, assortment, and SKU velocity | Spot under-performing stores, check what each store carries and how fast it moves |
| **Marketing / activation** | admin login (or any scope with Audience + Activation) | Cohorts, campaigns, automations | Size an audience, launch a promotion or sponsored listing, automate follow-ups |

> These are local demo credentials seeded by `init_postgres.py`. Change them for any shared deployment.

Three more scopes are seeded and ready to assign from **Admin → Users**: *Beverages & Snacks Team*, *Produce Manager*, and *Coca-Cola Vendor* (roles `RETAILIQ_ROLE_BEV_SNACKS`, `_PRODUCE_MANAGER`, `_COCACOLA_VENDOR`).

---

## Feature tour

### Sales Analytics
Category trends, top products, and period-over-period comparisons.

![Sales analytics](docs/images/sales-analytics.jpg)

Pick a category, brand, or product and RetailIQ draws a control chart: mean, ±2σ bands, and flagged anomaly days.

![Category sales control chart](docs/images/category-sales.jpg)

### Market Basket
"What else is in the basket?" Choose a product and see the items bought with it most often, across every category.

![Market basket](docs/images/market-basket.jpg)

### Store Performance
Revenue, traffic, and basket size by store and region.

![Store performance](docs/images/store-performance.jpg)

### Store Assortment and SKU velocity
Pick a store to see every product it carries, ranked by units sold per week over the last four weeks.

![Store assortment](docs/images/store-assortment.jpg)

### Shopper Cohorts
Define an audience from behavior (who bought what, and when), build segments, and expand to look-alikes.

![Shopper cohorts](docs/images/shopper-cohorts.jpg)

### AI Assistant (Cortex Agent)
Ask questions in plain English. A Snowflake Cortex Agent answers over a Semantic View, returning the numbers, a chart, and the SQL it ran. It runs **under the user's role**, so it can only see what the user is allowed to see.

![AI assistant](docs/images/ai-assistant.jpg)

### Campaigns
Price promotions, sponsored listings, and onsite/offsite display ads, targeted at products and cohorts.

![Campaign builder](docs/images/campaign-builder.jpg)

### Automations
When/then rules over products, inventory, shoppers, and stores. Start from a template (high-inventory clearance, replenishment reminder, slow-mover alert, and more) or from scratch.

![Automations](docs/images/automations.jpg)

![Automation builder](docs/images/automation-builder.jpg)

### Partner Agreements (document AI)
Upload a partner agreement. Snowflake `AI_PARSE_DOCUMENT` extracts the text, and Cortex `COMPLETE` answers questions about it.

![Agreement Q&A](docs/images/agreements-qa.jpg)

---

## Governance: control data visibility with row access policies

Access is enforced **in Snowflake**, not in the app. Each app user maps to a *scope*, and each scope maps to a Snowflake role (`RETAILIQ_ROLE_*`). Every query runs as that role. Snowflake **row access policies** on `products`, `transactions`, and `transaction_items` then filter rows against a small `role_entitlements` table:

```sql
-- products_policy (simplified)
EXISTS (SELECT 1 FROM role_entitlements
        WHERE role_name = CURRENT_ROLE()
          AND (tenant_type = 'all'
               OR (tenant_type = 'category' AND tenant_id = category)
               OR (tenant_type = 'brand'    AND tenant_id = brand)))
```

Granting a vendor access to a new brand is one `INSERT` into `role_entitlements`. No code change, no new extract, and the dashboards, APIs, and AI Assistant all pick it up at once.

**Same screen, different entitlement.** The admin sees the full catalog (254 products, 10 categories):

![Admin product catalog](docs/images/rbac-admin-product-catalog.jpg)

The Dairy manager opening Sales Analytics sees only the Dairy category, because the database filtered everything else out:

![Dairy manager sales](docs/images/rbac-dairy-sales.jpg)

Module access is gated too. The Dairy scope doesn't include the Product Catalog module:

![Dairy manager blocked from catalog](docs/images/rbac-dairy-product-catalog.jpg)

### Admin Portal

**Users**: assign each person a scope.

![Admin users](docs/images/admin-users.jpg)

**Scope Management**: define scopes, their Snowflake role, and their category or brand entitlements.

![Admin scopes](docs/images/admin-scopes.jpg)

**Active Modules**: turn features on or off globally, or by dataset dependency.

![Admin modules](docs/images/admin-modules.jpg)

**Dataset Connections**: shows which datasets back each module. This page is a configuration mockup: changes are saved but don't change runtime behavior.

![Dataset connections](docs/images/admin-datasets.jpg)

**Impersonation (partial).** The backend has `POST/DELETE /admin/impersonate/{scope_id}` endpoints, but the frontend doesn't call them, and they don't yet change the role queries run as. To see the app as a persona today, log in as that persona.

### Data Window: keeping a demo "current"

Synthetic data ages. A dataset generated in September looks stale by December, and "last 30 days" charts go empty. RetailIQ handles this in two ways:

1. **Automatic anchor.** At startup, the backend probes `MAX(transaction_date)` and treats that date as "today" for every relative window ("last 7/30/90 days", 4-week velocity). The UI always shows a full, consistent picture, whatever the calendar date.
2. **Admin top-up.** From **Admin → Other Config → Data Window**, an admin can extend the data forward to today. A background job appends new transactions with continuing IDs and valid foreign keys, then refreshes the anchor without a restart.

![Data window](docs/images/admin-data-window.jpg)

---

## Architecture

```
┌──────────────────────┐    JWT     ┌───────────────────────────┐
│ React + Vite + TW    │──────────▶│ FastAPI (backend/app)     │
│ frontend/            │◀──────────│  routes/*  auth, admin,   │
└──────────────────────┘            │  analytics, operations,   │
                                    │  cohorts, cortex_agent…   │
                                    └─────┬──────────────┬──────┘
                        app state (users, │              │ analytics as the user's role
                        scopes, modules,  │              │ (USE ROLE RETAILIQ_ROLE_*)
                        cohorts, jobs)    ▼              ▼
                           ┌────────────────────┐ ┌──────────────────────────────┐
                           │ Snowflake Postgres │ │ Snowflake RETAILIQ_ANALYTICS │
                           │  RETAILIQ_PG       │ │  tables + row access policies│
                           └────────────────────┘ │  RETAILIQ_SV (semantic view) │
                                                  │  RETAILIQ_AGENT (Cortex)     │
                                                  └──────────────────────────────┘
```

- **Frontend**: React 18, Vite, and Tailwind. `DateAnchorContext` supplies the anchor date to every page.
- **Backend**: FastAPI. A lifespan hook probes the date anchor, which is cached with a TTL and invalidated after a top-up. Snowflake calls go through a pooled connector that sets the role for each request.
- **App database**: Snowflake Postgres, connected with `sslmode=verify-ca`, holds users, scopes, modules, cohorts, and top-up jobs.

### Why app state lives in Postgres
Users, scopes, saved cohorts, automations, and job status are small, row-at-a-time OLTP writes. They need low-latency reads on every request, and they need to work *before* a Snowflake role has been chosen. Postgres suits that; Snowflake suits the analytics. Snowflake Postgres keeps both inside one Snowflake account, with one bill and one set of network policies.

**Cost note:** a Snowflake Postgres instance bills compute continuously while it is running. There is no auto-suspend. The smallest instance is roughly 0.85 credits/day (check `POSTGRES_COMPUTE` usage in your account). Run `ALTER POSTGRES INSTANCE RETAILIQ_PG SUSPEND;` when you aren't demoing, and `... RESUME;` before starting the backend. Suspending keeps the data.
- **Analytics**: the `RETAILIQ_ANALYTICS.PUBLIC` tables `transactions`, `transaction_items`, `products`, `stores`, `shoppers`, and `role_entitlements`, plus `USER_DOCUMENTS_STAGE`.
- **AI**: the `RETAILIQ_SV` semantic view feeds the `RETAILIQ_AGENT` Cortex Agent, called over REST with a PAT.

---

## Rebuild in a new Snowflake account

**Prerequisites:** Python 3.11+, Node 18+, and a Snowflake account where you can use ACCOUNTADMIN.

### 1. Snowflake objects
Edit the variables at the top of `backend/scripts/snowflake_setup.sql`, especially `app_user`, the user the app connects as. Then run the whole script as ACCOUNTADMIN. It creates `RETAILIQ_WH`, `RETAILIQ_ANALYTICS`, the tables, the stage, six `RETAILIQ_ROLE_*` roles granted to the app user, the entitlements, and the three row access policies.

### 2. Programmatic Access Token
```sql
ALTER USER <app_user> ADD PROGRAMMATIC ACCESS TOKEN RETAILIQ_APP_PAT DAYS_TO_EXPIRY = 90;
```
Don't restrict the PAT to a single role. The app switches between the `RETAILIQ_ROLE_*` roles for each request. Your account may also need a network policy or an authentication policy that allows PATs.

### 3. Snowflake Postgres (app state)
Create a Snowflake Postgres instance, for example `RETAILIQ_PG`, plus a network rule and policy that allow your client IP. Download the instance CA certificate for `verify-ca`, then create the `retailiq` database.

### 4. Configure
```bash
cp backend/.env.example backend/.env   # fill in values; keep it chmod 600
```

| Variable | Purpose |
|---|---|
| `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER` | Account identifier and the app user |
| `SNOWFLAKE_PASSWORD` | The PAT from step 2 (used as the password) |
| `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA` | `RETAILIQ_WH`, `RETAILIQ_ANALYTICS`, `PUBLIC` |
| `CORTEX_AGENT_NAME` | `RETAILIQ_AGENT` |
| `CORTEX_COMPLETE_MODEL` | Model for agreement Q&A (default `claude-sonnet-4-5`). Cortex retires models over time, so override it here if needed |
| `SNOWFLAKE_SETUP_ROLE` | Role for the data generator and loader (e.g. `ACCOUNTADMIN`) |
| `RETAILIQ_ANCHOR_PROBE_ROLE` | Role used to probe `MAX(transaction_date)` (default `RETAILIQ_ROLE_ADMIN`) |
| `RETAILIQ_ANCHOR_TTL_SECONDS` | How long the date anchor is cached (default 900) |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Snowflake Postgres connection |
| `POSTGRES_SSLMODE`, `POSTGRES_SSLROOTCERT` | `verify-ca` and the path to the instance CA certificate |
| `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRATION_HOURS` | App session tokens. Generate a long random secret |

If Snowflake is unreachable at startup, the backend still starts. The date anchor falls back to today's date and reports `available: false` at `/config/date-anchor`.

### 5. Load data and seed the app
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
SNOWFLAKE_SETUP_ROLE=ACCOUNTADMIN python scripts/generate_synthetic_data.py   # ~1 year of data ending today
python scripts/init_postgres.py                                                # users, scopes, modules
```

### 6. Semantic view and agent
Run `backend/scripts/retailiq_semantic_view.sql`, then `backend/scripts/retailiq_agent.sql`, as ACCOUNTADMIN (or any role with CREATE SEMANTIC VIEW / CREATE AGENT on the schema).

### 7. Run
```bash
# backend
cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8000
# frontend
cd frontend && npm install && npm run dev      # http://localhost:3000
```

### Keeping data fresh
Use **Admin → Other Config → Data Window**, or run it from the CLI:
```bash
python scripts/extend_synthetic_data.py --dry-run         # show the plan
python scripts/extend_synthetic_data.py --to 2026-12-31   # append through a date
```

### Gotchas
- **ACCOUNTADMIN sees zero rows.** It has no entry in `role_entitlements`. Query as `RETAILIQ_ROLE_ADMIN` instead.
- The loader truncates and appends into the typed DDL. Don't switch it to `write_pandas(overwrite=True)`, which recreates the tables with TEXT/FLOAT columns.
- The top-up role needs `CREATE STAGE` on the schema, because `write_pandas` stages files.

---

## Known limitations (demo code)

This is a demo, not production-hardened. Before exposing it beyond a trusted network:

- **SQL built with string interpolation.** Many queries in `backend/app/routes/agreements.py` interpolate `document_id` (a URL path value) and other fields instead of binding them. So do `backend/app/utils.py` (filter helper) and `backend/app/routes/operations.py` (assortment filters). Switch these to bind parameters, as the agreement Q&A query now does.
- **Error detail leaks.** `/config/date-anchor` and several error responses return the raw connector message, which can include the account hostname. Log it server-side and return a generic message instead.
- **Demo credentials** are seeded in plain text by `init_postgres.py`, and the login page accepts sign-ups.
- **Local-first storage.** JWTs are stored in `localStorage`.

## License
Demo/sample code provided as-is.
