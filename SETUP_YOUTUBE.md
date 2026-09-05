# Lumaris — еднократен setup за автоматично YouTube качване

Единствената РЪЧНА стъпка, оставаща преди `.github/workflows/daily-shorts.yml`
да тръгне напълно самостоятелно (генерира + качва 4 Shorts/ден, 0 клика от
теб). Отнема ~15-20 минути, прави се ЕДНЪЖ. Точно същия процес вече мина
успешно за сестринския канал `statevpp/proof-in-numbers` — тук е повторен за
канала "Lumaris" (`UCxoXLW9E0Qcj1167fIZDlOA`).

## Защо е нужен НОВ, отделен Google Cloud проект (не същия като Proof in Numbers)

YouTube Data API v3 дава 10 000 "units"/ден квота **по Google Cloud проект**,
не по канал. Едно видео качване = 1 600 units. Proof in Numbers вече харчи
4 × 1 600 = 6 400 units/ден в своя проект. Ако Lumaris делеше СЪЩИЯ проект,
добавените 4 качвания/ден (още 6 400 units) биха надвишили дневния лимит и
на двата канала някой ден биха започнали да се провалят на случаен принцип.
Затова — нов проект, собствена 10 000/ден квота, напълно изолирано.

## Стъпки

1. Отиди на https://console.cloud.google.com/ → създай НОВ проект (напр.
   "lumaris-youtube") → **APIs & Services → Library** → намери и **Enable**
   "YouTube Data API v3".

2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type: **Desktop app** → изтегли `client_secret.json`.

   (Ако Google поиска да конфигурираш OAuth consent screen първо: User
   type "External", попълни само задължителните полета — име на приложение,
   твоя имейл — и добави своя Google акаунт, с който управляваш канала
   Lumaris, като **Test user**. Не е нужно да подаваш за verification/audit
   — тестов режим е достатъчен за собствено, еднолично качване, само имай
   предвид бележката по-долу за "Testing" vs "In production" статус.)

3. Изтегленият `client_secret.json` съдържа `client_id` и `client_secret` —
   ще ти трябват в стъпка 5.

4. На компютъра си (не в GitHub Actions), с Python и `pip install
   google-auth-oauthlib` инсталирани, запази това като `get_refresh_token.py`
   в същата папка с `client_secret.json`, после пусни `python3
   get_refresh_token.py`:

   ```python
   from google_auth_oauthlib.flow import InstalledAppFlow

   SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
   flow = InstalledAppFlow.from_client_secrets_file("client_secret.json", SCOPES)
   creds = flow.run_local_server(port=0)
   print("REFRESH TOKEN:", creds.refresh_token)
   ```

   Отваря браузър — влез с Google акаунта, който управлява канала Lumaris
   (не задължително statev.petrov@gmail.com, ако каналът е брандиран под
   друг акаунт — важното е акаунтът, който вижда/управлява точно канала
   Lumaris в YouTube Studio), одобри достъпа. Refresh token-ът, който се
   отпечатва накрая, не изтича, освен ако сам не го отмениш от
   https://myaccount.google.com/permissions.

   **Важен нюанс за "Testing" статус на OAuth consent screen-а:** ако
   приложението остане в "Testing" публикуващ статус (не "In production"),
   Google понякога изтрива refresh token-и на test users след 7 дни
   неактивност или прекомпилиране на consent screen-а — ако автоматизацията
   един ден спре с auth грешка без видима причина, това е първото нещо за
   проверка (просто пусни пак `get_refresh_token.py` за нов token). Ако
   искаш да избегнеш това изцяло, в OAuth consent screen настройките можеш
   да преминеш статуса на "In production" — за scope `youtube.upload` (не е
   в списъка на Google "restricted/sensitive scopes", които изискват пълен
   security audit) това обичайно е възможно без чакане.

5. GitHub → `statevpp/dream-astro` → **Settings → Secrets and variables →
   Actions → New repository secret**, добави три:
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET`
   - `YOUTUBE_REFRESH_TOKEN`

   (стойностите от стъпки 3 и 4 — въведи ги директно в GitHub UI, никъде
   другаде не е нужно да ги пазиш/споделяш)

6. Кажи "готово" (или просто пусни workflow-а сам от Actions таба, "Lumaris
   — Daily Shorts" → **Run workflow**) — оттам нататък всичко е автоматично,
   4 нови Shorts/ден, всеки за различен зодиакален знак.

## Privacy status

`.github/workflows/daily-shorts.yml` качва като `"private"` по подразбиране
— смени `YOUTUBE_PRIVACY_STATUS: "private"` на `"public"` в workflow файла
веднага щом прегледаш първите няколко клипа и си доволен от качеството (виж
стъпка 6 в `SETUP.md` на proof-in-numbers за същия принцип — там мина
директно на "public" без нужда от отделен Google audit, само собствено
качване на собствен канал).
