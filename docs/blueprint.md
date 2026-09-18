# Telegram Video Storefront — Bot specification

**Archetype:** commerce

**Voice:** warm and concise — write every user-facing message, button label, error, and empty state in this voice.

A compact Telegram storefront that lists two seeded short-video products, accepts one-time payments via Telegram Payments (Stars), and delivers the purchased video file immediately to the buyer while notifying admins of sales and delivery failures.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Fans who want to buy short digital videos in-chat
- Telegram users comfortable with inline purchases (Stars)

## Success criteria

- Users can browse the seeded catalog and view product details via buttons
- Users can pay for a product using Telegram Payments (Stars) and receive the video file automatically after confirmed payment
- Paid orders are recorded with buyer id, product id, payment receipt id, timestamp, and status transitions (pending → paid → delivered)
- ADMIN_CHAT_ID receives notifications for each paid order and on delivery failures
- Support messages from buyers are delivered to ADMIN_CHAT_ID with buyer metadata and reply shortcuts for staff

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu with a cover image and primary actions
  - outputs: Main menu message with buttons: Catalog, Support
- **Catalog** (button, actor: user, callback: catalog:start) — Open the product catalog (seeded with two videos)
  - outputs: List of product cards (thumbnail, title, short description, price) with Buy, Details, Back buttons
- **Support** (button, actor: user, callback: support:start) — Open the support contact form (short text input) to message admin
  - inputs: Free-text message (ForceReply)
  - outputs: Acknowledgement to buyer; message forwarded to ADMIN_CHAT_ID with buyer metadata and staff quick-reply buttons
- **Buy** (button, actor: user, callback: buy:start:{product_id}) — Start the purchase flow for the selected product; opens a Telegram invoice using Stars
  - inputs: product_id (from catalog)
  - outputs: Invoice message (Telegram Payments). On successful payment: order recorded, video delivered, buyer notified, admin notified
- **Details** (button, actor: user, callback: product:details:{product_id}) — Show extended product description and preview thumbnail
  - inputs: product_id
  - outputs: Product details message with Buy and Back buttons

## Flows

### Main menu /start
_Trigger:_ /start

1. Show cover image, short intro text, and inline buttons: Catalog, Support
2. Record session context (optional) for UX analytics

_Data touched:_ UserSession

### Browse catalog
_Trigger:_ callback:catalog:start

1. Fetch list of seeded products from storage
2. Render product cards (thumbnail, title, short description, price in Stars) with inline buttons: Buy, Details, Back
3. Paginate if more products exist

_Data touched:_ Product

### Product details
_Trigger:_ callback:product:details:{product_id}

1. Fetch product by id
2. Show longer description, preview thumbnail, Buy and Back buttons

_Data touched:_ Product

### Purchase (invoice creation)
_Trigger:_ callback:buy:start:{product_id}

1. Create new Order entity with status = pending and reference to product and buyer
2. Build and send Telegram invoice for product price using platform Payments (Stars) with payload containing order id
3. Await Telegram payment callbacks (pre_checkout_query and successful_payment)

_Data touched:_ Order, Product

### Payment confirmation and delivery
_Trigger:_ event:successful_payment (Telegram)

1. Validate successful_payment payload and match invoice payload → order id
2. Update Order: status = paid, store payment receipt id and timestamp
3. Attempt to send the product video file to buyer as a private file message
4. If file send succeeds: update Order status = delivered, send buyer a short delivery message and usage note, notify ADMIN_CHAT_ID of the sale
5. If file send fails (file too large or other error): update Order status = paid (delivery_failed), notify ADMIN_CHAT_ID with order and failure details and instructions for manual delivery

_Data touched:_ Order, PaymentReceipt, Product, User

### Support contact
_Trigger:_ callback:support:start

1. Prompt buyer for a short text message (ForceReply or simple reply flow)
2. On user reply, forward message to ADMIN_CHAT_ID including buyer id, username, and product/order context if available
3. Reply to buyer with an acknowledgement and approximate response time
4. Include staff quick-reply buttons in admin message (e.g., Mark resolved, Reply to buyer) which generate preformatted actions

_Data touched:_ SupportMessage, User

### Admin quick-reply to support
_Trigger:_ callback from ADMIN_CHAT_ID on support message

1. If admin uses Reply to buyer action, open a reply composer that will send a message to the original buyer and log the staff response
2. If admin marks resolved, update SupportMessage status to resolved in storage

