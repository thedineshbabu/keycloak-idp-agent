# Talents Suite Platform — Agent Context

## 1. Platform Overview

The Talents Suite Platform (KFOne) is an enterprise talent management solution serving 40,000+ clients
with 1000+ identity provider (IDP) configurations. The platform handles single sign-on (SSO)
authentication via Keycloak, client and user management, role-based access control, product
entitlements, and HR data integration for enterprise talent management workflows.

Key facts:
- Active clients: ~40,000+
- Identity providers: 2000+ client IDPs
- Auth protocol: SAML 2.0 (primary)
- Primary identity layer: Keycloak 26 (custom-configured with 6 SPI plugins)
- LLM providers: Gemini 2.0 Flash (default), OpenAI GPT-4o
- Observability: Datadog (logs, traces, metrics, monitors — optional)
- Cloud: AWS (primary) + OpenShift (container orchestration)
- Environments: sbx, dev, dv2, qa1, stg, prd
- AWS Regions: us-east-1 (primary), eu-central-1, eu-west-1, us-west-2, ap-southeast-2

Products on the platform:
- KF Pay (compensation benchmarking, reports, peer groups)
- KF Architect (job evaluation, grading)
- Success Profile Manager (competencies, skills, HCM)
- KF Assess (candidate assessments)
- KF Select (talent acquisition, assessment projects)
- KF Insights (Tableau dashboards, enterprise data warehouse)
- KF Listen (survey analytics, benchmarking)
- KF Nimble Recruit (recruitment, Azure AKS — architecturally separate)
- Pay Equity (statistical analysis, gap reporting)
- Pay Data Collection (survey intake, data submission)
- Pay Analytics (benchmarking, SJP, Elasticsearch)
- Participant Portal (assessments, learning, coaching — 22 MFE remotes)
- Campaign Workflows (KF360, assessment orchestration)
- Knowledge Base (support articles, CMS sync)
- Content Library, Job Mapping, Unified Client Portal, Talent Hub Portal

Canonical product identifiers (8): `KFASSESS`, `KFADVANCE`, `KFPAY`, `KFNR`, `KFARCHITECT`, `KFSELECT`, `KFLISTEN`, `PROFILEMANAGER`

---

## 2. User Authentication Flow

### Standard OIDC Login (Keycloak)

1. User navigates to Talents Suite landing page (kfone-landing-page, React 18 MFE host)
2. Landing page redirects to Keycloak OIDC login (`/realms/{realm}/protocol/openid-connect/token`)
3. Keycloak scope: `openid profile email`
4. If email domain matches a configured IDP, Keycloak's **Email Domain IdP Discovery** plugin routes to that IDP
5. IDP authenticates user, returns assertion to Keycloak
6. Keycloak validates assertion (SAML signature, OIDC id_token)
7. **KFTokenMapper** plugin enriches JWT with custom claims (realm_access roles, client context)
8. **KF1EventListener** plugin logs the authentication event
9. JWT token returned to landing page
10. Landing page calls IAM Service to validate/enrich token
11. IAM Service calls Lambda JWT authorizer (JWKS RS256 validation)
12. IAM Service checks user state: `is_locked`, `is_disabled`, `is_deleted` must all be `false`
13. IAM Service checks client state: `login_allowed=true` AND `is_active=true`
14. Privacy consent checked — must be `ACKNOWLEDGED` before product access
15. Core Service fetches user entitlements (products, client associations)
16. Landing page loads entitled MFE product applications
17. All subsequent API calls carry the JWT Bearer token
18. Product backends validate JWT via `kfone-core-common` AuthGuard (JWKS RS256)

### Five Identity Types

| Identity Type | Keycloak Mapping | Description |
|---|---|---|
| `ldap` | LDAP broker | LDAP/FreeIPA directory authentication |
| `local` | Direct Keycloak | Local Keycloak password authentication |
| `hub` | Hub token exchange | kfone-hub enterprise token exchange |
| `multi-rater` | MR authenticator | Multi-rater/360 feedback platform auth |
| `authtoken` | Hub authToken | Hub token → Keycloak session exchange |

### Alternative Authentication Flows

- **Magic Link:** User requests link → kfone-keycloak-service MagicLinkAuthenticator sends email → user clicks → action token handler completes OIDC flow
- **OTP:** IAM Service sends OTP code via `/v1/event/send-otp` → user enters code → session established
- **MS Teams Token Exchange:** Entra ID bearer token → extract email → client_credentials grant for `hm-ms-teams` client → exchange for user session tokens
- **Simulate-User:** Super-admin from `@kornferry.com`, `@haygroup.com`, or `@kornferryassociates.com` can create simulate-user sessions (never gets super admin role)
- **SAML SSO (via Hub):** `POST /sso/samlssocheck` receives SAMLRequest → extracts RequestID/username → redirects to IDP → `POST /sso/acs` processes SAMLResponse (1-hour validity window)

### Privacy Consent Lifecycle

Before accessing any product, users must have privacy consent status = `ACKNOWLEDGED`.

Consent statuses:
- `NOT_AVAILABLE` — no policy or no consent record exists
- `ACKNOWLEDGED` — user accepted
- `REJECTED` — user explicitly rejected
- `EXPIRE_OUTDATED` — consent expired by age (default 365 days)
- `EXPIRE_VERSION_UPDATED` — policy version changed

Consent groups: `DATACONTROLLER`, `DATAPROCESSOR`, `MIXED`, `CANDIDATE`, `B2CUSER`, `COMBINED`

### Token Refresh Workflow

1. Validate access token (min 10 characters, string type)
2. Decode JWT, extract `realm_access` roles
3. Check for super admin roles (AllClientsAccessRoles enum)
4. Validate clientId format (UUID v4: `/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`)
5. Resolve primary client if `usePrimaryClient=true` (exclusive-or with explicit clientId)
6. Switch client with Hub sync
7. Return new access + refresh tokens

Key technical details:
- SSL verification is disabled for all internal service calls (self-signed certs)
- The user's Keycloak access token is forwarded as-is to all downstream Core API and IAM API calls
- When KEYCLOAK_ENABLED=false (Docker development), a synthetic admin context is returned
- Token refresh interval: 120s with 30s expiry offset
- Failed login threshold: 5 unsuccessful attempts trigger automatic account lock (admin-initiated unlock only)

---

## 3. Microservices Architecture

### Platform Services

