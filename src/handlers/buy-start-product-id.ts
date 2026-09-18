import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { ensureProducts, now, nowEpoch, type Order, type Product, saveState } from "../store.js";

const composer = new Composer<Ctx>();
const orderId = (ctx: Ctx) => `order-${ctx.chat?.id ?? "buyer"}-${nowEpoch()}`;

composer.callbackQuery(/^buy:start:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const state = await ensureProducts(ctx);
  const product = state.products[ctx.match[1]];
  if (!product || !product.visible) {
    await ctx.reply("That video isn't available right now. Open the catalog to choose another.");
    return;
  }
  const id = orderId(ctx);
  const order: Order = {
    id,
    buyerTelegramId: ctx.from.id,
    buyerUsername: ctx.from.username,
    productId: product.id,
    status: "pending",
    amountStars: product.priceStars,
    createdAt: now(),
  };
  state.orders[id] = order;
  state.orderIds.push(id);
  await saveState(ctx, state);
  await ctx.replyWithInvoice(product.title, product.shortDescription, id, "XTR", [{ label: product.title, amount: product.priceStars }], {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Catalog", "catalog:start")]]),
  });
});

composer.on("pre_checkout_query", async (ctx) => {
  const state = await ensureProducts(ctx);
  const order = state.orders[ctx.preCheckoutQuery.invoice_payload];
  if (!order || order.buyerTelegramId !== ctx.from.id || order.status !== "pending") {
    await ctx.answerPreCheckoutQuery(false, { error_message: "This order is no longer available. Please start again." });
    return;
  }
  await ctx.answerPreCheckoutQuery(true);
});

async function notifyAdmin(ctx: Ctx, text: string, keyboard?: ReturnType<typeof inlineKeyboard>) {
  const admin = adminChatId(ctx as never);
  if (!admin) return false;
  try { await ctx.api.sendMessage(admin, text, keyboard ? { reply_markup: keyboard } : undefined); return true; } catch { return false; }
}

async function deliver(ctx: Ctx, order: Order, product: Product) {
  let delivered = false;
  let failure = "Telegram couldn't send the video.";
  for (let attempt = 0; attempt < 3 && !delivered; attempt++) {
    try { await ctx.api.sendVideo(order.buyerTelegramId, product.videoFileId, { caption: "Thanks for your purchase! Keep this video for personal use." }); delivered = true; }
    catch (error) { failure = error instanceof Error ? error.message : failure; }
  }
  const state = await ensureProducts(ctx);
  const current = state.orders[order.id];
  if (!current) return;
  if (delivered) {
    current.status = "delivered";
    current.deliveredAt = now();
    await saveState(ctx, state);
    await ctx.reply("Your video is ready — enjoy it! 🎬");
    await notifyAdmin(ctx, `Sale paid and delivered\nOrder: ${order.id}\nProduct: ${product.title}\nBuyer: ${order.buyerUsername ? `@${order.buyerUsername}` : order.buyerTelegramId}\nAmount: ⭐ ${order.amountStars}`);
  } else {
    current.status = "delivery_failed";
    current.notes = failure;
    await saveState(ctx, state);
    await ctx.reply("Your payment went through, but the video couldn't be delivered automatically. Support will help you shortly.");
    await notifyAdmin(ctx, `Delivery needs manual help\nOrder: ${order.id}\nProduct: ${product.title}\nReason: ${failure}`);
  }
}

composer.on("message", async (ctx, next) => {
  if (!("successful_payment" in ctx.message)) return next();
  const payment = ctx.message.successful_payment;
  if (!payment) return;
  const state = await ensureProducts(ctx);
  const order = state.orders[payment.invoice_payload];
  if (!order) return;
  if (order.status === "delivered" || order.status === "delivery_failed") return;
  if (order.status === "paid" && order.paymentReceiptId === payment.telegram_payment_charge_id) return;
  const product = state.products[order.productId];
  if (!product || payment.total_amount !== order.amountStars || payment.currency !== "XTR") return;
  order.status = "paid";
  order.paymentReceiptId = payment.telegram_payment_charge_id;
  await saveState(ctx, state);
  await deliver(ctx, order, product);
});

export default composer;
