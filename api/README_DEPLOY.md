# DEPLOY CHECKLIST — Astral Guide (astro-konsultacii v2)

Пълният бизнес контекст е в `08_project_dreamcatcher_deploy_checklist.md` в Online Business папката. Това е техническият чеклист.

## 1. Акаунти, които трябва да създадеш (аз не мога вместо теб)

| # | Услуга | За какво | Безплатен tier? |
|---|---|---|---|
| 1 | [Vercel](https://vercel.com) | Hosting на сайта + serverless функции + cron | Да, до 100GB bandwidth/мес |
| 2 | [AstrologyAPI.com](https://astrologyapi.com) или [Prokerala](https://api.prokerala.com) | Реални планетарни транзити + натални карти | 100 безплатни извиквания при регистрация |
| 3 | [OpenAI](https://platform.openai.com) | Генериране на текстовете | Pay-as-you-go, ~0.02-0.05$/анализ |
| 4 | Vercel Postgres (в самия Vercel проект) или [Supabase](https://supabase.com) | База данни за абонати/поръчки/хороскопи | Да |
| 5 | [Stripe](https://stripe.com) | Плащания (еднократни + абонамент) | Без месечна такса, ~1.5%+0.25€/транзакция |
| 6 | [Resend](https://resend.com) | Изпращане на имейли | 3000 имейла/мес безплатно |
| 7 | Домейн (Namecheap/GoDaddy) | напр. astral-guide.com | ~10-15€/година |

## 2. Ред на настройка

1. Купи домейна.
2. Vercel: импортирай проекта (`vercel --prod` или през Git repo), закачи домейна.
3. Vercel Postgres: създай база от Storage таба, копирай `POSTGRES_URL`.
4. Пусни `db/schema.sql` през SQL editor-а на базата.
5. AstrologyAPI/Prokerala: регистрирай се, вземи `ASTROLOGY_API_USER_ID` + `ASTROLOGY_API_KEY`.
6. OpenAI: направи API key.
7. Stripe: **внимавай с бизнес описанието** (виж предупреждението в `api/_lib/stripe.js`) — избягвай думите "psychic/fortune telling/occult", позиционирай като "astrology & self-discovery content platform". Създай 6 Products/Prices: 5 еднократни (5/15/25/20/30€) + 2 recurring — 5.99€/мес и 49€/год (виж ревизия на ценообразуването от 14.07.2026 в `07_project_dreamcatcher_growth_plan.md` Раздел 7). Trial period вече е 30 дни, зададен в кода (`_lib/stripe.js` -> `createSubscriptionCheckout`), не в самия Stripe Price — не е нужно да го конфигурираш отделно в Dashboard. Копирай всички Price ID-та в `.env.example` полетата (вкл. новото `STRIPE_PRICE_SUBSCRIPTION_ANNUAL`).
8. Resend: регистрирай домейна, конфигурирай SPF/DKIM/DMARC (виж `_lib/email.js`), вземи API key.
9. Генерирай случаен `AUTH_SECRET` и `CRON_SECRET` (напр. `openssl rand -hex 32`).
10. Сложи всички стойности от `.env.example` в Vercel Environment Variables.
11. Създай Stripe webhook endpoint към `https://<домейн>/api/webhooks/stripe`, слушащ за `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded` — копирай `STRIPE_WEBHOOK_SECRET`.
12. Stripe Dashboard → Settings → Billing → Customer portal: активирай Billing Portal веднъж и включи и двата Price-а (месечен + годишен) като избираеми за смяна на план — нужно за Ден-25/Ден-30 имейл линковете (`createBillingPortalSession` в `_lib/stripe.js`).
13. Deploy (`vercel --prod`).
14. Тествай ръчно: `/api/cron/generate-daily-horoscopes` и `/api/cron/send-trial-sequence` с правилния `CRON_SECRET` header.
15. Тествай пълен order flow с Stripe test mode карта (4242 4242 4242 4242). За trial→charge цикъла: в Stripe test mode може да "превъртиш" времето през Dashboard → Subscriptions → съответния тест-абонамент → "Advance clock", вместо да чакаш 30 реални дни.

## 3. Какво НЕ мога да направя аз (Claude)

- Не мога да създавам акаунти или да въвеждам платежна информация.
- Не мога да генерирам/съхранявам реални API ключове.
- Не мога да деплойна на живо (нямам достъп до твоя Vercel/Stripe акаунт).

Мога да съм с теб стъпка по стъпка докато го правиш, да ти обясня всеки екран, и да оправям код ако нещо гръмне при теста.

## 4. Geocoding — решено (13.07.2026)

`_lib/astrology.js` -> `geocodePlace()` вече е имплементирана през вградения **`geo_details`** endpoint на AstrologyAPI.com (безплатен, включен във всеки план — https://astrologyapi.com/docs/api-ref/geodetails). Не е нужен отделен geocoding provider (OpenCage и др. струват пари извън малък trial).

Полетата "Място на раждане" във формите (`birthPlace`, `person1BirthPlace`, `person2BirthPlace`) вече се изпращат под точните имена, които `api/_lib/fulfill-order.js` очаква (виж и точка 5 по-долу), и се геокодират сървърна страна в `resolveBirthLocation()`/`buildChartInput()` преди извикване на `getNatalChart()`/`getSynastry()`. `geo_details` връща IANA timezone id (напр. "Europe/Sofia"), не числов offset — конвертира се към числов UTC offset за конкретната рождена дата чрез `tzOffsetForDate()` (Node `Intl`, коректно и за историческа DST).

**Важно за живо тестване:** ако решиш да минеш на Prokerala вместо AstrologyAPI.com, тази функция трябва да се пренапише — Prokerala няма собствен geocoding endpoint, ще трябва отделен provider. Ако адресът е на кирилица и не намира резултат, помолú потребителя за изписване на латиница (напр. "Sofia, Bulgaria") — формите вече имат подсказка за това.

## 5. Field-key mismatch между фронтенда и backend-а — оправено (13.07.2026)

Формите в `index.html` нямаха `name=` атрибути на инпутите; `js/app.js` четеше ключове от `data-i18n` текста на label-а (напр. `"form.birthplace"`), докато `api/_lib/fulfill-order.js` очакваше camelCase ключове (`birthPlace`, `name`, ...). Резултатът: дори с работещ backend, натална карта/съвместимост/бизнес анализ щяха да гърмят, защото очакваните полета никога не пристигат под правилното име. Оправено — всички инпути вече имат явен `name=`, а `app.js` го предпочита пред label hack-а. Полета сега: `name`, `email`, `dreamDescription`, `birthDate`, `birthTime`, `birthPlace`, `questions`, `period`, `person1Name/BirthDate/BirthTime/BirthPlace`, `person2Name/BirthDate/BirthTime/BirthPlace`, `businessFocus`.

## 6. Ценообразуване + промо периоди — ревизирано (14.07.2026)

Пълната бизнес обосновка е в `07_project_dreamcatcher_growth_plan.md` Раздел 7. Технически резюме:

- **Абонамент:** 5.99€/мес (`STRIPE_PRICE_SUBSCRIPTION`) или 49€/год (`STRIPE_PRICE_SUBSCRIPTION_ANNUAL`) — два отделни recurring Prices в Stripe, потребителят избира план в subscribe формата (радио бутон в `index.html`).
- **Trial:** 30 дни вместо оригиналните 90 — зададено в `_lib/stripe.js -> createSubscriptionCheckout(trialDays = 30)`.
- **Картата се въвежда СЕГА, не по-късно:** `api/subscribe.js` вече не само записва лийд + magic-link — веднага създава Stripe subscription Checkout Session (`mode: "subscription"`, `trial_period_days`) и връща `checkoutUrl`, към който `js/app.js` пренасочва браузъра. Това е единственият начин "автоматичното таксуване на Ден 30" да е реално, не маркетингов текст без техническо покритие (оригиналният дизайн предвиждаше запис само с име+имейл, без карта — технически нямаше как да "автоматично" таксува после).
- **Subscription lifecycle:** `api/webhooks/stripe.js` вече слуша и `customer.subscription.updated` (trial→active при първо реално плащане) и коригирано `customer.subscription.deleted` — оригиналният код се опитваше да напасне по `sub.customer_email`, поле, което Stripe subscription обектите нямат (само Checkout Session го има) — отказите никога нямаше да обновят статуса в базата. Сега се търси по `stripe_subscription_id`, записан в `subscribers` таблицата при `checkout.session.completed`.
- **Промо периоди:** `allow_promotion_codes: true` е включено на всички Checkout Sessions (еднократни И абонамент). Управляваш промоции директно от Stripe Dashboard → Product catalog → Coupons/Promotion codes — създаваш промо код с % или фиксирана отстъпка, срок на валидност и лимит на употреби, без да пипаш код или да редеплойваш. Потребителят въвежда кода на самия Stripe Checkout екран.
- **db/schema.sql:** добавени колони `plan` (monthly/annual) и `stripe_subscription_id` към `subscribers` — пусни обновения schema.sql, ако базата вече е създадена преди тази ревизия (`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'monthly', ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;`).

## 7. Ден 1/14/25/30 имейл текстове — написани (14.07.2026)

Пълните текстове (BG/EN/ES) са в `_lib/email.js` -> `sendSequenceEmail()`. Кой кога се задейства:

- **Ден 1** — веднага от `api/subscribe.js`, след magic-link имейла. Съдържание: добре дошъл + мек pitch за Декодера на сънища (5€).
- **Ден 14** — от новия `api/cron/send-trial-sequence.js` (вписан в `vercel.json`, отделно от хороскоп cron-а). Оферта за пълна натална карта (25€).
- **Ден 25** — от същия cron. "Trial-ът изтича след 5 дни" + upsell към годишния план (49€/год) през Stripe Billing Portal линк (изисква т. 12 по-горе).
- **Ден 30** — НЕ по брой дни (ненадеждно спрямо реалния Stripe billing цикъл) — тригернато от `invoice.payment_succeeded` webhook събитието, точно в момента на реалното първо таксуване. `_lib/db.js -> claimFirstChargeEmail()` е атомарен guard срещу дублирано изпращане, ако Stripe достави събитието повторно (документирано поведение на Stripe webhooks).
- **Нова колона:** `subscribers.first_charge_email_sent_at` — пусни `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS first_charge_email_sent_at TIMESTAMPTZ;`, ако базата вече съществува.
- **Нов endpoint:** `api/billing-portal.js` (POST { email }) — връща Billing Portal URL за произволен съществуващ абонат; ползва се от cron-а, може да се закачи и за бутон "Управлявай абонамента" на самия сайт.