| Service | Purpose | Tech Stack | Key Endpoints |
|---|---|---|---|
| **IAM Service** | Identity & access management, IDP config, user lifecycle, RBAC, privacy consent, LDAP, Hub federation | NestJS 10, PostgreSQL, RabbitMQ, Lambda authorizer | 130+ endpoints across 26 controllers |
| **Core Service** | Client management, products, engagements, file upload, NiFi integration, currencies, industries | NestJS 10, PostgreSQL, RabbitMQ (11 consumers), Datadog | 80+ endpoints across 19 controllers |
| **Keycloak Service** | Auth orchestration, JWT issuance, 6 custom SPI plugins (magic link, IdP discovery, SAML, token mapper, event listener, Hub auth) | Java 17, Keycloak 26.4.7, PostgreSQL (ocp_keycloak, 88 tables) | Keycloak Admin REST API |
| **Hub** | Central API proxy to downstream systems (TQAS, webMethods IS, Pay, Architect, Talent Hub, etc.) | Java 17 Spring MVC 6.2, NestJS 11 (scheduler), Redis, Auth0+SAML | 50+ endpoints, 14+ downstream proxies |
| **Notification Service** | Platform notifications via Novu (in-app + email), RabbitMQ event-driven triggers | NestJS 10, PostgreSQL, RabbitMQ, Novu | Notifications, subscribers, topics, subscriptions, preferences |
| **HRMS Connector** | HRIS data sync from external providers (Workday, SAP, Merge API) in API mode + scheduler mode | NestJS 10, PostgreSQL, RabbitMQ, Merge API, Bree scheduler | Webhook/REST + batch sync |
| **IDW** | Data pipeline API, NiFi flow management, survey management, file upload | NestJS 10, PostgreSQL (insights_dw), 71 NiFi flows, 253 Yuniql versions | Data ingestion, file upload, survey mgmt |
| **Platform Agent (this app)** | AI-powered operations — IDP onboarding, chat, policy queries | FastAPI, PostgreSQL (idp_agent schema) | /chat, /onboard, /policy/query |

### Shared Libraries

| Library | Purpose | Consumers |
|---|---|---|
| **kfone-platform-common** | Multi-language shared libs (Node/.NET/Python), kfone_core_v2 schema owner | All NestJS services |
| **kfone-core-common** | NestJS IAM guards (AuthGuard — JWKS RS256), Keycloak/LDAP/JWT utilities | All NestJS product backends |
| **kfone-frontend-common** | React/Stencil/Angular libs, KeycloakProvider, i18n, state management | All frontend apps |
| **kfone-component-library** | React 18 ODS design system components (Storybook) | React apps |
| **kfone-common-lib** | Angular 16 shared libs (`@kf-products-core/kfhub_lib`) | Angular apps |

### Service Communication

- Frontend (React/Angular SPA) → Product App Backend (NestJS/Spring)
- Product App Backend → Core Service (client/product data, SSO attributes)
- Product App Backend → IAM Service (user/role management, IDP configs)
- Product App Backend → Hub (proxy to TQAS, webMethods IS, downstream systems)
- Platform Agent → Core Service, IAM Service, Keycloak Admin API
- All downstream calls use the user's forwarded Bearer token
- All internal HTTP calls use `verify=False` (self-signed certs)
- RabbitMQ for async events (notifications, Tableau sync, HRIS sync, user creation)

### Hub Downstream Proxies

The Hub acts as the central routing layer, proxying requests to 14+ downstream systems:

| Proxy Target | Purpose |
|---|---|
| webMethods IS | Legacy middleware (being phased out) |
| TQAS (TalentQ) | Assessment engine for KF Assess and KF Select |
| KF Architect Node API | Job evaluation |
| Success Profile Node API | Competency/skill models |
| Pay Reports / Pay HRIS | Compensation data |
| Pay Data Collection | Survey intake |
| Pay Equity | Statistical analysis |
| TH Portal | Talent Hub Portal |
| UCP | Unified Client Portal |
| Dashboard API | Platform dashboards |
| AI Auto / Job Mapping | AI-powered job classification |
| Client Tracking / CPT | Client participation tracking |
| Bulk Runner | Scheduler bulk operations |

---

## 4. Database Schema

### PostgreSQL — idp_agent schema (Platform Agent's own database)

#### llm_usage_logs
| Column | Type | Description |
|---|---|---|
| id | SERIAL | Primary key |
| operation | VARCHAR | e.g. chat, policy_query, onboard_idp |
| llm_provider | VARCHAR | openai or gemini |
| model | VARCHAR | Model name (gpt-4o, gemini-2.0-flash) |
| prompt_tokens | INT | Input tokens used |
| completion_tokens | INT | Output tokens used |
| estimated_cost_usd | NUMERIC | Calculated cost |
| duration_ms | INT | LLM call duration in milliseconds |
| success | BOOLEAN | Whether the LLM call succeeded |
| created_at | TIMESTAMPTZ | Timestamp |

#### chat_history
| Column | Type | Description |
|---|---|---|
| id | SERIAL | Primary key |
| session_id | UUID | Groups messages into conversations |
| user_sub | VARCHAR | Keycloak subject ID (user identifier) |
| user_email | VARCHAR | User's email address |
| role | VARCHAR | 'user' or 'assistant' |
| message | TEXT | The message content |
| created_at | TIMESTAMPTZ | Timestamp |

Database details:
- All tables live in the `idp_agent` schema
- Managed via psycopg2 (synchronous connections)
- Migrations under yuniql/scripts/ (versioned SQL)
- Connection search_path set to idp_agent, public

### PostgreSQL — kfone_core_v2 schema (Platform Core Data)

This is the shared platform schema owned by kfone-platform-common, consumed by IAM Service, Core Service, and others.

#### Client Management
| Table | Key Columns | Purpose |
|---|---|---|
| **client** | `client_key` (uuid PK), `client_code`, `client_name`, `country_key` (FK), `currency_key` (FK), `industry_key` (FK), `is_active`, `identity_type`, `parent_client_key`, `sap_client_id`, `tenant_id`, `login_allowed`, `is_subsidiary`, `is_deleted`, `is_integration_supported` | Core client/tenant entity |
| **client_cross_reference** | `client_cross_reference_id` (int PK), `client_key` (FK), `application`, `application_client_key` | Maps KFOne clients to external systems (SAP, Hub, KFNR) |
| **client_custom_attribute** | `client_custom_attribute_key` (uuid PK), `client_key` (FK), `key_name`, `value`, `is_active` | Flexible key-value attributes |
| **client_domain_mapping** | `client_domain_mapping_key` (uuid PK), `client_key` (FK), `domain_key` (FK) | Links clients to SSO domains |
| **domain** | `domain_key` (uuid PK), `domain_url`, `created_by` | SSO/IDP domain URLs (unique constraint on lowercase) |
| **domain_attributes** | `domain_attribute_key` (uuid PK), `domain_key` (FK), `domain_attribute_name`, `domain_attribute_value` | SAML metadata, OIDC endpoints, cert data |

