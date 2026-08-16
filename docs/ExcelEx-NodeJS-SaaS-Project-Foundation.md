# ExcelEx Courier SaaS Platform

## Project Foundation, Technology Decisions, Scope and Migration Strategy

**Document status:** Initial project baseline  
**Prepared:** 16 August 2026  
**Purpose:** Preserve the decisions and context required to begin implementation in a new conversation without repeating discovery.

---

## 1. Executive summary

ExcelEx wants to build and own a new courier and logistics SaaS platform using Node.js. ExcelEx currently operates as a customer of the Xpresion product at `http://xpresion.excelexlog.com`. The visible Xpresion menus and workflows provide the functional baseline, but the new system will be independently designed and implemented with ExcelEx branding, architecture, security, data model and user experience.

ExcelEx intends to sell the new platform to multiple courier companies. Each courier company will be an isolated tenant, normally accessed through a subdomain such as:

```text
company1.excelex.in
company2.excelex.in
```

The platform will be commercially controlled using subscription plans with limits such as active users, branches, shipment volume, storage, API usage and enabled modules.

The agreed technical baseline is:

- TypeScript throughout
- Node.js with NestJS for the backend
- Next.js with React for the frontend from the first release
- PostgreSQL as the primary relational database
- Prisma as the initial ORM and migration tool
- Redis and BullMQ for queues, caching and scheduled work
- S3-compatible object storage for PODs, invoices, manifests and attachments
- A modular monolith initially, with no premature microservices
- REST APIs documented with OpenAPI
- Browser-based support for office USB barcode scanners
- Multi-tenant SaaS isolation enforced at every application and database boundary
- A first-class legacy migration subsystem for Xpresion table exports

The first operational release will prioritize shipment booking, AWB management, manifest and scan workflows, tracking, billing and the customer portal. “Complete existing menu replacement” remains the full product objective and will be delivered in phases.

---

## 2. Business context

### 2.1 Current position

- Xpresion is the owner/provider of the existing application.
- ExcelEx is logged into Xpresion as a customer.
- The menus documented in this file are visible to ExcelEx users.
- ExcelEx wants its own independently built application providing the same necessary business capabilities.
- ExcelEx then wants to offer the application to multiple courier companies.
- The existing Xpresion application appears to use ASP.NET and primarily presents records in tables.
- Most tables appear to include export functionality, creating a realistic path for legacy data migration without direct database access.

### 2.2 Product direction

The new system is not simply an ASP.NET-to-Node.js code conversion. It is a new multi-tenant courier SaaS product that must:

- Reproduce confirmed ExcelEx operational workflows
- Improve confusing or duplicated areas of the old application
- Support multiple courier-company tenants
- Provide platform-level subscription and quota management
- Provide a modern customer website and portal
- Support office barcode-scanning workflows
- Integrate with external carriers such as Blue Dart and Delhivery
- Preserve and migrate ExcelEx-owned historical data where exports permit
- Remain auditable, secure and maintainable

### 2.3 Clean implementation boundary

The existing application is a functional reference. The project may document and independently implement required workflows and migrate ExcelEx-owned data with authorization. It should not copy Xpresion source code, credentials, branding, proprietary assets or data belonging to other customers. Any extraction must stay within ExcelEx’s authorized account and contractual rights.

---

## 3. Confirmed requirements

### 3.1 Tenant model

- The application will serve multiple courier companies.
- Each courier company is a tenant.
- The preferred access pattern is a tenant subdomain such as `company1.excelex.in`.
- ExcelEx acts as platform owner and SaaS administrator.
- Tenants manage their own branches, staff, customers, shipments, rates, manifests, billing and configuration.
- Tenant customers receive a customer portal.

### 3.2 Connectivity and scanning

- Branches are expected to have reliable internet.
- The first release must support office USB barcode scanners.
- These scanners normally operate in USB HID keyboard mode and therefore do not require a custom hardware driver.
- Mobile delivery-boy and handheld PDA applications are not confirmed for the first release.

### 3.3 First operational scope