_Data touched:_ SupportMessage, User

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat id where new paid orders and support messages are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Product** _(retention: persistent)_ — A digital video item available for purchase
  - fields: id, title, short_description, long_description, price_stars, thumbnail_file_id, video_file_id, seeded_flag
- **Order** _(retention: persistent)_ — A purchase attempt and lifecycle for a single buyer and product
  - fields: id, buyer_telegram_id, buyer_username, product_id, status (pending|paid|delivered|delivery_failed), payment_receipt_id, amount_stars, created_at, delivered_at, notes
- **PaymentReceipt** _(retention: persistent)_ — Payment confirmation data returned by Telegram for auditing and refunds
  - fields: receipt_id, order_id, payment_provider_payload, amount_stars, currency, timestamp
- **SupportMessage** _(retention: persistent)_ — Buyer-submitted support requests routed to admin
  - fields: id, buyer_telegram_id, buyer_username, message_text, attached_context (order_id or product_id optional), status (open|resolved), created_at, staff_responses

## Integrations

- **Telegram Bot API** (required) — Messaging, inline keyboards, callback queries, file delivery
- **Telegram Payments (Stars) via platform merchant config** (required) — Invoice creation and payment capture using the platform-provided payments config; used for one-time purchases
- **Durable storage (database)** (required) — Persist products, orders, receipts, and support messages
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Set or update ADMIN_CHAT_ID (where sale and support notifications go)
- Edit seeded product titles, descriptions, prices, thumbnails and video file attachments
- Mark orders as refunded, delivered, or manually delivered with notes
- Download orders/receipts for a specified date range (export CSV)
- Enable/disable catalog visibility (temporary maintenance mode)

## Notifications

- Notify ADMIN_CHAT_ID on each successful paid order with order id, buyer info, product, amount, and delivery status
- Notify ADMIN_CHAT_ID when automatic delivery fails with failure details and order id
- Send buyer a short confirmation message after payment and a delivery message when the video is sent
- Acknowledge receipt of support requests to the buyer and forward the request to ADMIN_CHAT_ID

## Permissions & privacy

- Store buyer Telegram id, username, payment receipt id and order metadata to fulfill and audit purchases
- Do not share buyer personal data outside ADMIN_CHAT_ID and the owner-controlled storage
- Retain payment receipts and order records for customer support and refund troubleshooting
- Seeded product media is stored for delivery; no DRM or encryption applied per non-goals

## Edge cases

- Buyer completes payment but video file is too large for Telegram limits — bot marks order as delivery_failed and notifies ADMIN_CHAT_ID with instructions for manual delivery
- Invoice created but payment is abandoned or failed — order remains pending; bot sends a reminder or lets buyer re-open Buy flow
- ADMIN_CHAT_ID not configured — sales and support notifications fail; bot should log the condition and surface an admin-setup reminder to owner
- Duplicate successful_payment webhook or replayed events — idempotent order update using order id and payment receipt id
- Buyer has blocked or restricted the bot (cannot send file) — treat as delivery failure and notify ADMIN_CHAT_ID
- Network or Telegram API transient errors when sending files — retry a few times then escalate to admin on persistent failure
- Owner changes a product's price after an order is created — orders preserve the price at time of invoice (stored in Order.amount_stars)

## Required tests

- Dialog-level: /start shows cover, Catalog and Support buttons
- Dialog-level: Catalog lists seeded two products with correct thumbnails and price labels
- Dialog-level: Product Details opens and shows long description and Buy button
- Payment flow: Trigger Buy → invoice appears → simulate successful_payment → order status transitions pending→paid→delivered and buyer receives video file
- Delivery failure: Simulate file send error (e.g., file too large) → order marked delivery_failed and ADMIN_CHAT_ID receives failure notification
- Support flow: Buyer submits support message → ADMIN_CHAT_ID receives forwarded message with buyer metadata; admin quick-reply actions reach buyer
- Idempotency: replay payment webhook and ensure order is not duplicated or double-delivered
- Admin controls: updating product metadata (title/price/media) is reflected in the catalog UI

## Assumptions

- Platform provides Telegram Payments (Stars) merchant config; bot will use platform-provided payments settings
- Two products are seeded at deploy time with owner-supplied or sensible placeholder metadata
- Default placeholder prices in Stars will be acceptable until owner edits them in admin controls
- Durable storage is available and chosen by the build (DB credentials supplied by platform), so no external storage keys are required from the owner
- Admins respond to delivery-failure notifications manually (manual refunds/delivery) per non-goals
