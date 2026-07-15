/**
 * POST /api/webhooks/stripe
 * Приема Stripe събития. Провери подписа, за да е сигурно че идва от Stripe.
 * За еднократни продукти: тригерва fulfillOrder() (AI генериране + PDF + имейл).
 * За абонамента: обновява статуса на абоната в DB.
 *
 * TODO: в Stripe Dashboard -> Webhooks, добави endpoint URL
 * https://<домейн>/api/webhooks/stripe, слушащ за:
 *   checkout.session.completed, customer.subscription.updated,
 *   customer.subscription.deleted, invoice.payment_succeeded
 */

const { constructWebhookEvent, createBillingPortalSession } = require("../_lib/stripe");
const { markOrderPaid, setSubscriberStatus, setSubscriberBySubscriptionId, claimFirstChargeEmail } = require("../_lib/db");
const { fulfillOrder } = require("../_lib/fulfill-order");
const { sendSequenceEmail } = require("../_lib/email");

const PLAN_LABELS = {
  bg: { monthly: "месечен, 5.99 €/мес", annual: "годишен, 49 €/год" },
  en: { monthly: "monthly, €5.99/mo", annual: "annual, €49/yr" },
  es: { monthly: "mensual, 5.99 €/mes", annual: "anual, 49 €/año" },
};

function formatInvoiceAmount(amountInCents, currency) {
  const amount = (amountInCents / 100).toFixed(2);
  return currency?.toUpperCase() === "EUR" ? `${amount} €` : `${amount} ${currency?.toUpperCase() || ""}`;
}

/** Stripe subscription.status -> нашия вътрешен речник (trial | active | cancelled) */
function mapStripeSubStatus(stripeStatus) {
  if (stripeStatus === "trialing") return "trial";
  if (stripeStatus === "active") return "active";
  if (["canceled", "unpaid", "incomplete_expired"].includes(stripeStatus)) return "cancelled";
  return null; // past_due/incomplete и др. — не пипай статуса тихо, остави за ръчен преглед
}

// Изисква суров body за проверка на подписа — изключи вградения parser на Vercel.
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  const rawBody = await readRawBody(req);
  let event;

  try {
    event = constructWebhookEvent(rawBody, req.headers["stripe-signature"]);
  } catch (err) {
    console.error("Невалиден Stripe подпис:", err);
    return res.status(400).send(`Webhook signature verification failed`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "payment") {
          const order = await markOrderPaid(session.id);
          if (order.rows?.[0]) await fulfillOrder(order.rows[0]);
        } else if (session.mode === "subscription") {
          // trial_period_days означава, че статусът реално е "trial" в момента
          // на checkout.session.completed — Stripe таксува чак след trial-а.
          // customer.subscription.updated (по-долу) ще го премести на "active"
          // при първото реално плащане.
          await setSubscriberStatus(session.customer_email, "trial", session.customer, {
            plan: session.metadata?.plan,
            stripeSubscriptionId: session.subscription,
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const status = mapStripeSubStatus(sub.status);
        if (status) await setSubscriberBySubscriptionId(sub.id, { status });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await setSubscriberBySubscriptionId(sub.id, { status: "cancelled" });
        break;
      }
      case "invoice.payment_succeeded": {
        // Ден-30 "абонаментът ти е активен" имейл — тригернат от РЕАЛНОТО
        // таксуване (не от преброяване на дни, ненадеждно спрямо действителния
        // billing цикъл на Stripe). claimFirstChargeEmail() е атомарен guard —
        // изпраща се точно веднъж, дори ако Stripe достави събитието повторно
        // (изрично документирано поведение на Stripe webhooks).
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId && invoice.amount_paid > 0) {
          const subscriber = await claimFirstChargeEmail(subscriptionId);
          if (subscriber) {
            const lang = ["bg", "en", "es"].includes(subscriber.lang) ? subscriber.lang : "bg";
            const plan = subscriber.plan === "annual" ? "annual" : "monthly";
            let billingPortalUrl = process.env.SITE_URL || "https://astral-guide.com";
            if (subscriber.stripe_customer_id) {
              const portal = await createBillingPortalSession({
                customerId: subscriber.stripe_customer_id,
                returnUrl: `${process.env.SITE_URL || "https://astral-guide.com"}/`,
              });
              billingPortalUrl = portal.url;
            }
            await sendSequenceEmail("day30", subscriber.email, lang, {
              name: subscriber.name,
              planLabel: PLAN_LABELS[lang][plan],
              amount: formatInvoiceAmount(invoice.amount_paid, invoice.currency),
              billingPortalUrl,
            });
          }
        }
        break;
      }
      default:
        break; // игнорирай останалите събития
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Грешка при обработка на webhook:", err);
    return res.status(500).json({ error: "internal error" });
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
