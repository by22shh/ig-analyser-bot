# Финансовая модель ZRETI Telegram Bot

Версия: 0.3.

Дата: 2026-06-03.

Цель документа: зафиксировать стартовую модель монетизации, pricing, unit economics, YooKassa fees, Telegram Stars, credit ledger, метрики прибыльности и no-loss guardrails для Telegram-бота.

## 1. Ключевая модель

MVP продает предоплаченные пакеты кредитов через Telegram Stars и, где разрешено, через YooKassa.

Пользовательский поток:

1. Пользователь выбирает пакет кредитов в `/credits`.
2. Пользователь выбирает Stars или RUB-канал.
3. Для Stars бот отправляет `sendInvoice(currency=XTR)`.
4. Для YooKassa бот создает платеж и отправляет payment link.
5. Backend подтверждает оплату через `successful_payment` или server-to-server YooKassa reconciliation.
6. Backend начисляет credits.
7. Credits списываются за анализы и дополнительные AI-вопросы.

В MVP нет:

- постоплаты;
- рекуррентных подписок;
- автоплатежей;
- кредитования пользователя;
- списания реальных денег за каждый анализ.

### 1.1. Executive verdict: будем ли терять?

Короткий ответ: при текущей иллюстративной себестоимости `C_standard = 55 RUB` мы не теряем деньги в узком variable-cost смысле, но Pro/Agency/Scale не проходят строгий защитный стандарт, который уже используется в соседнем проекте `ai-assistant-bot`.

Разница:

- Абсолютный no-loss: себестоимость одного анализа ниже net revenue за списанные credits.
- Здоровая платная экономика: net revenue покрывает себестоимость минимум в `3x`, чтобы выдержать рост цен провайдеров, возвраты, ошибки, поддержку, курс, налоговые и платежные отклонения.

С текущими пакетами и консервативным платежным резервом `20%`:

| Package | RUB / credit | Net guardrail RUB / credit | Max provider cost without variable loss | Max provider cost for 3x safety | Status at `C_standard = 55 RUB` |
| --- | ---: | ---: | ---: | ---: | --- |
| Start | 230.00 | 184.00 | 184.00 | 61.33 | Safe |
| Pro | 199.00 | 159.20 | 159.20 | 53.07 | Too cheap for 3x |
| Agency | 183.00 | 146.40 | 146.40 | 48.80 | Too cheap for 3x |
| Scale | 159.00 | 127.20 | 127.20 | 42.40 | Too cheap for 3x |

С новым Stars-каталогом `230 XTR/credit` и conservative floor `0.01 USD/XTR`, `90 RUB/USD`, `20%` reserve:

| Package | XTR / credit | Net RUB-equivalent / credit | Max provider cost for 3x safety | Status at `C_standard = 55 RUB` |
| --- | ---: | ---: | ---: | --- |
| Start | 230 | 165.60 | 55.20 | Safe, but tight |
| Pro | 230 | 165.60 | 55.20 | Safe, but tight |
| Agency | 230 | 165.60 | 55.20 | Safe, but tight |

Решение для launch:

- Stars Start можно оставлять публичным при `C_standard p75 <= 55 RUB`, если payout floor подтвержден.
- YooKassa Start можно оставлять публичным при `C_standard p75 <= 61 RUB`.
- Pro можно включать только если `C_standard p75 <= 53 RUB` или поднять цену минимум до `2,063 RUB` за 10 credits.
- Agency можно включать только если `C_standard p75 <= 48 RUB` или поднять цену минимум до `6,188 RUB` за 30 credits.
- Scale нельзя включать публично при `C_standard = 55 RUB`; нужно либо `C_standard p75 <= 42 RUB`, либо цена минимум `20,625 RUB` за 100 credits, либо ручная продажа/договор.

