import type { Ctx } from "./bot.js";

export interface Product {
  id: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  priceStars: number;
  thumbnailFileId: string;
  videoFileId: string;
  seededFlag: boolean;
  visible: boolean;
}

export interface Order {
  id: string;
  buyerTelegramId: number;
  buyerUsername?: string;
  productId: string;
  status: "pending" | "paid" | "delivered" | "delivery_failed";
  paymentReceiptId?: string;
  amountStars: number;
  createdAt: string;
  deliveredAt?: string;
  notes?: string;
}

export interface SupportMessage {
  id: string;
  buyerTelegramId: number;
  buyerUsername?: string;
  messageText: string;
  attachedContext?: string;
  status: "open" | "resolved";
  createdAt: string;
  staffResponses: string[];
}

export interface DomainState {
  products: Record<string, Product>;
  orders: Record<string, Order>;
  supports: Record<string, SupportMessage>;
  orderIds: string[];
  supportIds: string[];
  seeded: boolean;
  maintenance: boolean;
}

const seededProducts: Product[] = [
  {
    id: "sunrise",
    title: "Sunrise in the City",
    shortDescription: "A bright, cinematic morning walk.",
    longDescription: "Watch the city wake up in warm light, with a gentle soundtrack and quick cinematic cuts.",
    priceStars: 25,
    thumbnailFileId: "AgAC-sunrise-preview",
    videoFileId: "BAAC-sunrise-video",
    seededFlag: true,
    visible: true,
  },
  {
    id: "rainy-window",
    title: "Rainy Window",
    shortDescription: "A calm, close-up study of rain and light.",
    longDescription: "Slow rain on a window, soft reflections, and a quiet mood for a few peaceful minutes.",
    priceStars: 35,
    thumbnailFileId: "AgAC-rainy-window-preview",
    videoFileId: "BAAC-rainy-window-video",
    seededFlag: true,
    visible: true,
  },
];

type D1 = {
  prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> } };
};

function db(ctx: Ctx): D1 | undefined {
  const env = (ctx as Ctx & { env?: { DB?: unknown } }).env;
  return env?.DB as D1 | undefined;
}

function sessionState(ctx: Ctx): DomainState {
  const session = ctx.session as Ctx["session"] & { domain?: DomainState };
  session.domain ??= { products: {}, orders: {}, supports: {}, orderIds: [], supportIds: [], seeded: false, maintenance: false };
  session.domain.maintenance ??= false;
  return session.domain;
}

async function d1Get<T>(ctx: Ctx, key: string): Promise<T | undefined> {
  const database = db(ctx);
  if (!database) return undefined;
  await database.prepare("CREATE TABLE IF NOT EXISTS bot_records (record_key TEXT PRIMARY KEY, record_value TEXT NOT NULL)").bind().run();
  const row = await database.prepare("SELECT record_value FROM bot_records WHERE record_key = ?").bind(key).first<{ record_value: string }>();
  return row ? (JSON.parse(row.record_value) as T) : undefined;
}

async function d1Put<T>(ctx: Ctx, key: string, value: T): Promise<void> {
  const database = db(ctx);
  if (!database) return;
  await database.prepare("CREATE TABLE IF NOT EXISTS bot_records (record_key TEXT PRIMARY KEY, record_value TEXT NOT NULL)").bind().run();
  await database.prepare("INSERT INTO bot_records(record_key, record_value) VALUES(?, ?) ON CONFLICT(record_key) DO UPDATE SET record_value=excluded.record_value").bind(key, JSON.stringify(value)).run();
}

export async function getState(ctx: Ctx): Promise<DomainState> {
  const stored = await d1Get<DomainState>(ctx, "store:state");
  if (stored) return stored;
  const state = sessionState(ctx);
  state.maintenance ??= false;
  return state;
}

export async function saveState(ctx: Ctx, state: DomainState): Promise<void> {
  await d1Put(ctx, "store:state", state);
  if (!db(ctx)) (ctx.session as Ctx["session"] & { domain?: DomainState }).domain = state;
}

export async function ensureProducts(ctx: Ctx): Promise<DomainState> {
  const state = await getState(ctx);
  if (!state.seeded) {
    for (const product of seededProducts) state.products[product.id] = product;
    state.seeded = true;
    await saveState(ctx, state);
  }
  return state;
}

export function now(): string { return new Date().toISOString(); }
export function nowEpoch(): number { return new Date().getTime(); }

export function productButtons(product: Product) {
  return [
    { text: `⭐ Buy ${product.priceStars}`, callback_data: `buy:start:${product.id}` },
    { text: "Details", callback_data: `product:details:${product.id}` },
  ];
}
