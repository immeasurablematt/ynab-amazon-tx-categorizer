# Plaid-to-YNAB bridge

This local bridge is the bank-acquisition layer for an ad hoc YNAB Sitdown.
It is intended for Canadian YNAB connections that repeatedly fail or require
MX reauthorization.

It does not scrape bank websites or store bank credentials. Bank authorization
happens inside Plaid Link. The bridge retrieves posted transaction data from
Plaid, prepares an exact proposal, and imports only that proposal through the
official YNAB API after explicit approval.

## Prefer the simplest healthy route

Before using the bridge, check whether the affected YNAB connection can use
Plaid instead of MX. YNAB currently uses both providers, sometimes with a
different provider per connection:

- <https://support.ynab.com/en_us/how-direct-import-works-H1IGYLgnxl>
- <https://support.ynab.com/en_us/which-direct-import-provider-SkcusCQeWe>

If native Plaid works, keep the native connection. This bridge is for feeds
that remain unreliable or unsupported.

Plaid's Canadian Trial plan can connect real institutions and includes
Transactions. Current official details and limits:

- <https://support.plaid.com/hc/en-us/articles/39994173227159-What-is-the-Plaid-Trial-plan>
- <https://plaid.com/docs/institutions/>

Institution support changes. Confirm CIBC, American Express Canada, MBNA
Canada, and any future institution in Plaid's live Dashboard before relying on
the bridge. CIBC currently advertises Transactions coverage:
<https://plaid.com/institutions/cibc/>.

## Safety model

- `plan` is read-only for YNAB and does not advance the Plaid cursor.
- Pending transactions are held until Plaid reports a posted transaction.
- Plaid spending is sign-reversed and converted with decimal arithmetic to
  YNAB milliunits.
- A stable `PLAID:` import ID prevents repeat imports and lets YNAB match an
  existing manual entry.
- Every provider account must map to one exact YNAB budget/account pair.
- Every mapping has an evidence-backed cutover date: the first bank-posted
  date not already covered by MX, another provider, or a prior file import.
  Older Plaid history is held and never imported.
- Modified and removed provider rows are reported as held exceptions; the tool
  never rewrites or deletes a reviewed YNAB transaction automatically.
- Plaid-identified transfers, credit-card payments, and loan payments are held
  out of ordinary transaction creation. They must be represented and verified
  separately as the intended YNAB transfer/payment before the cursor can move
  past them.
- `apply` requires the exact SHA-256 of the proposal file, creates rows
  unapproved, reads them back from YNAB, and advances cursors only after the
  readback verifies.
- An API timeout or error is treated as an unknown outcome. Do not retry until
  the exact import IDs have been read back from YNAB.

Private configuration, cursors, and proposals default to:
`~/Library/Application Support/YNAB Sitdown/`. Files are created mode `0600`.
API secrets and Plaid Item access tokens live in the macOS Keychain.

## Setup

1. Create a Plaid Trial account yourself. Do not give an agent a bank password.
2. In the Plaid Dashboard, obtain the Trial/Production client ID and secret.
3. Store Plaid and YNAB API credentials without printing them:

   ```bash
   python3 plaid_ynab_bridge.py --environment production configure-secrets
   ```

4. Link each institution one at a time:

   ```bash
   python3 plaid_ynab_bridge.py --environment production link
   ```

   Open the printed `127.0.0.1` URL. The browser sends bank credentials to
   Plaid, not to the local bridge. Canadian institutions currently do not use
   Plaid OAuth, but this should be rechecked if a future institution changes
   its authentication model.

5. Resolve live YNAB budget/account IDs and map every linked Plaid account:

   ```bash
   python3 plaid_ynab_bridge.py --environment production map-account \
     --plaid-account PLAID_ACCOUNT_ID \
     --ynab-budget YNAB_BUDGET_ID \
     --ynab-account YNAB_ACCOUNT_ID \
     --label "Descriptive account label" \
     --start-date 2026-08-20
   ```

   Account IDs are local identifiers, not bank passwords. Do not infer a
   mapping from a mask alone. Derive `--start-date` from the last verified
   posted row already present in YNAB and the bank's own activity; do not guess
   or choose it merely to silence historical duplicates.

## Monthly or ad hoc run

Create a proposal:

```bash
python3 plaid_ynab_bridge.py --environment production plan
```

Review its account, date, amount, payee, import ID, and held rows. The command
prints a proposal path and approval hash but changes nothing in YNAB.

After Matthew explicitly approves that exact proposal, apply it with the hash:

```bash
python3 plaid_ynab_bridge.py --environment production apply \
  "/private/path/to/plaid-ynab-proposal.json" \
  --approve EXACT_SHA256
```

The resulting rows remain unapproved for the normal transaction-review stage.
If the proposal contains transfer/payment holds, first create or verify their
correct linked treatment in YNAB. Then rerun the same exact command with
`--acknowledge-transfers`; this explicitly skips those provider rows while
advancing the cursor. Do not use that switch merely to silence a hold.

If Plaid reports that consent needs attention, run Link in update mode for the
known item:

```bash
python3 plaid_ynab_bridge.py --environment production link --update-item PLAID_ITEM_ID
```

The tool can automate routine refreshes after initial authorization, but it
will not bypass a bank's renewed-consent or MFA requirement.

## File fallback

If an institution is not covered or remains unreliable, download an original
QFX/OFX file or bank CSV and use the existing signed-file workflow. Preserve
refunds, credits, payments, and transfers with their actual signs. YNAB also
supports direct file import:
<https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo>.

Do not feed raw QFX into a normalizer that converts every positive amount to an
outflow. The MBNA-specific signed workflow remains documented in
`docs/MBNA_QFX_IMPORT_WORKFLOW.md`.