The user selected all of the following:

- Booking, manifest and tracking
- Billing and customer portal
- Complete replacement of the existing menu set as the overall objective

These are reconciled as a phased delivery: the first operational release covers the critical revenue and courier flow; later releases complete the remaining master, operational, reporting and utility functions.

### 3.4 Public website

ExcelEx needs a basic customer-facing website. Next.js will therefore be used from day one for:

- Public company pages
- Public shipment tracking
- Login routing
- Tenant operations interface
- ExcelEx platform administration
- Tenant customer portal

Next.js already uses React. A separate React/Vite application is not required initially.

---

## 4. Existing functional inventory

The following inventory was observed from the ExcelEx Xpresion login. Names should be retained for discovery traceability, but unclear and duplicate items must be investigated before the new information architecture is finalized.

### 4.1 Header navigation

- Home
- Tracking Search
- Fullscreen Toggle

### 4.2 Quick links

- AWB Entry
- Manifest
- DRS Scan
- Rate Update
- Rate Import
- Customer Master
- Manifest In Scan
- Add Bookmark
- Bookmarks

### 4.3 Account balance

- Limit
- Used
- Balance

The exact meaning must be confirmed. It may represent customer credit limit, account utilization or another commercial balance.

### 4.4 Notifications

- Vendor API Issue
- Auto Tran Issue
- Auto EmailSMS Issue

### 4.5 Help menu

- Help
- FAQ
- What’s New? (currently hidden)

### 4.6 User menu

- Change Password
- Tickets
- Job Queue
- Clear Cache
- System Health Report (currently hidden)
- View Profile (currently hidden)
- Log Out

### 4.7 Main menu

1. Dashboard
2. Master
3. Transaction
4. Document
5. Reports
6. Utility

### 4.8 Master — Sales

- Product
- Product Master
- Zone
- Country
- Destination
- Service Center
- State
- Sales Executive
- Industry
- Flight
- Product Type
- Content
- Instruction
- Local
- Charges Master
- Bank Master

### 4.9 Master — Customer

- Customer
- Customer Rate
- Consignee
- Shipper
- Group

### 4.10 Master — Vendor

- Vendor
- Vendor Contract

### 4.11 Master — Operation

- Service Mapping
- Field Executive
- Pin Code
- Area
- Exception
- Country Pincodes

### 4.12 Transaction

- Pickup Inscan
- AWB Entry
- Manifest Scan
- Manifest In Scan
- Manifest View
- DRS Scan
- Un-Delivery Scan
- Miss Route Scan

#### Out Scan

- OBC Entry

#### Tracking / Delivery

- AWB Query
- Forwarding Updation
- Progress / Comment
- Update Entry

#### Receipt / Expenses

- Receipt Entry
- Customer Payment

#### Bulk Import

- POD to Excel

### 4.13 Document

- Invoice Generation
- Invoice Print
- Invoice Finalise

### 4.14 Reports

- Operations
- Statements
- AWB
- Scan
- AR Report

### 4.15 Utility

- Servicebale Pincode
- Serviceable Pincode
- Notification

#### Users

- User Setup
- Access Rights
- LoggedIn Users

#### Excel Import

- AWB Merging
- POD Merging
- Forwarding Merging
- Data Import
- Data Updation

#### Tax / Charges Setup

- Fuel Setup
- Tax Setup
- Setup

#### Rate / Zone Update

- Rate Update
- Zone Update
- Rate Import

### 4.16 Required discovery for every menu

For each screen, capture:

- Business purpose
- User roles that can view or operate it
- Table columns
- Search, filters and sorting
- Create/edit form fields
- Required and optional inputs
- Dropdown sources
- Validation rules
- Record statuses and allowed transitions
- Permissions such as view, create, edit, approve, close, reopen, export and delete
- Generated documents
- Notifications and side effects
- Carrier/API interactions
- Excel, CSV or PDF exports
- Example records and edge cases
- Whether ExcelEx actively uses the function
- Whether it duplicates another menu item
- Historical data required for migration

---