#### User & Person Management
| Table | Key Columns | Purpose |
|---|---|---|
| **users** | `user_key` (uuid PK), `client_person_key` (FK), `email` (unique), `is_active`, `is_deleted`, `is_locked`, `is_suspended`, `is_revoked`, `has_logged_in`, `last_logged_in`, `is_test`, `is_synced_with_tableau` | Application user records |
| **user_client_association** | `user_client_key` (uuid PK), `user_key` (FK), `client_key` (FK), `is_primary`, `is_selected`, `is_hydrated` | Multi-tenant user-client mapping |
| **person** | `person_key` (uuid PK), `first_name`, `last_name` | Base person entity |
| **client_person** | `client_person_key` (uuid PK), `client_key` (FK), `person_key` (FK), `person_type`, `primary_email` | Client-scoped person record (EMPLOYEE, CONTACT, etc.) |
| **person_email** | `person_email_key` (uuid PK), `person_key` (FK), `email`, `client_key` (FK), `is_primary`, `is_active` | Multiple emails per person |
| **person_cross_reference** | `person_cross_reference_key` (uuid PK), `client_person_key` (FK), `application`, `application_person_id` | HRIS/external system IDs |
| **user_session** | `user_session_key` (uuid PK), `user_key` (FK), `auth_token`, `ps_session_id` | Active session tracking |
| **user_consent** | `user_consent_key` (uuid PK), `user_key` (FK), `client_key`, `privacy_policy_key` (FK), `consent_type`, `consented_timestamp`, `expiry_date` | GDPR/privacy consent records |

#### Employee & Position Hierarchy
| Table | Key Columns | Purpose |
|---|---|---|
| **employee** | `employee_key` (uuid PK), `client_person_key` (FK), `job_key` (FK), `employee_number`, `employment_status`, `grade_key` (FK), `manager_key`, `effective_start_date`, `effective_end_date` | Employee record per client |
| **job** | `job_key` (uuid PK), `client_key` (FK), `job_code`, `job_name`, `job_title`, `job_family_key` (FK), `grade_key` (FK), `is_executive` | Job master definitions |
| **job_family** / **job_sub_family** | family/sub-family keys, names | Job classification hierarchy |
| **grade** | `grade_key` (uuid PK), `grade_name`, `grade_level` | Compensation grade (Band 1-5 or custom) |
| **position** | `position_key` (uuid PK), `client_key` (FK), `job_key` (FK), `location_key` (FK), `position_code`, `position_type`, `is_active` | Headcount positions |
| **position_hierarchy_mapping** | `position_key` (FK), `parent_position_key` | Org chart reports-to relationships |
| **person_position** | `employee_key` (FK), `position_hierarchy_key` (FK), `start_date`, `end_date`, `is_active` | Employee-position assignment history |

#### Product & Entitlement Management
| Table | Key Columns | Purpose |
|---|---|---|
| **kf_product** | `product_key` (uuid PK), `product_name`, `offering_key` (FK), `is_active` | Platform product definitions |
| **kf_offering** | `offering_key` (uuid PK), `offering_name`, `offering_description` | Product group/offering |
| **kf_product_sku** | `product_sku_key` (uuid PK), `product_key` (FK), `sap_product_code`, `sku_type`, `is_active`, `country_key` | SKU variant (billable unit per country) |
| **client_product** | `client_product_key` (uuid PK), `client_key` (FK), `product_key` (FK) | Entitlement: client has access to product |
| **client_product_sku** | `client_product_sku_key` (uuid PK), `client_key` (FK), `product_sku_key` (FK), `units_purchased`, `units_utilized`, `effective_start_date`, `effective_end_date`, `status` | Subscription with quantity and consumption |

#### Engagement Management
| Table | Key Columns | Purpose |
|---|---|---|
| **client_engagement** | `engagement_key` (uuid PK), `client_key` (FK), `engagement_name`, `engagement_id`, `effective_start_date`, `effective_end_date` | Client project/engagement |
| **engagement_person** | `engagement_key` (FK), `person_key` (FK), `role_type` | Engagement participants |
| **engagement_product_sku** | `engagement_key` (FK), `product_sku_key` (FK), `units_purchased`, `units_utilized` | SKU allocation to engagement |

#### Reference Data
| Table | Purpose |
|---|---|
| **country** | ISO countries (`country_key`, `country_code`, `country_name`) |
| **currency** | Currencies (`currency_key`, `currency_code`, `currency_symbol`) |
| **region** | Geographic regions (Americas, EMEA, APAC) |
| **industry** / **industry_sector** / **industry_segment** | Client industry classification |
| **location** | Office/work locations with JSON details |
| **languages** | Supported languages with locale and translation tier |
| **kf_date_format** / **time_format** / **time_zone** | Localization defaults |

#### Data Import & HRIS Sync
| Table | Purpose |
|---|---|
| **client_import_master** | HRIS/SAP import job tracking per client |
| **import_status** | Per-entity import result summary |
| **hris_job_queue** / **hris_job_queue_history** | Async HRIS sync job queue and history |
| **client_ext_connect_config** | Client-specific integration config (JSON) |

### PostgreSQL — iam schema (IAM Service)

#### Role & Permission Management
| Table | Key Columns | Purpose |
|---|---|---|
| **iam.roles** | `role_key` (uuid PK), `role_name`, `client_key` (FK), `is_active`, `is_admin`, `system_generated` | Role definitions per client |
| **iam.role_permission** | `role_key` (FK), `permission_key` (FK) | Role-permission mapping |
| **iam.permissions** | `permission_key` (uuid PK), `permission_name`, `resource_key` (FK), `scope_key` (FK), `grant_type`, `is_active` | Fine-grained permissions |
| **iam.resources** | `resource_key` (uuid PK), `resource_name`, `resource_type_key` (FK), `is_admin_only` | Protected resources |
| **iam.resource_types** | `resource_type_key` (uuid PK), `resource_type_name` | Resource types (UI_SCREEN, DATA_TABLE, API_ENDPOINT) |
| **iam.scopes** | `scope_key` (uuid PK), `scope_name`, `scope_type` | Permission scopes (client, department, manager_reports) |

#### User Groups & Teams
| Table | Key Columns | Purpose |
|---|---|---|
| **iam.user_groups** | `user_group_key` (uuid PK), `group_name`, `client_key` (FK), `group_type`, `is_system_generated` | Group/team definitions |
| **iam.users_user_groups** | `user_key`, `user_group_key` (FK), `is_primary` | User-group membership |
| **iam.user_group_roles** | `user_group_key` (FK), `role_key` (FK) | Roles granted to groups |
| **iam.user_permission** | `user_key`, `permission_key` (FK) | Direct user permissions (overrides group) |
| **iam.user_attributes** | `user_key`, `attribute_name`, `attribute_value`, `product_key` | User attributes for policy evaluation |

