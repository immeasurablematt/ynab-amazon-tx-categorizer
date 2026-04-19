# MBNA QFX import workflow

Use this when importing an MBNA QFX statement into YNAB account `[MBNA] Amazon.ca Rewards`.

## Account context

- Budget: `Budget-ta 2.0`
- Budget id: `9eb66ede-1691-46cf-a2f0-794bec4d18f1`
- MBNA account id: `0eea3981-cf83-4210-a23f-91dc8182bcda`

## Important rule

Do not feed raw QFX rows into `ynab_import.py`.

Why:
- `ynab_import.py` converts every positive amount into a negative outflow.
- That breaks refunds and statement credits.
- QFX imports need signed amounts preserved exactly as they appear in the statement.

## Repeatable checklist

1. Parse the QFX file and extract:
   - posted date
   - signed amount
   - merchant name
   - FITID

2. Skip the `PAYMENT` line from the QFX.
   - In YNAB this should usually remain a transfer or card payment flow, not a manual inflow import.

3. Pull all YNAB transactions for `Budget-ta 2.0`.

4. Filter existing rows to account `[MBNA] Amazon.ca Rewards`.

5. Treat a QFX row as an exact duplicate if:
   - same account
   - same posted date
   - same signed amount

6. For Amazon marketplace rows, use Gmail label `Amazon Orders` and search by exact amount whenever possible.
   - Prefer date plus amount
   - Read only the needed messages
   - Use the receipt item to choose the category

7. For recurring non-receipt Amazon service charges, use these defaults:
   - `PrimeVideo...` -> `Subscriptions (Monthly)`
   - `Amazon Channels` -> `Subscriptions (Monthly)`
   - `Ad free for PrimeVideo` -> `Subscriptions (Monthly)`

8. Import only the missing rows.
   - Preserve signed amounts exactly
   - Set `cleared` to `cleared`
   - Set `approved` to `false`
   - Use a stable import id from FITID, for example `MBNAQFX:<fitid>`

9. After importing, review any duplicate rows that already existed in YNAB.
   - If receipt evidence shows the old category was wrong, patch category only
   - Do not change memo, payee, flag, or approval unless explicitly requested

10. Verify every non-payment QFX row now exists in the MBNA account.

## Category patterns used in the April 2026 import

- Kids books, diapers, soccer items -> `Kids Supplies`
- Wrangler and Maidenform apparel, plus Amazon clothing refunds -> `Wardrobe`
- Weiser handles, 3M hooks, steel wool scrubbers -> `Home Maintenance & Decor`
- Prime Video and Amazon Channels charges -> `Subscriptions (Monthly)`
- Protein bars and saffron -> `Groceries `
- Party decorations -> `Gifts & Giving`
- Ambiguous electronics like Anker power banks -> `Stuff I Forgot to Budget For`

## April 2026 result reference

For `/Users/mbaggetta/Downloads/Apr2026_1315.qfx`:
- `29` total QFX rows
- `1` skipped `PAYMENT` row
- `28` non-payment rows considered
- `6` exact duplicates already existed in YNAB
- `22` new rows imported
- `3` already-existing duplicate rows had their categories corrected