## 5. Proposed product domains

The new application should organize capabilities into clearer business domains instead of copying the old sidebar structure literally.

1. Platform and subscription administration
2. Tenant organization and branches
3. Users, roles, permissions and sessions
4. Customers, shippers and consignees
5. Vendors and carrier integrations
6. Products, services and serviceability
7. Zones, rates, surcharges and taxes
8. AWB inventory and shipment booking
9. Pickup operations
10. Manifests, bags and hub scanning
11. Routing and forwarding
12. Delivery runs, DRS, exceptions and POD
13. Tracking and shipment events
14. Billing, invoices, receipts and statements
15. Customer portal and customer APIs
16. Notifications and templates
17. Imports, exports and migration
18. Operational and financial reports
19. Audit, background jobs and system health
20. Support tickets and help content

The terms `Product` versus `Product Master` and `Servicebale Pincode` versus `Serviceable Pincode` are examples that must be audited rather than implemented as immediate duplicate modules.

---

## 6. Finalized technology stack

### 6.1 Core stack

| Area | Decision | Reason |
| --- | --- | --- |
| Language | TypeScript | Prevents many contract and data-shape errors in a large financial/operational system |
| Runtime | Active Node.js LTS | Production stability and security support |
| Backend | NestJS | Enforces modules, dependency injection, validation, testing and clear service boundaries |
| Frontend | Next.js Active LTS with React | Supports the public website, portals and authenticated operations from one frontend foundation |
| Styling | Tailwind CSS and shadcn/ui | Reusable accessible components with controlled customization |
| Primary database | PostgreSQL | Transactions, relational integrity, reporting, locking and JSONB support |
| ORM | Prisma initially | Type-safe access, migrations and productive development |
| Queue/cache | Redis and BullMQ | Imports, notifications, carrier jobs, document generation and scheduled work |
| Files | S3-compatible object storage | Durable scalable storage for PODs, invoices, manifests and attachments |
| API style | Versioned REST and OpenAPI | Stable contracts for web, future mobile apps and customer integrations |
| PDF generation | HTML-to-PDF through Playwright | Invoices, manifests, labels, statements and reports |
| Testing | Vitest/Jest, Supertest and Playwright | Unit, integration, API and browser coverage |
| Deployment | Docker, Nginx and GitHub Actions | Repeatable environments and deployments |
| Monitoring | Sentry, health checks, structured logs and OpenTelemetry-ready tracing | Production support and auditability |

### 6.2 Why PostgreSQL instead of MongoDB

Courier operations are strongly relational and transactional. A shipment relates to a tenant, branch, customer, shipper, consignee, service, rate card, manifest, carrier, tracking events, invoice and POD. PostgreSQL can enforce these relationships using foreign keys, unique constraints, check constraints and database transactions.

It is particularly suitable for:

- Preventing duplicate AWB allocation
- Applying tenant-aware uniqueness
- Safely updating customer credit usage
- Generating invoices and financial statements
- Locking records during concurrent scans or allocation
- Joining customers, shipments, manifests and billing data
- Producing operational and financial reports
- Storing flexible carrier payloads in JSONB without losing relational safety

MongoDB could technically support the system, but it would shift more referential and financial consistency into application code without a clear product advantage. MongoDB is therefore not part of the initial stack. A later measured requirement may justify a specialized secondary datastore, but PostgreSQL remains the system of record.

### 6.3 Why Next.js from day one

Next.js is justified because the product includes both a public website and authenticated portals. It can support:

- `www.excelex.in` public pages
- Public tracking
- ExcelEx platform administration
- Tenant operations
- Tenant customer portal
- Subdomain-based tenant resolution
- Server-rendered public content where useful

Next.js contains React. Do not create a second React/Vite application unless future scale or release independence provides a concrete reason.

### 6.4 Why a modular monolith

The initial backend should be one deployable NestJS application divided into strict domain modules. This preserves transaction safety and keeps local development, deployment, testing and debugging manageable. Microservices would introduce distributed transactions, network failure modes, deployment overhead and observability requirements before the product has measured scale.