#### Subscription & Licensing
| Table | Purpose |
|---|---|
| **iam.product_subscription** | IAM subscription mapping (product → billing entity) |
| **iam.product_role_mapping** | Products available to roles |
| **iam.client_subscription** | Client-subscription-resource linkage |
| **iam.profile_collection** / **iam.profile_collection_user_group** | Named profile collections assigned to groups |

### PostgreSQL — knowledgebase schema

| Table | Key Columns | Purpose |
|---|---|---|
| **articles** | `article_key` (uuid PK), `catalogue_key` (FK), `product_area`, `experience_area`, `owner_team`, `is_deleted` | Support/help articles |
| **article_content** | `article_key` (FK), `language_key`, `title`, `content_html` | Multilingual article content |
| **article_versions** | `article_key` (FK), `article_version`, `cms_version`, `is_active` | Version control |
| **article_feedback** | `article_key` (FK), `hashed_user_id`, `is_helpful`, `user_comment` | User feedback |
| **catalogue** | `catalogue_key` (uuid PK), `parent_catalogue_key` (FK), `catalogue_code`, `slug`, `is_active` | Hierarchical content organization |
| **tags** / **article_tags** | Tag reference and article tagging | Content discovery |

### PostgreSQL — notification schema

| Table | Key Columns | Purpose |
|---|---|---|
| **notification_preferences** | `user_key`, `notification_type`, `preferences` (json) | Per-user opt-in/out and channel preferences |
| **subscriber_lookup** | `subscriber_id` (PK), `user_key`, `client_key`, `sync_status` | Novu subscriber lifecycle |
| **subscription_lookup** | `subscription_id` (PK), `subscriber_id`, `topic_key`, `user_key` | User subscriptions to notification topics |
| **topic_lookup** | `topic_key` (PK), `client_key`, `group_name`, `sync_status` | Notification topics |
| **sync_watermark** | `entity_type` (PK), `last_successful_run`, `records_processed` | Delta sync state for NiFi pipelines |

### Key Data Relationships

1. **User Access Resolution:** `users` → `user_client_association` → `client_key` + `iam.users_user_groups` → `iam.roles` → `iam.role_permission` → `iam.permissions`
2. **Client Enablement:** `client` → `client_product` → `kf_product` + `client_product_sku` → `kf_product_sku`
3. **Org Chart:** `employee` → `person_position` → `position` → `position_hierarchy_mapping` → `parent_position_key` (recursive)
4. **Identity/SSO:** `client` → `client_domain_mapping` → `domain` → `domain_attributes` (SAML/OIDC config)
5. **Employee History:** `client_person` → `person_cross_reference` (HRIS ID) + `employee` (record) + `person_position` (timeline)

---

## 5. Key APIs

### Platform Agent API (this application)
- POST /chat — Multi-service conversational interface (LLM function-calling with 51 tools)
- GET /chat/sessions — List user's chat sessions
- GET /chat/sessions/{session_id} — Get messages for a session
- POST /onboard — Onboard a new IDP via LLM-guided workflow
- POST /update — Update an existing IDP configuration
- POST /policy/query — Natural-language Keycloak policy queries
- GET /policy/realms — List available Keycloak realms
- GET /usage/summary — LLM usage analytics (last 30 days)
- GET /usage/by-provider — Usage breakdown by LLM provider
- GET /usage/timeline — Daily usage timeline
- GET /config — Expose rate limit and provider config

### Core Service (80+ endpoints across 19 controllers)

#### Clients (`/v2/clients`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v2/clients` | Create client |
| PUT | `/v2/clients` | Update client (requires `client_key` query) |
| DELETE | `/v2/clients` | Delete client (requires `client_key` query) |
| GET | `/v2/clients` | Get all clients with pagination, sorting, filtering |
| GET | `/v2/clients/list` | Get all clients for KFNR request |
| GET | `/v2/clients/lookup` | Get client by attribute (name/value) |
| GET | `/v2/clients/search-by-name/:name` | Search client by name |
| GET | `/v2/clients/by-pams/:pamsId` | Get client by PAMS ID |
| GET | `/v2/clients/by-id/:id` | Get client by ID |
| GET | `/v2/clients/listbyIds` | Get clients by multiple IDs |
| GET | `/v2/clients/entity_group/summary` | Get entity group summary |
| GET | `/v2/clients/accessibleclients` | Get accessible clients for user |
| GET | `/v2/clients/login-mode` | Get client login mode (by email) |
| GET | `/v2/clients/subsidiaries` | Get subsidiaries for client |
| GET | `/v2/clients/client-config/:id` | Get client configuration |
| GET | `/v2/clients/customAttributes` | Get client custom/SSO attributes (by domainUrl) |
| GET | `/v2/clients/confidentiality/:clientKey` | Get client confidentiality settings |
| GET | `/v2/clients/by-countries` | Get clients by countries |
| GET | `/v2/clients/hris-config` | Get HRIS configuration |
| GET | `/v2/clients/hris-config-credentials` | Get HRIS config credentials |
| GET | `/v2/clients/spexportsupported` | Check SP export support |
| GET | `/v2/clients/sync/error-report/download` | Download sync error report (CSV) |
| POST | `/v2/clients/subsidiaries` | Create/upsert subsidiary clients |
| POST | `/v2/clients/searchClientsByPamsId` | Search clients by PAMS ID |
| POST | `/v2/clients/customAttributes` | Create custom/SSO attributes |
| POST | `/v2/clients/ldap/client/ou` | Configure LDAP OU |
| PUT | `/v2/clients/customAttributes` | Update custom attributes (upsert) |
| PUT | `/v2/clients/product-integrations` | Update product integrations |
| PUT | `/v2/clients/confidentiality/:clientKey` | Update confidentiality settings |

#### Products (`/v2/products`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/v2/products` | Get products by client key |
| GET | `/v2/products/getActiveProducts` | Get all active products |
| GET | `/v2/products/getProductList` | Get complete product list |
| POST | `/v2/products` | Fetch products for offering(s) |

#### Product SKUs, Offerings, Reference Data
| Method | Path | Purpose |
|---|---|---|
| POST | `/v2/productskus` | Fetch product SKUs for product |
| GET | `/v2/offerings` | Get all offerings |
| GET | `/v2/currencies` | Get currencies |
| GET | `/v2/countries` | Get countries |
| GET | `/v2/industries` | Get all industries |
| GET | `/v2/industries/:key` | Get industry by key |
| GET | `/v2/industry-sectors` | Get industry sectors |
| GET | `/v2/industry-segments` | Get industry segments |