Практический вывод: на старте лучше продавать Stars Start и/или YooKassa Start, а discounted YooKassa Pro/Agency/Scale держать скрытыми/feature-gated до измерения реальной p75 себестоимости минимум на 50-100 отчетах. Stars Pro/Agency можно включать только без bulk-discount: `230 XTR/credit` или выше.

### 1.2. Принципы, взятые из `ai-assistant-bot`

Из соседнего бота нужно перенести не конкретные цены, а практики финансовой безопасности:

- `ECON_TARGET_REVENUE_MULTIPLE = 3`: выручка после резервов должна быть минимум в 3 раза выше variable provider cost.
- `ECON_PAYMENT_FEE_RESERVE = 0.20`: для guardrails используется 20% резерв, даже если фактическая YooKassa-комиссия ниже.
- `ECON_USD_TO_RUB_BUFFER = 90`: USD-расходы провайдеров считаются по буферному курсу, а не по оптимистичному текущему.
- `ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR = 0.01` и `ECON_STARS_PAYOUT_RESERVE = 0.20`: Stars считаются по консервативному RUB-equivalent floor.
- Все дорогие операции имеют caps: посты, изображения, токены, output tokens, timeout, размер файлов.
- Есть отдельный `audit-economics`/`audit-prices`, который падает в CI при price drift, превышении caps или недостаточном credit price.
- Free/admin/referral credits считаются acquisition spend, а не revenue-backed usage.
- Списание credits атомарное, возврат credits идет только по неуспешной операции или unused paid balance.
- Webhook YooKassa никогда не считается источником истины сам по себе: backend повторно получает payment/refund через API и только потом начисляет credits.

## 2. Credit units

В БД credits хранятся в minor units:

```text
1 credit = 100 credit_units
```

Стоимость функций:

| Функция | Units | Credits |
| --- | ---: | ---: |
| Standard analysis | 100 | 1 |
| Influencer audit | 200 | 2 |
| HR analysis | 200 | 2 |
| Photo search | 100 | 1 |
| OSINT / Compliance | 300+ | 3+ |
| Chat message after included cap | 5 | 0.05 |
| PDF/Markdown export | 0 | Included |

## 3. Launch packages

Рекомендуемые пакеты v0.2:

| Package | Credits | Notes |
| --- | ---: | --- |
| Trial | 1 | Только admin grant |
| Start | 3 | Первый платеж |
| Pro | 10 | Базовый пакет |
| Agency | 30 | Малые команды |
| Scale | 100 | Агентства, только если себестоимость стабильна |

YooKassa RUB prices:

| Package | Price RUB | RUB / credit | Notes |
| --- | ---: | ---: | --- |
| Start | 690 | 230 | Public if `audit-economics` passes |
| Pro | 1,990 | 199 | Hidden/reprice until p75 cost is proven |
| Agency | 5,490 | 183 | Hidden/reprice until p75 cost is proven |
| Scale | 15,900 | 159 | Negotiated/hidden |

Telegram Stars prices:

| Package | Price XTR | XTR / credit | Notes |
| --- | ---: | ---: | --- |
| Start | 690 | 230 | Public after Stars payout floor confirmation |
| Pro | 2,300 | 230 | Public only if `audit-economics` passes |
| Agency | 6,900 | 230 | Public only if `audit-economics` passes |
| Scale | 23,000 | 230 | Hidden; check Bot API amount limits before enabling |

Pricing rules:

- YooKassa prices are in RUB.
- Stars prices are in `XTR` and must be modeled separately from RUB.
- Пакеты должны быть конфигурацией, не hard-code.
- Scale нельзя включать публично, пока фактическая себестоимость standard report не подтверждена.
- Pro/Agency/Scale нельзя включать публично, если они снижают `P_credit_guardrail_net_floor` ниже текущей p75 себестоимости с `3x` покрытием.
- Stars bulk discounts запрещены до подтверждения payout floor и налоговой модели.
- Enterprise/custom можно продавать вручную через договор/счет.

## 4. YooKassa fee assumptions

Стартовые переменные:

```text
r_acquiring = 2.8%
r_receipt = 1.0%        # если используются "Чеки от YooKassa"
r_commission_vat = 20%  # НДС на комиссию, если применимо по договору
```

Conservative effective rate:

```text
r_yk_effective = (r_acquiring + r_receipt) * (1 + r_commission_vat)
r_yk_effective = (2.8% + 1.0%) * 1.20 = 4.56%
```

Важно:

- Это расчетная модель, не юридически финальный тариф.
- Перед запуском заменить ставки на условия подписанного договора YooKassa.
- Если чеки делаются не через YooKassa, `r_receipt` может быть другим или равным 0, но появится стоимость сторонней кассы.
- Публичная страница YooKassa может быть акцией/спецусловием по датам; финальный источник истины - договор и личный кабинет мерчанта.

## 4.1. Telegram Stars assumptions

Стартовые переменные:

```text
ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR = 0.01
ECON_STARS_PAYOUT_RESERVE = 20%
ECON_USD_TO_RUB_BUFFER = 90
```

RUB-equivalent formula:

```text
stars_gross_rub_equivalent =
  stars_amount
  * ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR
  * ECON_USD_TO_RUB_BUFFER

stars_net_rub_equivalent =
  stars_gross_rub_equivalent
  * (1 - ECON_STARS_PAYOUT_RESERVE)
```

Example:

```text
Start Stars = 690 XTR
stars_net_rub_equivalent = 690 * 0.01 * 90 * 0.80 = 496.80 RUB
net_per_credit = 496.80 / 3 = 165.60 RUB
provider multiple at C_standard=55 = 165.60 / 55 = 3.01x
```

Важно:

- Stars are not treated as RUB cash at purchase time; they are tracked as platform balance/reward value until settlement.
- Actual payout/reward economics must be confirmed in Telegram account data and accounting review.
- If payout floor is lower than `0.01 USD/XTR`, all Stars prices must be repriced upward or disabled.
- Stars refunds are made through Telegram Bot API `refundStarPayment`, not through YooKassa.

## 4.2. Conservative guardrail reserves

Для бухгалтерского отчета можно считать точные комиссии YooKassa. Для pricing guardrails нужно использовать более жесткие переменные:

```text
ECON_USD_TO_RUB_BUFFER = 90
ECON_PAYMENT_FEE_RESERVE = 20%
ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR = 0.01
ECON_STARS_PAYOUT_RESERVE = 20%
ECON_TARGET_REVENUE_MULTIPLE = 3
ECON_COST_BASIS = p75_or_worst_case
```

Formula:

```text
P_credit_card_net_floor =
  min(public_package_price_rub / public_package_credits)
  * (1 - ECON_PAYMENT_FEE_RESERVE)

P_credit_stars_net_floor =
  min(public_package_stars / public_package_credits)
  * ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR
  * ECON_USD_TO_RUB_BUFFER
  * (1 - ECON_STARS_PAYOUT_RESERVE)

P_credit_guardrail_net_floor =
  min(P_credit_card_net_floor, P_credit_stars_net_floor)

net_revenue_for_operation =
  charged_credits * P_credit_guardrail_net_floor

required_net_revenue =
  provider_cost_rub_p75_or_worst_case * ECON_TARGET_REVENUE_MULTIPLE

safe =
  net_revenue_for_operation >= required_net_revenue
```

Required credit units:

```text
required_credit_units =
  ceil(
    provider_cost_rub_p75_or_worst_case
    * ECON_TARGET_REVENUE_MULTIPLE
    / P_credit_guardrail_net_floor
    * 100
  )
```

If a mode costs less than `required_credit_units`, we either raise the credit cost, hide the mode, reduce provider cost/caps, or raise package prices.

## 5. Provider cost variables

Каждый внешний вызов должен попадать в `api_usage_events`.

```text
C_apify_profile
C_image_fetch
C_vision_batches
C_reasoning
C_facecheck
C_chat
C_pdf
C_storage
C_support
```