Domain boundaries must still be enforced so selected workloads can be extracted later if needed.

---

## 7. Proposed repository structure

```text
excelex-platform/
├── apps/
│   ├── web/                    # Next.js public site and all portals
│   ├── api/                    # NestJS REST API
│   └── worker/                 # BullMQ workers
├── packages/
│   ├── database/               # Prisma schema and database utilities
│   ├── contracts/              # Shared API types and generated clients
│   ├── validation/             # Shared validation contracts
│   ├── permissions/            # Permission vocabulary and guards
│   ├── ui/                     # Shared design-system components
│   ├── configuration/          # Typed configuration
│   └── testing/                # Test factories and helpers
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── deployment/
├── docs/
└── tools/
```

Use `pnpm` workspaces. Turborepo may coordinate builds, tests and shared packages. Package versions must be pinned and upgraded intentionally.

---

## 8. Multi-tenant SaaS architecture

### 8.1 Domain layout

```text
www.excelex.in                 Public ExcelEx website
admin.excelex.in               ExcelEx platform owner administration
company1.excelex.in            Tenant operations and customer portal
company2.excelex.in            Another isolated tenant
api.excelex.in                 NestJS API if a central API hostname is selected
```

### 8.2 Tenant data model

Start with one PostgreSQL database and shared tables containing a mandatory tenant identifier. This is operationally simpler than one database per small tenant and supports centralized reporting and deployment.

Required controls include:

- Resolve tenant from trusted hostname/session context
- Never trust a tenant ID supplied directly by the browser
- Tenant-aware repository/service boundaries
- Mandatory tenant filters
- Composite unique constraints containing the tenant ID where appropriate
- Tenant-aware foreign keys or equivalent integrity enforcement
- Automated cross-tenant access tests
- Tenant-scoped file paths and storage accounting
- Tenant-scoped cache keys and queue payloads
- Audited platform-support access

### 8.3 ExcelEx platform-owner capabilities

- Create and configure tenants
- Assign tenant subdomains and branding
- Configure plans and enabled modules
- Control tenant status, trials and expiry
- Configure active-user, branch, shipment, storage and API limits
- View usage and quota warnings
- Audit subscriptions and administrative actions
- Provide controlled support access
- View platform health without exposing tenant data unnecessarily

### 8.4 Tenant capabilities

- Manage branches and staff
- Manage roles and permissions
- Manage customers, shippers and consignees
- Configure products, services, rates and zones
- Book and track shipments
- Operate manifests and scans
- Manage vendors and carrier integrations
- Generate invoices and statements
- Configure customer access and notifications
- Access tenant-specific reports and audit records

### 8.5 Subscription and quota model

Do not model commercial licensing as an ambiguous “login count.” Plans should explicitly define measurable limits:

| Limit | Example |
| --- | ---: |
| Active staff users | 20 |
| Customer portal users | 100 |
| Concurrent staff sessions | Optional |
| Branches | 5 |
| Monthly shipments | 50,000 |
| Storage | 100 GB |
| API requests | 500,000/month |
| Retention | 5 years |
| Enabled modules | Booking, tracking and billing |

Prefer active licensed users over counting every successful login. If concurrent-session licensing is required, model it separately.

Storage accounting should include PODs, shipment documents, invoice and manifest files, imports, exports and support attachments. Maintain a storage-usage ledger in bytes. Warn tenants at configurable thresholds such as 80% and 90%. At the hard limit, block non-essential new uploads while preserving login, tracking, downloads and administrative cleanup.

---

## 9. USB barcode scanner design

### 9.1 Hardware type

The first release supports office USB barcode scanners in HID keyboard mode. Typical courier labels use Code 128, but ExcelEx should test representative labels and one selected scanner model before procurement.

### 9.2 Browser workflow

1. Operator opens a manifest, hub or delivery scanning screen.
2. The scan field maintains focus.
3. The scanner reads the barcode and types the AWB value.
4. The scanner sends its configured Enter or Tab suffix.
5. The frontend normalizes and validates the input.
6. An idempotent API request records the scan.
7. The UI immediately reports success or a specific failure.

