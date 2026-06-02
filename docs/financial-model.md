# Финансовая модель ZRETI Telegram Bot

Версия: 0.1.

Дата: 2026-06-03.

Цель документа: зафиксировать стартовую модель монетизации, pricing, unit economics, YooKassa fees, credit ledger и метрики прибыльности для Telegram-бота.

## 1. Ключевая модель

MVP продает предоплаченные пакеты кредитов через YooKassa.

Пользовательский поток:

1. Пользователь выбирает пакет кредитов в `/credits`.
2. Бот создает заказ и платеж YooKassa.
3. Пользователь оплачивает по ссылке YooKassa.
4. YooKassa отправляет webhook.
5. Backend сверяет статус платежа server-to-server.
6. Backend начисляет credits.
7. Credits списываются за анализы и дополнительные AI-вопросы.

В MVP нет:

- постоплаты;
- рекуррентных подписок;
- автоплатежей;
- кредитования пользователя;
- списания реальных денег за каждый анализ.

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

Рекомендуемые пакеты v0.1:

| Package | Credits | Price RUB | RUB / credit | Notes |
| --- | ---: | ---: | ---: | --- |
| Trial | 1 | 0 | 0 | Только admin grant |
| Start | 3 | 690 | 230 | Первый платеж |
| Pro | 10 | 1,990 | 199 | Базовый пакет |
| Agency | 30 | 5,490 | 183 | Малые команды |
| Scale | 100 | 15,900 | 159 | Агентства, только если себестоимость стабильна |

Pricing rules:

- Все цены в RUB.
- Пакеты должны быть конфигурацией, не hard-code.
- Scale нельзя включать публично, пока фактическая себестоимость standard report не подтверждена.
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

If `C_standard = 80 RUB`:

```text
P_credit_min = 80 / (1 - 0.0456 - 0.60) = 225.73 RUB
```

Interpretation:

- При себестоимости 80 RUB пакет Pro уже слишком дешев для 60% target margin.
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

## 9. Refund economics

Rules:

- Автоматический возврат только для unused credits.
- Partial refund возможен только для unused portion и только если способ оплаты поддерживает частичный возврат.
- Если credits использованы, refund становится manual support flow.
- Комиссия YooKassa за успешный платеж при возврате не возвращается, поэтому refund создает `refund_loss`.

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
net_cash_after_yookassa = cash_collected - yookassa_fees
deferred_credit_liability = unused paid credits
recognized_revenue = consumed paid credits
refunds = successful refunds
refund_loss = unrecovered fees + spent provider costs
```

Accounting note:

- Финальное признание выручки, НДС, чеки, коды предмета/способа расчета и срок действия credits должны быть подтверждены бухгалтером/юристом.

## 11. Weekly finance dashboard

Обязательные метрики:

- Gross payments.
- Net after YooKassa.
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

## 12. Decision gates

Before public paid launch:

1. YooKassa contract rates confirmed.
2. Fiscal receipt setup confirmed.
3. User email collection flow approved.
4. Provider costs measured on at least 50 real standard reports.
5. `C_standard p75` is below launch pricing cost ceiling.
6. Duplicate payment webhook tested.
7. Refund flow tested.
8. Finance export tested.
9. Support policy for failed analyses and refunds written.
10. Terms/payment policy text approved.

## 13. Sources

YooKassa official materials used for this model:

- Telegram payments page: `https://yookassa.ru/telegram/`
- YooKassa fees page: `https://yookassa.ru/fees`
- API payment process: `https://yookassa.ru/developers/payment-acceptance/getting-started/payment-process`
- Smart payment / redirect scenario: `https://yookassa.ru/developers/payment-acceptance/integration-scenarios/smart-payment`
- Incoming webhooks: `https://yookassa.ru/developers/using-api/webhooks`
- Refunds: `https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds`
- YooKassa receipts / 54-FZ: `https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/basics`