Mode cost:

```text
C_standard =
  C_apify_profile
  + C_image_fetch
  + C_vision_batches
  + C_reasoning
  + C_pdf
  + C_storage
  + C_support

C_influencer = C_standard + C_reasoning_delta
C_hr = C_standard + C_reasoning_delta
C_photo_search = C_facecheck + C_storage + C_support
C_chat_message = C_chat
```

Required cost caps:

| Cost dimension | MVP cap | Why it matters |
| --- | ---: | --- |
| Instagram posts | 30 | Prevents Apify/vision/report context from growing with large profiles |
| Vision batch size | 5 | Keeps image analysis predictable and retryable |
| Images analyzed | 30 | Matches post cap and bounds image download/vision spend |
| Image download size | 8 MB per image | Prevents traffic and processing spikes |
| Final report input tokens | model-specific fixed budget | Prevents long profile data from expanding LLM spend |
| Final report output tokens | model-specific fixed budget | Prevents verbose reports from exceeding modeled cost |
| Report chat input/output | model-specific fixed budget | Makes post-report chat chargeable and auditable |
| FaceCheck search | timeout + max cost per search | Photo search must not become an uncapped external spend |
| PDF rendering | timeout + max artifact size | Prevents worker blockage and storage surprises |

Every cap must be represented in configuration and in `audit-economics`.

## 6. Margin formulas

```text
gross_payment = package_price_rub
yookassa_fee = gross_payment * r_yk_effective
net_after_yookassa = gross_payment - yookassa_fee

P_credit_gross = package_price_rub / package_credits
P_credit_net = P_credit_gross * (1 - r_yk_effective)

gross_margin_per_credit = P_credit_net - C_standard
gross_margin_percent = gross_margin_per_credit / P_credit_gross
```

Minimum price:

```text
P_credit_min = C_standard / (1 - r_yk_effective - target_margin)
```

Example:

```text
C_standard = 55 RUB
r_yk_effective = 4.56%
target_margin = 60%
P_credit_min = 55 / (1 - 0.0456 - 0.60)
P_credit_min = 155.19 RUB
```

## 7. Example contribution model

Assumption:

```text
C_standard = 55 RUB
r_yk_effective = 4.56%
```

| Package | Gross RUB | Net after YooKassa | Provider cost | Contribution | Contribution margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Start | 690 | 658.54 | 165 | 493.54 | 71.5% |
| Pro | 1,990 | 1,899.26 | 550 | 1,349.26 | 67.8% |
| Agency | 5,490 | 5,239.66 | 1,650 | 3,589.66 | 65.4% |
| Scale | 15,900 | 15,174.96 | 5,500 | 9,674.96 | 60.8% |

Stars contribution model:

```text
C_standard = 55 RUB
ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR = 0.01
ECON_USD_TO_RUB_BUFFER = 90
ECON_STARS_PAYOUT_RESERVE = 20%
```

| Package | Stars | Net RUB-equivalent | Provider cost | Contribution equivalent | Net/provider multiple |
| --- | ---: | ---: | ---: | ---: | ---: |
| Start | 690 | 496.80 | 165 | 331.80 | 3.01x |
| Pro | 2,300 | 1,656.00 | 550 | 1,106.00 | 3.01x |
| Agency | 6,900 | 4,968.00 | 1,650 | 3,318.00 | 3.01x |

Stars are intentionally priced without bulk discount in v0.2. At `C_standard = 55 RUB`, `230 XTR/credit` is just above the strict `3x` threshold. If real `C_standard p75` is higher than 55 RUB, Stars prices must increase or affected packages must be disabled.

Same packages under strict guardrail:

```text
ECON_PAYMENT_FEE_RESERVE = 20%
ECON_TARGET_REVENUE_MULTIPLE = 3
C_standard = 55 RUB
required_gross_rub_per_credit = 55 * 3 / (1 - 0.20) = 206.25 RUB
```