### 9.3 Required scanning features

- Persistent autofocus without disrupting other deliberate actions
- Enter/Tab suffix configuration
- Rapid sequential scan handling
- Duplicate prevention
- Idempotent server-side scan commands
- Success/failure sound feedback
- Large color-coded result feedback
- Expected, successful, duplicate and rejected counts
- Wrong manifest/bag/destination detection
- Closed-manifest protection
- Permission-controlled undo/reversal with reason
- Full user/device/time audit trail
- Manual keyboard fallback
- Short in-browser pending buffer for transient network interruptions
- Safe recovery after page refresh
- Clear batch completion and discrepancy summary

Reliable internet is expected, so full offline-first operation is not initially required. Short interruption tolerance is still desirable for scanner usability.

---

## 10. Xpresion data migration strategy

### 10.1 Current migration assumption

Direct Xpresion database access is not available. Xpresion appears to expose table-based screens with export functionality on most tables. This gives ExcelEx a credible export-driven migration route.

The migration cannot be finalized from menu names alone. Every required export must be inventoried and sampled before the target schema and migration acceptance criteria are frozen.

### 10.2 Preferred extraction order

Use the strongest available source in this order:

1. Tenant-specific Xpresion database backup
2. Structured Excel/CSV exports
3. Official Xpresion APIs
4. Screen-level reports and document downloads
5. Authorized controlled browser extraction as a last resort

The expected primary route is option 2.

### 10.3 Export inventory

Determine whether ExcelEx can export:

- Customers, groups and account balances
- Shippers and consignees
- Users and access rights
- Branches/service centers
- Vendors and vendor contracts
- Products and services
- Countries, states, destinations, areas and pincodes
- Serviceability mappings
- Zones and customer rates
- Fuel, tax and charge configurations
- AWB inventory and shipments
- Shipment tracking history
- Manifests and manifest details
- Inbound/outbound scans
- DRS and delivery events
- Undelivered and misroute events
- Forwarding records
- POD references and images
- Invoices and invoice lines
- Receipts, payments and statements
- Tickets, comments and notifications where needed
- Documents and attachments

For every export, record file type, columns, stable ID, date range, timezone, row limit, pagination, filters, encoding and whether it includes deleted/inactive records.

### 10.4 Migration subsystem

Migration must be built as a controlled subsystem, not as direct spreadsheet insertion into production tables.

Required components:

- Migration batch register
- Immutable storage of original exports
- File hashes/checksums
- Raw staging tables
- Source column profiles
- Configurable mappings where appropriate
- Validation and normalization
- Duplicate detection
- Dry-run mode
- Row-level errors
- Resumable and idempotent jobs
- Source-to-target record mapping
- Reconciliation reports
- Audit logs
- Controlled rollback before acceptance

Recommended pipeline:

```text
Xpresion export
  -> immutable raw file
  -> staging rows
  -> validation/error report
  -> transformation and reference mapping
  -> ExcelEx domain services
  -> PostgreSQL production model
  -> count/financial/document reconciliation
```

### 10.5 Legacy traceability

Use a dedicated mapping table similar to:

```text
legacy_record_mappings
├── tenant_id
├── source_system
├── source_entity
├── source_record_id
├── target_entity
├── target_record_id
├── migration_batch_id
├── source_checksum
└── imported_at
```

This permits safe retry, duplicate prevention, delta imports, traceability and discrepancy investigation.

### 10.6 Import ordering

An indicative dependency order is:

1. Tenant and organization configuration
2. Countries, states, destinations, service centers and pincodes
3. Products, services, zones, taxes and charges
4. Vendors and contracts
5. Customers, groups, shippers and consignees
6. Users and role mappings
7. Rate cards
8. AWBs and shipments
9. Manifests and scan records
10. Tracking and delivery events
11. Invoices and invoice lines
12. Receipts, payments and balances
13. PODs and other documents

The final order must follow actual Xpresion relationships discovered from exports.

