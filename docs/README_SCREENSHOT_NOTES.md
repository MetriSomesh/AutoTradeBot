# README Screenshot Notes

The repository README uses only credential-free authentication captures. The sign-in and first-account screens contain no user identity, Delta credentials, positions, P&L, or order data.

Existing authenticated Manual Adoption captures were reviewed and excluded because one displays an owner name in the sidebar. Existing unauthenticated page captures render only the session gate and do not demonstrate the requested page content. Additional public README screenshots must therefore be captured from a clean local account with empty-state screens and no personal data, or be created from an approved redacted source.

The existing Operational Status capture contains only empty-state operational information, but it also shows the owner name in the sidebar. It is approved for a narrow privacy-preserving edit that replaces only that owner identity with a generic local label. A prior Risk Settings capture contains only the session gate and is not a useful gallery image.

Final README asset verification: `manual-adoption.png` and `risk-settings.png` preserve the original empty-state/configuration interface and replace the personal sidebar identity with `Local Owner` / `LO`. Neither image contains an API key, API secret, account identifier, order, balance, or P&L record.

`operational-status.png` was also visually verified. It preserves the empty Operational Status interface, replaces the personal sidebar identity with `Local Owner` / `LO`, and contains no credential, order, balance, or P&L information.

The final asset approval record is maintained in [README_SCREENSHOT_REVIEW.md](README_SCREENSHOT_REVIEW.md).

Authenticated dashboards are intentionally not captured from the credential-free preview. When adding a local Live Monitor or Scheduled Entry Audit capture later, redact usernames, account identifiers, public IP addresses, API keys, order IDs, symbols if sensitive, balances, and any trade or P&L data before committing it.
