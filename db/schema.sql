-- Пусни веднъж срещу твоята Postgres база (Vercel Postgres / Supabase SQL editor)
-- преди първия деплой.

CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  sign TEXT,
  lang TEXT DEFAULT 'bg',
  status TEXT DEFAULT 'trial',           -- trial | active | cancelled
  plan TEXT DEFAULT 'monthly',           -- monthly (5.99€) | annual (49€) — виж growth плана Раздел 7
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  first_charge_email_sent_at TIMESTAMPTZ,  -- guard срещу дублирано Ден-30 писмо (виж webhooks/stripe.js)
  trial_started_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS horoscopes (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  sign TEXT NOT NULL,
  lang TEXT NOT NULL,
  teaser TEXT,
  full_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date, sign, lang)
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,                    -- dream | horoscope | natal | compat | business
  email TEXT NOT NULL,
  lang TEXT DEFAULT 'bg',
  fields JSONB,
  price_eur NUMERIC,
  stripe_session_id TEXT,
  status TEXT DEFAULT 'pending',         -- pending | paid | delivered
  paid_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_horoscopes_date_lang ON horoscopes (date, lang);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders (stripe_session_id);

-- Добавено 16.07.2026 — седмичен AI визуали/видео пайплайн (Nano Banana 2 / Veo 3.1),
-- виж api/cron/generate-weekly-content.js и api/cron/poll-weekly-content.js.
CREATE TABLE IF NOT EXISTS content_jobs (
  id SERIAL PRIMARY KEY,
  week_of DATE NOT NULL,
  kind TEXT NOT NULL,             -- 'image' | 'video'
  label TEXT,                     -- напр. "leo-quote" / "atmosphere-1"
  prompt TEXT,
  status TEXT DEFAULT 'pending',  -- pending | processing | ready | failed
  operation_name TEXT,            -- Veo operation name (само за kind='video'), за poll cron-а
  blob_url TEXT,                  -- краен публичен URL във Vercel Blob, щом е готово
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_jobs_status ON content_jobs (status);
CREATE INDEX IF NOT EXISTS idx_content_jobs_week ON content_jobs (week_of);