### 10.7 Special migration cases

#### Passwords

Do not assume Xpresion password hashes are safely transferable. Import user identities, then require secure activation/password reset. Add MFA support where required.

#### Documents

Table exports may include only document references, not file bytes. POD images, invoices, labels, manifests and attachments require a separate permitted download/archive process.

#### API credentials

Carrier, email, SMS and payment credentials should normally be reissued or rotated rather than copied from the old system.

#### Permissions

Old menu permissions must be mapped deliberately into the new permission vocabulary. Do not blindly recreate potentially inconsistent legacy permissions.

#### Financial data

Invoice totals, tax totals, customer balances and receipts require explicit reconciliation and client sign-off.

### 10.8 Migration rehearsals and cutover

#### Sample proof

Begin with a small connected dataset, for example 10 customers, 100 shipments, five manifests, tracking events, two invoices and associated documents.

#### Historical rehearsal

Import a selected historical period and compare source versus target counts and totals.

#### Full rehearsal

Run the complete import in a disposable environment. Measure duration, failure categories, unmatched references, duplicates, storage and reconciliation differences.

#### Production cutover

1. Agree a cutover time.
2. Freeze or restrict Xpresion entry if possible.
3. Take final exports.
4. Import the final full or delta batch.
5. Reconcile counts, balances and documents.
6. Obtain client acceptance.
7. Switch tenant access/DNS.
8. Retain Xpresion as permitted read-only reference for an agreed verification period.

If Xpresion cannot be frozen, a stable source ID plus created/updated timestamps are required for incremental migration. Export feasibility must be proven before committing to a zero-downtime cutover.

---

## 11. Delivery plan

### Phase 0 — Product discovery and specification

- Inspect every permitted Xpresion screen
- Capture fields, rules, roles, statuses and transitions
- Catalogue all exports
- Collect sample documents and connected sample records
- Document AWB, manifest, scan, billing and tracking workflows
- Identify duplicates and unclear legacy functions
- Define migration feasibility and acceptance criteria
- Draft the system context, terminology, data dictionary and permission catalogue

### Phase 1 — Engineering and SaaS foundation

- Monorepo and development standards
- Local Docker environment
- Next.js application shell and design system
- NestJS modular API
- PostgreSQL and Prisma baseline
- Configuration and secrets management
- Tenant/subdomain resolution
- Authentication and account activation
- Roles, permissions and branch scopes
- Platform owner administration
- Plans, quotas and usage metering
- Audit logging
- Redis, BullMQ and job monitoring
- S3 storage abstraction
- CI/CD, test baseline and observability

### Phase 2 — Master data and migration framework

- Organization and branches
- Customers, shippers, consignees and groups
- Vendors and carrier framework
- Products and services
- Countries, states, destinations, areas and pincodes
- Serviceability and service mappings
- Zones, taxes, charges and rate structures
- Import/export framework
- Xpresion staging, mapping and reconciliation framework

### Phase 3 — First courier operations release

- AWB inventory
- Shipment booking/AWB entry
- Label and barcode generation
- Manifest creation and closure
- Manifest scan
- Manifest inbound scan
- Manifest view and discrepancy handling
- Shipment event timeline
- AWB query and public tracking
- Carrier booking/tracking adapters
- Exception and retry handling
- USB scanner workflow

### Phase 4 — Billing and customer portal

- Customer rate cards
- Volumetric and charge calculations
- Fuel and other surcharges
- Tax calculation
- Credit limit and usage
- Invoice generation, finalization and printing
- Receipts and customer payments
- Statements and ageing/AR reports
- Customer login and dashboard
- Customer bookings/imports
- Label printing, tracking, POD and invoice downloads
- Customer API keys and webhooks when approved

### Phase 5 — Complete operational replacement

- Pickup scan
- OBC/outbound workflows
- Forwarding updates
- DRS creation and scan
- Undelivered and misroute scans
- POD management
- Remaining utility imports and merges
- Complete report catalogue
- Tickets, help and notifications
- Operational dashboards and SLA/exception views