| Package | Gross RUB / credit | Net guardrail RUB / credit | Net/provider multiple | 3x result |
| --- | ---: | ---: | ---: | --- |
| Start | 230.00 | 184.00 | 3.35x | Pass |
| Pro | 199.00 | 159.20 | 2.89x | Fail |
| Agency | 183.00 | 146.40 | 2.66x | Fail |
| Scale | 159.00 | 127.20 | 2.31x | Fail |

To keep `C_standard = 55 RUB` and pass the `3x` rule, minimum package prices are:

| Package | Current price | Minimum strict price | Recommended action |
| --- | ---: | ---: | --- |
| Start, 3 credits | 690 | 619 | Keep |
| Pro, 10 credits | 1,990 | 2,063 | Raise to 2,090+ or enable only after cost reduction |
| Agency, 30 credits | 5,490 | 6,188 | Raise to 6,190+ or keep hidden |
| Scale, 100 credits | 15,900 | 20,625 | Keep hidden / negotiated / reprice to 20,900+ |

If `C_standard = 80 RUB`:

```text
P_credit_min = 80 / (1 - 0.0456 - 0.60) = 225.73 RUB
```

Interpretation:

- При себестоимости 80 RUB пакет Pro уже слишком дешев для 60% target margin.
- При себестоимости 55 RUB пакет Pro уже слишком дешев для strict `3x` guardrail, хотя по мягкой 60% margin-модели выглядит допустимым.
- Нужно либо повысить цену, либо увеличить credit cost режима, либо снизить provider cost.

## 8. Break-even

Fixed monthly cost:

```text
F_total =
  F_hosting
  + F_db
  + F_redis
  + F_storage
  + F_monitoring
  + F_accounting
  + F_support
  + F_misc
```

Break-even:

```text
break_even_packages = F_total / avg_package_contribution
```

Example:

```text
F_total = 60,000 RUB/month
avg_package = Pro
avg_package_contribution = 1,349 RUB
break_even_packages = 60,000 / 1,349 = 45 Pro packages/month
```

This break-even example is valid only if Pro is allowed by `audit-economics`. If Pro is hidden at launch, use Start contribution or the actually enabled package mix.

## 9. Refund economics

Rules:

- Автоматический возврат только для unused credits.
- Partial refund возможен только для unused portion и только если способ оплаты поддерживает частичный возврат.
- Если credits использованы, refund становится manual support flow.
- Комиссия YooKassa за успешный платеж при возврате не возвращается, поэтому refund создает `refund_loss`.
- Stars refund делается через `refundStarPayment` и требует сохраненного `telegram_payment_charge_id`.
- Stars refund должен уменьшать credit balance только через ledger, а не прямым изменением баланса.

Refund loss:

```text
refund_loss =
  non_returned_yookassa_fee
  + provider_cost_already_spent
  + support_cost
```

## 10. Revenue recognition

Product analytics:

```text
cash_collected = successful YooKassa payments
stars_collected = successful Telegram Stars payments in XTR
stars_net_rub_equivalent = conservative payout-floor RUB equivalent
net_cash_after_yookassa = cash_collected - yookassa_fees
deferred_credit_liability = unused paid credits
recognized_revenue = consumed paid credits
refunds = successful refunds
stars_refunds = successful Telegram Stars refunds
refund_loss = unrecovered fees + spent provider costs
```

Accounting note:

- Финальное признание выручки, НДС, чеки, коды предмета/способа расчета и срок действия credits должны быть подтверждены бухгалтером/юристом.

## 11. Weekly finance dashboard

Обязательные метрики:

- Gross payments.
- Stars payments.
- Net after YooKassa.
- Stars net RUB-equivalent floor.
- YooKassa fees.
- Successful payments count.
- Payment conversion.
- Refund amount and count.
- Credits sold.
- Credits consumed.
- Deferred credit liability.
- Recognized revenue.
- Provider cost by operation.
- Gross margin by mode.
- Gross margin by package.
- Failed paid jobs.
- Refund loss.
- Net/provider multiple by mode and package.
- Count of jobs below target multiple.