#### Engagements (`/v2/engagements`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/v2/engagements` | Get client engagements (paginated, requires `client_Key`) |
| POST | `/v2/engagements` | Create client engagement |
| PUT | `/v2/engagements` | Update client engagement |

#### Metadata (`/v2/metaData`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/v2/metaData/raw` | Get all preference metadata |
| GET | `/v2/metaData/country/:countryKey/timezones` | Get timezones by country |
| GET | `/v2/metaData/region/:regionKey/countries` | Get countries by region |
| GET | `/v2/metaData/languages` | Get all languages |

#### Product Maintenance (`/v2/product-maintenance`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/v2/product-maintenance` | Get upcoming product maintenance |
| POST | `/v2/product-maintenance` | Create maintenance record |
| PUT | `/v2/product-maintenance/:key/status` | Update maintenance status |
| POST | `/v2/product-maintenance/update-maintenance-page` | Upload maintenance page to S3 |

#### File Upload (`/v2/file-upload`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v2/file-upload` | Upload and validate files (employee, job, location) |
| GET | `/v2/file-upload/nifi-process-status` | Get NiFi process status |
| POST | `/v2/file-upload/nifi-trigger-processor-byid` | Trigger NiFi processor |

#### Other Core Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/v2/error-report` | Get job error report (requires `client_key`, `moduleName`) |
| GET | `/v2/datadog/token` | Get Datadog RUM client token |
| GET | `/hub-auth/status` | Get Hub auth token status |
| GET | `/hub-auth/refresh` | Force refresh Hub auth token |
| POST | `/v2/psa-orders/process-xml` | Process PSA order XML |
| POST | `/v2/psa-orders/process-order` | Process staging order into engagement |
| GET | `/v2/psa-orders` | Get PSA staging orders |
| PUT | `/v2/psa-orders` | Update PSA staging order |
| GET | `/v2/system/cache` | Fetch all cache keys |
| DELETE | `/v2/system/cache` | Delete cache key |
| GET | `/healthCheck` | Full health check (DB + RabbitMQ) |

### IAM Service (130+ endpoints across 26 controllers)

#### Authentication (`/v1/auth`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/auth/login` | Login with identity type (LDAP, LOCAL, HUB, AUTHTOKEN, MR) |
| POST | `/v1/auth/refresh-token` | Refresh access token with client switching |
| GET | `/v1/auth/validate-token` | Validate JWT token |
| GET | `/v1/auth/permissions` | Get user permissions |
| GET | `/v1/auth/allow` | Check specific permission |
| POST | `/v1/auth/uam-token` | Get UAM token |
| POST | `/v1/auth/hm/token` | MS Teams/Entra ID token exchange |
| POST | `/v1/auth/simulate-user` | Simulate user session (super-admin only) |

#### Users V2 (`/v2/users`) — 35 endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/v2/users/search` | Search users by email/query |
| GET | `/v2/users/details` | Get user details by email |
| GET | `/v2/users/:id` | Get user by ID |
| GET | `/v2/users/:id/details` | Get detailed user info |
| GET | `/v2/users/:id/client-associations` | Get client associations |
| GET | `/v2/users/:client_key/list` | List users by client key |
| GET | `/v2/users/by-clientid/:clientId` | List users by client ID |
| GET | `/v2/users/by-pamsid` | Get user by PAMS ID |
| GET | `/v2/users/preferences` | Get user preferences |
| GET | `/v2/users/users-by-role-and-region` | Filter users by role and region |
| GET | `/v2/users/users-by-roles-and-client-key` | Filter users by roles and client |
| GET | `/v2/users/roles/members` | Get members for role |
| GET | `/v2/users/:userkey/userattributes` | Get user attributes |
| GET | `/v2/users/sync/error-report/list` | List sync error reports |
| GET | `/v2/users/sync/error-report/download` | Download sync error report |
| GET | `/v2/users/hub/session-details` | Get Hub session details |
| POST | `/v2/users/upsert` | Create or update user |
| POST | `/v2/users/participants` | Create/bulk add participants |
| POST | `/v2/users/rater` | Create/bulk add raters |
| POST | `/v2/users/assign-role` | Assign role to users |
| POST | `/v2/users/upload` | Upload users file (CSV) |
| POST | `/v2/users/password` | Set user password |
| POST | `/v2/users/reset-password` | Initiate password reset |
| POST | `/v2/users/reset-password/confirm` | Confirm password reset |
| POST | `/v2/users/resend-email-notification` | Resend email notification |
| POST | `/v2/users/language` | Set language preference |
| POST | `/v2/users/last-login-details` | Get last login details |
| POST | `/v2/users/userattributes/upsert` | Upsert user attributes |
| POST | `/v2/users/associations` | Create/update user-client associations |
| PUT | `/v2/users/participant` | Update participant |
| PUT | `/v2/users/preferences` | Update user preferences |
| PUT | `/v2/users/change-password` | Change password |
| PUT | `/v2/users/synctotableau` | Sync users to Tableau |
| PATCH | `/v2/users/lock` | Lock/unlock user account |
| PATCH | `/v2/users/status` | Activate/deactivate user |
| DELETE | `/v2/users/` | Delete user(s) |
| DELETE | `/v2/users/:userkey/userattributes` | Delete user attributes |

#### Users V3 (`/v3/users`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v3/users/:userkey/products/:productkey/user-attributes` | Create user attributes for product |
| GET | `/v3/users/:userkey/products/:productkey/user-attributes` | Get user attributes for product |

#### Roles (`/v2/roles`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v2/roles` | Create new role |
| GET | `/v2/roles` | List all roles |
| GET | `/v2/roles/active` | List active roles |
| GET | `/v2/roles/role-types` | Get role type configurations |
| GET | `/v2/roles/:id` | Get role by ID |
| PATCH | `/v2/roles/:id` | Update role |
| DELETE | `/v2/roles/:id` | Delete role |
| POST | `/v2/roles/:id/clone` | Clone existing role |

#### Shadow Users (`/v3/shadow-users`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/v3/shadow-users` | List shadow users |
| GET | `/v3/shadow-users/roles` | Get available shadow user roles |
| GET | `/v3/shadow-users/:key/clients` | List assigned clients |
| GET | `/v3/shadow-users/:key/countries` | List assigned countries |
| POST | `/v3/shadow-users` | Create shadow user |
| POST | `/v3/shadow-users/assign-access` | Assign access to shadow user |
| PATCH | `/v3/shadow-users/:key/unassign-access` | Unassign all access |
| PATCH | `/v3/shadow-users/:key/clients/unassign` | Unassign clients |
| PATCH | `/v3/shadow-users/:key/countries/unassign` | Unassign countries |