### Future decision — Delivery application

The delivery-boy workflow remains undecided. Before adding a mobile application, confirm whether final-mile delivery is performed by ExcelEx, its tenant companies, field executives, vendors or external carriers. Possible later solutions include a Next.js PWA, Android application or integration-only workflow.

---

## 12. Industry-standard improvements to include

- Immutable shipment event history with controlled corrections
- Configurable status transition rules
- Idempotent carrier webhooks and scan commands
- Carrier request/response logging with secrets redacted
- Carrier retry, reconciliation and operational readiness status
- Maker-checker approval for rate and important financial changes
- Effective-dated rate cards and contracts
- Volumetric weight and configurable rounding
- Fuel, COD, remote-area, handling and special surcharges
- AWB/manifest/invoice number sequences scoped correctly
- Manifest discrepancy and incorrect-route handling
- Tenant branding and configurable document templates
- POD image/signature storage
- Fine-grained tenant/branch/user permissions
- Login/session controls and optional MFA
- Customer credit and ageing controls
- Template-driven email/SMS/notification messages
- Customer APIs with scoped permanent or rotating credentials
- API rate limits, idempotency and webhook subscriptions
- Import previews, validation and downloadable error reports
- Audit log for security, finance, rate, permission and operational changes
- Storage usage and retention policies
- Backups, restore tests and disaster-recovery procedure
- System health, failed jobs and integration alerts
- Accessible responsive interface and keyboard/scanner-first workflows

---

## 13. Security and reliability baseline

- HTTPS everywhere; the new platform must not follow the existing plain-HTTP pattern
- Secure HTTP-only session cookies
- CSRF protection where applicable
- Password hashing with a current recommended algorithm
- Optional MFA and enforced MFA for platform administrators
- Rate limiting and brute-force protection
- Strict tenant and branch authorization
- Input validation at API boundaries
- Output encoding and file upload validation
- Secrets stored outside source control
- Encryption for sensitive integration credentials
- PII-aware logs with redaction
- Immutable/auditable financial and security changes
- Idempotency for bookings, scans, imports, carrier calls and webhooks
- Database transactions for multi-record business operations
- Automated backups and restore drills
- Health checks for database, Redis, storage, queues and carrier dependencies
- No destructive hard deletion for operational/financial data without explicit retention policy

---

## 14. Testing strategy

The project should use a layered test strategy:

- Unit tests for calculation and domain rules
- Integration tests against PostgreSQL/Redis for repositories and transactions
- API tests for authentication, authorization, tenancy and workflows
- Contract tests for carrier adapters
- Browser tests for critical booking, scanning, manifest and billing journeys
- Migration tests using representative exports
- Cross-tenant security tests
- Concurrency tests for AWB allocation, scans and financial changes
- Reconciliation tests for invoices, balances and migrated records

Critical invariants must be pinned early, including:

- A tenant can never access another tenant’s record
- An AWB cannot be allocated twice within its defined scope
- Repeated scans/webhooks/imports cannot duplicate business effects
- Closed/finalized documents require explicit controlled reversal
- Financial totals use fixed-precision decimal/minor-unit handling, not floating-point arithmetic
- Every migrated record remains traceable to its source batch and source ID

---

## 15. Decisions already finalized

The following should not be reopened in the next conversation unless new evidence materially changes them:

1. The product is a multi-tenant SaaS platform.
2. Tenant access will normally use `company1.excelex.in` style subdomains.
3. ExcelEx is the platform owner.
4. The implementation language is TypeScript.
5. The backend framework is NestJS on Node.js.
6. The frontend framework is Next.js with React from day one.
7. A separate React/Vite application is not initially required.
8. PostgreSQL is the primary system-of-record database.
9. MongoDB is not part of the initial core stack.
10. The backend begins as a modular monolith, not microservices.
11. Office USB barcode scanners are supported in the first release.
12. Reliable internet is expected; full offline-first functionality is not required initially.
13. Xpresion exports are the expected primary legacy-data source.
14. Migration is a first-class workstream with staging, validation, idempotency and reconciliation.
15. Complete menu replacement is the overall scope, delivered in phases.
16. The first operational priority is booking, manifest/scanning, tracking, billing and the customer portal.
17. Delivery-boy functionality requires separate business discovery before implementation.