## 11.1. `audit-economics` command

Implementation repository must include:

```text
pnpm audit-economics
```

Checks:

- Reads active package catalog and finds the minimum public RUB/credit.
- Reads active Stars catalog and finds the minimum public RUB-equivalent/credit.
- Applies `ECON_PAYMENT_FEE_RESERVE`, not only the exact YooKassa fee.
- Applies `ECON_STARS_PAYOUT_RESERVE`, not optimistic Stars proceeds.
- Uses `ECON_USD_TO_RUB_BUFFER` for USD-denominated provider costs.
- Loads modeled prices for Apify, OpenRouter/LLM, FaceCheck, storage/PDF and support reserve.
- Verifies that runtime caps do not exceed modeled caps.
- Verifies that every public mode's configured `credit_units` covers p75/worst-case provider cost by `ECON_TARGET_REVENUE_MULTIPLE`.
- Fails if a newly enabled package makes the revenue floor too low.
- Fails if a required provider cost variable is missing.
- Prints a table with provider cost, charged credits, net revenue and multiple for every mode.

This command must run in CI before deploy and manually before any package or provider-price change.

## 12. Decision gates

Before public paid launch:

1. Telegram Stars test payment and `successful_payment` flow verified.
2. Telegram Stars payout/reward floor confirmed or conservative fallback approved.
3. Telegram Stars refund flow verified with `refundStarPayment`.
4. YooKassa contract rates confirmed.
5. Fiscal receipt setup confirmed.
6. User email collection flow approved for YooKassa.
7. Provider costs measured on at least 50 real standard reports.
8. `C_standard p75` is below launch pricing cost ceiling for every public package and channel.
9. `audit-economics` passes with production package catalog.
10. Pro/Agency/Scale are hidden or repriced if they fail strict guardrail.
11. Duplicate Stars `successful_payment` and YooKassa webhook tested.
12. Refund flow tested.
13. Finance export tested.
14. Support policy for failed analyses and refunds written.
15. Terms/payment policy text approved.

## 13. Sources

Telegram Stars official materials used for this model:

- Telegram Bot Payments API for Digital Goods and Services: `https://core.telegram.org/bots/payments-stars`
- Telegram Bot API Payments section: `https://core.telegram.org/bots/api#payments`
- Telegram Bot API `refundStarPayment`, `getMyStarBalance`, `getStarTransactions`: `https://core.telegram.org/bots/api#refundstarpayment`

YooKassa official materials used for this model:

- Telegram payments page: `https://yookassa.ru/telegram/`
- YooKassa fees page: `https://yookassa.ru/fees`
- API payment process: `https://yookassa.ru/developers/payment-acceptance/getting-started/payment-process`
- Smart payment / redirect scenario: `https://yookassa.ru/developers/payment-acceptance/integration-scenarios/smart-payment`
- Incoming webhooks: `https://yookassa.ru/developers/using-api/webhooks`
- Refunds: `https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds`
- YooKassa receipts / 54-FZ: `https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/basics`

Checked on 2026-06-03:

- Telegram Stars docs state that digital goods/services in bots and mini apps use `XTR`; the flow is `sendInvoice` -> `pre_checkout_query` -> `successful_payment`; `provider_token` is empty for Stars; refunds use `refundStarPayment`.
- Public YooKassa fees page shows `2.8% + 1% per receipt` for several payment methods under the "Чеки от YooKassa" condition, plus VAT on commission; the page also describes offer/date and contract conditions, so production values must come from the signed merchant contract.
- YooKassa API payment process documents merchant auth, `Idempotence-Key`, `amount`, `capture`, redirect confirmation and `confirmation_url`.
- YooKassa webhook docs list `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture` and `refund.succeeded`; the bot must still reconcile status server-to-server before crediting.
