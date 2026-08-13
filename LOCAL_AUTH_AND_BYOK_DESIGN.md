# Local Accounts and Bring-Your-Own-Key Design

The self-hosted application will move from project-managed OAuth to a standalone local-account model. A user registers a username, display name, email, and password through the browser; the server stores only a salted password hash. The first account becomes the initial administrator. Later accounts receive isolated workspaces by default, while their Delta credentials, adopted pairs, snapshots, close queues, and exports remain scoped to their account ID.

| Concern | Design decision |
| --- | --- |
| Passwords | Use Node.js `scrypt` with a unique random salt. Passwords are never logged, returned by an API, or stored in plaintext. |
| Sessions | Use a random opaque session token in an HTTP-only, Secure, SameSite cookie. Store only an HMAC digest of that token, with an expiry and revocation timestamp, in MySQL. |
| First administrator | A database transaction-like bootstrap check promotes only the first local account to `admin`; later registrations start as `user`. |
| Registration | `TMT_AUTH_ALLOW_REGISTRATION` controls whether new registrations are accepted after initial setup. The default will be enabled for the self-hosted first-run flow. |
| Password recovery | Store a hash of short-lived single-use reset tokens. Email delivery is optional and must be configured by the self-host operator; no reset token is kept in plaintext. |
| Delta key encryption | Encrypt each user’s API key and API secret independently with AES-256-GCM before database storage. Derive a data-encryption key from the dedicated server-only `TMT_CREDENTIAL_ENCRYPTION_KEY`; store nonce, ciphertext, and authentication tag, never the plaintext. |
| Credential use | Decrypt credentials only inside the server process immediately before signing a Delta request. Browser responses expose only connection status, key fingerprint, base URL, and update time. |
| Worker isolation | The worker iterates active pairs and loads the matching owner’s encrypted credential record. A partial close or automatic target can affect only the recorded CE/PE product IDs belonging to that same account. |
| Partial closes | Store a requested percentage and calculated leg quantities in the durable close queue. The worker verifies current exchange short sizes, uses reduce-only orders, and records an audit event. |
| Exit modes | `manual` disables target-based automatic exits but preserves stop loss, maximum loss, native/external bracket reconciliation, and emergency handling. `auto` allows a configured net-INR profit target to close the remaining pair. |

> **Safety boundary:** A profit target is an account-specific bot-side exit condition, not a guarantee of a fill or profit. The worker must receive current valid marks and pass the exchange’s reduce-only order checks before it can act. Failure leaves an auditable degraded or emergency state rather than creating a synthetic successful close.

The local authentication implementation will replace the runtime dependency on the Manus OAuth callback for self-hosted deployments. Existing database rows are preserved through additive columns and tables; existing live functionality remains inaccessible until a user has completed local registration, stored a valid encrypted key, and explicitly armed the applicable mode.