#### Communities (`/v3/communities`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/v3/communities` | List all communities |
| GET | `/v3/communities/:id` | Get community details |
| GET | `/v3/communities/:id/clients` | List clients in community |
| POST | `/v3/communities` | Create community |
| POST | `/v3/communities/:id/assign` | Assign users to community |
| DELETE | `/v3/communities/:id` | Delete community |
| DELETE | `/v3/communities/:id/clients/:clientId` | Remove client from community |

#### User Groups (`/v2/userGroups`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v2/userGroups` | Create user group |
| PUT | `/v2/userGroups/:groupId` | Update group |
| GET | `/v2/userGroups/by-userid/:userId` | Get groups for user |
| GET | `/v2/userGroups/by-clientid/:clientId` | Get groups for client |
| GET | `/v2/userGroups/:groupId/members` | List group members |
| DELETE | `/v2/userGroups` | Delete group |
| POST | `/v2/userGroups/users` | Assign user to group |
| DELETE | `/v2/userGroups/users` | Remove user from group |
| POST | `/v2/usergrouproleassignment/roles/mapping` | Assign role to group |
| POST | `/v2/usergrouproleassignment/roles/unmapping` | Remove role from group |

#### Privacy (`/v2/privacy`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/v2/privacy/user-consent` | Get user privacy consent status |
| GET | `/v2/privacy/policy-for-user` | Get privacy policy for user (by language) |
| POST | `/v2/privacy/user-consent` | Save user privacy consent |
| POST | `/v1/privacy/simulate-user-consent-check` | Test privacy consent check |

#### Permissions & Resources
| Method | Path | Purpose |
|---|---|---|
| GET | `/v3/permissions/:userkey/client/:clientkey/product/:productkey` | Get user permissions for product |
| GET | `/v2/resources/product/:productkey/resource-type/:resourcetypekey` | Get resources for product |
| GET | `/v2/resources/role/:rolekey/product/:productkey/resource-type/:resourcetypekey` | Get resources for role |
| GET | `/v2/resources/resource-types` | Get all resource types |

#### Profile Collections (`/v3/profile-collections`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/v3/profile-collections` | List profile collections |
| GET | `/v3/profile-collections/:teamId/assigned-collection` | Get assigned collection for team |
| GET | `/v3/profile-collections/:collectionId` | Get collection details |
| POST | `/v3/profile-collections/teams/assign-collection` | Assign collection to team |
| POST | `/v3/profile-collections/teams/unassigned-collection` | Unassign from team |

#### LDAP (`/v2/ldap`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v2/ldap/base-ou` | Configure base OU for LDAP |
| POST | `/v2/ldap/authenticate` | Authenticate user via LDAP |
| POST | `/v2/ldap/find` | Search LDAP directory |
| DELETE | `/v2/ldap/delete` | Delete LDAP configuration |

#### Hub Federation (`/v1/hubuserfederation` + `/v2/hubuserfederation`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/hubuserfederation/authenticate` | Authenticate via Hub |
| POST | `/v1/hubuserfederation/ssologin` | SSO login via Hub |
| POST | `/v1/hubuserfederation/verifyandfetchuser` | Verify and fetch user from Hub |
| POST | `/v1/hubuserfederation/userdetails` | Get user details from Hub |
| GET | `/v1/hubuserfederation/isuserssoenabledinhub` | Check SSO status in Hub |
| GET | `/v2/hubuserfederation/isuserssoenabledinkeycloak` | Check SSO in Keycloak |
| POST | `/v2/hubuserfederation/pinghub` | Test Hub connectivity |
| POST | `/v2/hubuserfederation/pinghubbyemail` | Test Hub connectivity by email |
| POST | `/v2/hubuserfederation/logout` | Logout from Hub |
| POST | `/v2/hubuserfederation/syncUserRoles` | Sync user roles with Hub |

#### Events (`/v1/event`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/event` | Publish generic event (LOGIN, etc.) |
| POST | `/v1/event/send-magic-link` | Send magic link for passwordless auth |
| POST | `/v1/event/send-otp` | Send OTP code |

#### Other IAM Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/v2/ext/payhub-dashboard/*` | Proxy to PayHub dashboard |
| GET | `/v2/ext/crc-url` | Get CRC URL |
| POST | `/v2/multirater/authenticate` | Multirater authentication |
| GET | `/navigation` | Get navigation menu |
| GET | `/contents` | Get content list |
| GET | `/hub-auth/status` | Hub auth status |
| GET | `/hub-auth/refresh` | Refresh Hub auth token |

### Keycloak Admin API

#### Realm Management
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/realms` | List realms |
| GET | `/admin/realms/{realm}` | Get realm configuration |

#### User Management
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/realms/{realm}/users?search={term}` | Search users |
| GET | `/admin/realms/{realm}/users?email={email}` | Find user by email |
| GET | `/admin/realms/{realm}/users/{id}` | Get user by ID |
| POST | `/admin/realms/{realm}/users` | Create user |
| PUT | `/admin/realms/{realm}/users/{id}` | Update user |

#### Role Management
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/realms/{realm}/roles` | List realm roles |
| GET | `/admin/realms/{realm}/clients/{id}/roles` | List client roles |
| GET | `/admin/realms/{realm}/users/{id}/role-mappings/realm` | Get user realm role mappings |
| GET | `/admin/realms/{realm}/users/{id}/role-mappings/clients/{clientId}` | Get user client role mappings |
| POST | `/admin/realms/{realm}/users/{id}/role-mappings/realm` | Assign realm roles |
| POST | `/admin/realms/{realm}/users/{id}/role-mappings/clients/{clientId}` | Assign client roles |

#### Client Management
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/realms/{realm}/clients` | List clients in realm |
| GET | `/admin/realms/{realm}/clients/{id}/client-secret` | Get client secret |

#### Group Management
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/realms/{realm}/groups` | List groups |

#### Authorization Policies
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/realms/{realm}/clients/{id}/authz/resource-server/policy` | List authorization policies |
| GET | `/admin/realms/{realm}/clients/{id}/authz/resource-server/permission` | List permissions |
| GET | `/admin/realms/{realm}/clients/{id}/authz/resource-server/resource` | List resources |
| GET | `/admin/realms/{realm}/clients/{id}/authz/resource-server/scope` | List scopes |