---

## 16. Open questions and evidence still required

These are discovery items, not reasons to delay creating the technical foundation:

### Xpresion and migration

- Which tables can be exported?
- What formats are available?
- Do exports contain stable IDs and timestamps?
- Are there row/date-range limits?
- Can PODs and document files be downloaded in bulk?
- Can inactive/deleted records be exported?
- Can invoices and their lines be linked reliably?
- What record volumes and storage totals exist?
- Is a final read-only/freeze window available for cutover?

### Business rules

- Exact AWB lifecycle and number-allocation rules
- Manifest lifecycle and close/reopen permissions
- Meaning of Limit, Used and Balance
- Customer credit and payment allocation rules
- Rate priority and calculation order
- Vendor/carrier selection logic
- DRS and final-mile ownership
- Invoice finalization and cancellation rules
- Tax requirements and document numbering
- Whether tenants require custom domains in addition to subdomains
- Exact subscription pricing and quota enforcement rules

### Operations

- Expected tenant, branch, user, shipment and scan volumes
- Selected USB scanner make/model and barcode symbologies
- Label size and printer models
- Required carrier integrations for the first launch
- Required email and SMS providers
- Required backup retention and hosting region

---

## 17. Required inputs to collect before domain implementation

The client/project team should collect:

- Screenshots or screen recordings for every Xpresion workflow
- Representative exports from every available table
- Sample AWBs covering different statuses
- Sample domestic and international shipments if applicable
- Sample manifests and scan discrepancies
- Sample labels and barcode formats
- Sample rate sheets and calculation examples
- Sample invoices, receipts and statements
- Sample POD documents
- Current roles and access-right screenshots
- List of branches and operational hierarchy
- Carrier API documents and test credentials where authorized
- Current storage volume and approximate row counts
- A glossary of ExcelEx terminology

Never share live passwords in chat or commit credentials to the repository.

---

## 18. Recommended starting point for the next chat

The next conversation should begin with this instruction:

> We are starting the ExcelEx Courier SaaS implementation. Treat the attached project foundation document as the agreed baseline. Begin with Phase 1 only: repository and engineering foundation. First produce an audit-grade implementation plan covering the monorepo, exact supported package versions, Next.js app, NestJS modular API, PostgreSQL/Prisma, Redis/BullMQ, Docker, configuration, tenant/subdomain resolution, authentication boundary, test strategy, CI and documentation. Do not implement courier domain modules yet and do not introduce microservices or MongoDB. Identify any architectural decision that must be approved before generating code.

The first code milestone should prove the platform foundation through a thin vertical slice:

1. Monorepo builds and tests successfully.
2. Docker starts PostgreSQL and Redis locally.
3. Next.js resolves a known tenant subdomain.
4. NestJS resolves the same tenant from trusted request context.
5. A platform administrator can create a tenant.
6. A tenant administrator can activate an account and sign in.
7. Cross-tenant access is rejected and tested.
8. Health checks and structured logging are operational.
9. CI runs formatting, static analysis, tests and production builds.

Only after this foundation is verified should the project begin the master-data and Xpresion export-discovery modules.

---

## 19. Final project position

ExcelEx can realistically build this platform with Node.js. The correct approach is an independently implemented, production-grade multi-tenant SaaS application—not a screen-by-screen patchwork clone. Xpresion table exports make historical data migration plausible, but migration completeness must be proven through an export inventory, sample imports and reconciliation.

The selected stack balances modern capabilities with maintainability: Next.js and React for public and authenticated interfaces, NestJS for a structured backend, PostgreSQL for transactional and relational safety, Redis/BullMQ for background work, and S3-compatible storage for documents. This baseline supports ExcelEx’s immediate courier workflows and its longer-term plan to sell the platform to other courier companies.