#### Identity Provider Federation
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/realms/{realm}/identity-provider/instances` | List IdP instances |
| GET | `/admin/realms/{realm}/identity-provider/instances/{alias}/mappers` | Get IdP mappers |

### Keycloak Custom Plugins (6 SPI modules in kfone-keycloak-service)

| Plugin | Capability |
|---|---|
| **MagicLinkAuthenticator** | Passwordless magic link authentication (email → action token → OIDC) |
| **EmailDomainIdpDiscovery** | Automatic IDP discovery by email domain (e.g., `@kornferry.com` → SAML broker) |
| **HubAuthenticator** | Hub-aware session and client switching; calls kfone-hub REST API |
| **KFSAMLIdentityProvider** | Custom SAML 2.0 identity provider broker (entity ID, ACS, X.509 certs) |
| **KFTokenMapper** | Custom JWT/SAML attribute mapping (enriches tokens with realm_access roles, client context) |
| **KF1EventListener** | Audit event logging (login, logout, token issuance, user actions) |

### Hub Key Endpoints

#### Authentication & Session
| Method | Path | Purpose |
|---|---|---|
| POST | `/actions/login` | Login; proxies to IS, extracts authToken, stores UserData in Redis |
| POST | `/actions/proxylogin` | Proxy login for impersonation (requires ROLE_USER) |
| PUT | `/actions/logout` | Logout; removes authToken from Redis |
| POST | `/actions/forgotpassword` | Forgot password (unauthenticated) |
| POST | `/actions/changepassword` | Change password (requires ROLE_USER) |

#### SAML SSO
| Method | Path | Purpose |
|---|---|---|
| POST | `/sso/samlssocheck` | Keycloak-initiated SAML flow; returns 302 redirect |
| POST | `/sso/acs` | SAML Assertion Consumer Service |

#### Privacy Policy
| Method | Path | Purpose |
|---|---|---|
| GET | `/privacypolicy/check` | Check user consent (email, locale, application) |
| POST | `/privacypolicy/accept` | Accept privacy policy |

#### HRMS Domain Controllers (all require ROLE_USER)
Pay Hub, Pay Data Collection, Pay Equity, Pay Analytics, Single Job Pricing, Success Profile, Architect, Talent Hub, Talent Acquisition, Talent Management, User Management, Insights, Products Administration, Employee Experience, and more — each with controller + actions sub-controllers.

---

## 6. Role & Permission Model

### Platform-Wide Admin Roles (all-client access)
| Role | Description |
|---|---|
| `super_admin` / `super admin` | Bypass all client checks |
| `support_admin` / `support admin` | Production support |
| `client_onboarding_admin` | Client onboarding |
| `production_support_admin` | Elevated support role |

Hierarchy: SUPER_ADMIN > CLIENT_ADMIN > CLIENT_USER

### Product-Specific Admin Roles
| Product | Admin Role |
|---|---|
| KF Pay | `pay_admin` |
| Profile Manager | `profile_manager_admin` |
| KF Assess | `assess_admin` |
| KF Architect | `architect_admin` |
| KF Coach | `coach_admin` |
| Pay Equity | `pay_equity_admin` |
| KF Select | `select_admin` |
| KF Listen | `listen_admin` |
| KF Learn | `learn_admin` |

### KF Pay Subscription Tiers (11 roles)
- Premium: `pay_premium_admin`, `pay_premium_user`
- Basic: `pay_basic_admin`, `pay_basic_user`
- Participate: `pay_participate_admin`, `pay_participate_user`
- Snapshot: `pay_snapshot_admin`, `pay_snapshot_user`
- MSPI: `pay_mspi_admin`, `pay_mspi_user`
- General: `pay_user`

### Other Product Roles
- **KF Assess:** `assess_admin`, `assess_user`, `assess_non_pii_user`, `client_Admin`, `client_manager`, `client_user`, `client_viewer`
- **KF Select:** `select_admin`, `select_user`, `select_non_pii_user`
- **Profile Manager:** `profile_manager_admin`, `profile_manager_user`, `job_mapping_admin`, `job_mapping_user`
- **KF Listen (7):** `listen_admin`, `listen_commercial`, `technical_consultant`, `listen_consultant`, `norms_manager`, `norms_analyst`, `survey_reporting_user`
- **KFNR:** `rpo_analytics`, `nb_recruiter`, `external_recruiter`
- **Learning Lab:** `learning_lab_admin` (SKU: L92083)
- **Special:** `participant`, `rater` (excluded from teams list)

### Landing Page Keycloak Roles
`kf_admin`, `kf_client_admin`, `kf_user`, `kf_viewer`, `kf_data_admin`, `kf_super_admin`, `kf_report_admin`, `kf_internal`

### Permission Scopes
- Talend Suite Resources: `add`, `edit`, `delete`, `view`, `lists`, `upload`, `access`
- KF Digital HUB Resources: `access` only
- User attribute access limited to: KF Assess, KF Select, Profile Manager, KF Pay, KF Architect

### Agent-Specific Roles
- `agent-admin` — full write access (lock users, reset passwords, update IDPs)
- Any authenticated user — read-only access

---

## 7. Business Rules

### Client Management
- Every client has a unique email domain used for SSO routing
- Client canonical entity: UUID primary key in `kfone_core_v2.client`
- Client identity types: `local`, `default`, `hub`, `advance`
- Parent-child hierarchy via `parent_client_key` for subsidiaries
- Active client check: `is_active=true` AND `is_deleted=false`
- Login allowed: additionally requires `login_allowed=true`
- Each client has a unique SAP ID (`sap_client_id`) and PAMS ID (`pams_id`)
- HRIS integration eligibility: `is_integration_supported=true`
- Integration types: `direct`, `indirect`, `none` (mutually exclusive)
- Supported HRIS providers: `WORKDAY`, `MERGE`, `SAP`

### User Management
- Authentication always routes via email domain → IDP lookup
- User login requires: `is_locked=false`, `is_disabled=false`, `is_deleted=false`, client `login_allowed=true` AND `is_active=true`
- 5 unsuccessful login attempts trigger automatic account lock
- Account lock recovery: admin-initiated only (no self-unlock)
- Multi-client support: user can associate with multiple clients via `user_client_association`
- Client switching: super admins can switch any client; non-super-admins restricted to associated clients
- Email is required non-null field; used as lookup key across systems

### Roles & Permissions
- Roles are stored externally in PostgreSQL (`iam.roles`), NOT inside Keycloak
- JWT tokens are enriched with external roles before being returned
- Roles come from both `realm_access.roles` and `resource_access.<client_id>.roles` in JWT
- Internal user detection: use Keycloak role `kf_internal` (standardized); Hub legacy: hardcoded `clientId == "14193"` (deprecated)
- Write operations (lock users, reset passwords, update IDPs) require `agent-admin` role

### Product Entitlements
- Products stored in `kfone_core_v2.client_product` (owned by Core Service)
- Entitlement-based MFE loading: landing page checks product availability before rendering micro-frontend
- IAM checks product entitlements at authentication time
- Hub gating: `SubscriptionProductType.access == "true"` maps to ROLE_*

### Authentication & Security
- JWT signature MUST be verified via JWKS RS256 (kfone-core-common AuthGuard pattern)
- CRITICAL: kfone-platform-common decodes JWTs WITHOUT signature verification — auth bypass vulnerability (P0-001)
- Two agent roles: `agent-admin` (full write access) and read-only (any authenticated user)
- Each user is limited to DAILY_QUERY_LIMIT (default 10) chat/policy queries per day
- LLM provider is controlled server-side via DEFAULT_LLM_PROVIDER env var (default: gemini)
- Every LLM call is logged with token counts, cost, duration, and success status
- IDP certificates are scanned daily at 8am for expiry (via APScheduler, optional)
- Core API uses PUT for upsert (idempotent create-or-update) of SSO attributes

### Validation Constraints
- Refresh token: `refreshToken` (non-empty string) AND (`clientId` XOR `usePrimaryClient`) — exactly one, not both
- ClientId format: UUID v4 regex
- Consent check API: max 100 emails per request
- Simulate-user: requires non-empty `pamsId`, `emailId`, `psSessionId`, `authToken`
- HRIS Workday: `tenantAlias`, `clientId`, `secret` must be non-empty; when `integrationType=none`, `providerName` must NOT be present
- File upload filenames: sanitized (remove CRLF, replace special chars, limit 255 chars)
- Date formats: DD-MM-YYYY, MM-DD-YYYY, YYYY-MM-DD
- Time formats: 12-hour (hh:mm A), 24-hour (HH:mm)

### Configuration
- Default cache TTL: 5 minutes (300,000 ms)
- Response compression: >= 5KB threshold, Z_FIXED with Z_BEST_SPEED
- S3 buckets: `onboarding/`, `userimport/`, `user-datamigration/error/data/`
- AWS Secrets Manager: exponential backoff (3 attempts: 1s, 2s, 4s)
- RabbitMQ notification types: `user.created`, `login.initiated`, `user.registered`, `usergroup.user_added`, `usergroup.role_mapped`, `ldap.user.creation.failed`, `participant.user.creation.requested`

---

## 8. Cross-System Conflicts & Alignment

### C-001: Client PK Type Inconsistency
- KFOne Core: UUID
- Hub: int
- KFNR: int (organization_id)
- Pay: int
- Pay Equity: varchar
- **Impact:** No single client identifier works across all systems; cross-reference tables required at every boundary

### C-003: JWT Signature Verification (CRITICAL)
- **Correct:** kfone-core-common AuthGuard (JWKS RS256)
- **Vulnerable:** kfone-platform-common (decode-only), kfone-app-kfnr UserContextProvideMiddleware (decode-only)
- **Required:** All services must validate JWT signatures; no decode-only paths permitted

### C-005: Internal User Detection
- Hub: hardcoded `clientId == "14193"` (fragile, deprecated)
- Landing Page: Keycloak role `kf_internal` (standard)
- **Required:** Standardize on Keycloak role; remove Hub hardcoding

### M-001: Client Entity Structure Mismatches
- Different systems define different required fields and flag meanings
- Alignment requires entity mapping documentation at API boundaries

### M-002: User Entity Structure Mismatches
- Different PKs (UUID, long, int, string), different role models across systems
- User lookup strategy must handle multiple ID types

---

## 9. Common Query Patterns

| User asks | Agent should do |
|---|---|
| "How many clients do we have?" | Call Core Service `GET /v2/clients`, return count |
| "Show me details for client X" | Call Core Service `GET /v2/clients/search-by-name/:name` or `/by-id/:id` |
| "What IDP does acmecorp.com use?" | Call Core Service `GET /v2/clients/customAttributes?domainUrl=acmecorp.com` |
| "What products does client X have?" | Call Core Service `GET /v2/products?client_Key={key}` |
| "List all active products" | Call Core Service `GET /v2/products/getActiveProducts` |
| "What roles does user@acme.com have?" | Call IAM `GET /v2/users/details?emailId={email}`, then check role assignments |
| "Show user groups for client X" | Call IAM `GET /v2/userGroups/by-clientid/{clientId}` |
| "What permissions does user X have for product Y?" | Call IAM `GET /v3/permissions/:userkey/client/:clientkey/product/:productkey` |
| "List all roles" | Call IAM `GET /v2/roles` or `GET /v2/roles/active` |
| "How many realm roles are configured?" | Call Keycloak `GET /admin/realms/{realm}/roles` |
| "Why can't user X log in?" | Check: user `is_locked`/`is_disabled`/`is_deleted`, client `login_allowed`/`is_active`, IDP config, cert expiry, consent status |
| "List expiring certificates" | Call certificate scan tool |
| "Lock user X" | Requires `agent-admin` role; call IAM `PATCH /v2/users/lock` |
| "Unlock user X" | Requires `agent-admin` role; call IAM `PATCH /v2/users/lock` with unlock flag |
| "Activate/deactivate user X" | Requires `agent-admin` role; call IAM `PATCH /v2/users/status` |
| "Reset password for user X" | Requires `agent-admin` role; call IAM `POST /v2/users/reset-password` |
| "Send a magic link to user@acme.com" | Call IAM `POST /v1/event/send-magic-link` |
| "Send OTP to user@acme.com" | Call IAM `POST /v1/event/send-otp` |
| "What login mode does user@acme.com use?" | Call Core Service `GET /v2/clients/login-mode?email={email}` |
| "Show me LLM usage stats" | Query `llm_usage_logs` table via usage tools |
| "What authorization policies exist?" | Call Keycloak authz API for realm's clients |
| "Search for user john@example.com" | Call IAM `GET /v2/users/search?email=john@example.com` |
| "List shadow users" | Call IAM `GET /v3/shadow-users` |
| "What communities exist?" | Call IAM `GET /v3/communities` |
| "Check user consent status" | Call IAM `GET /v2/privacy/user-consent` |
| "What is the HRIS config for client X?" | Call Core Service `GET /v2/clients/hris-config` |
| "Show client subsidiaries" | Call Core Service `GET /v2/clients/subsidiaries` |
| "Get client engagement details" | Call Core Service `GET /v2/engagements?client_Key={key}` |
| "List knowledge base articles" | Query `knowledgebase.articles` + `article_content` tables |
| "Check Hub auth status" | Call Core Service `GET /hub-auth/status` |
| "What SSO is enabled in Keycloak?" | Call IAM `GET /v2/hubuserfederation/isuserssoenabledinkeycloak` |
| "Is SSO enabled in Hub for user X?" | Call IAM `GET /v1/hubuserfederation/isuserssoenabledinhub` |
| "Get navigation menu" | Call IAM `GET /navigation` |
| "Check system health" | Call Core Service `GET /healthCheck` or IAM `GET /healthCheck` |
| "Show upcoming product maintenance" | Call Core Service `GET /v2/product-maintenance` |
