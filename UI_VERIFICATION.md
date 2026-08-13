# UI Verification Record

The monitoring interface was visually checked at desktop (`1280×720`) and mobile (`390×844`) viewports. The dark matte-charcoal control-room theme, copper primary actions, green healthy-state treatment, and red emergency-state treatment render consistently across the live monitor, manual adoption, trade history, risk settings, and operational-status routes.

| Verification area | Result |
| --- | --- |
| Desktop workspace navigation | The persistent sidebar, page titles, control cards, empty states, and settings form render without clipping. |
| Mobile navigation | The sidebar collapses to a compact header trigger; content is single-column and controls remain visible. |
| No-pair state | The dashboard clearly explains that the worker is idle until the owner explicitly adopts one matching CE/PE pair. |
| Risk controls | The Manual Hold boundary and live reduce-only arming copy remain readable at mobile width. |
| Data disclosure | Pages render actual empty/loading states rather than fabricated trade history, marks, P&L, reviews, or account data. |

The authenticated active-pair view, native exchange discovery, and close queue require a self-hosted runtime configured with a local account and that account’s encrypted Delta credential; they cannot be visually exercised in the credential-free preview environment.

## Local-account enhancement verification

Desktop captures confirmed that `/signin` and `/signup` render as dedicated dark TMT authentication screens with readable input labels, clear first-administrator wording, and visible sign-in/sign-up navigation. Captures of `/account` and `/risk` while unauthenticated correctly displayed the local-session gate rather than rendering account-key or execution controls before sign-in. The authenticated Account & Keys, partial-close controls, and Manual/Auto target controls are protected behind this gate and are covered by the typed API and regression suite.

Mobile captures at `390×844` confirmed that the same sign-in and sign-up forms remain single-column, have no clipped controls, keep all password fields reachable, and retain clear navigation between account creation and sign-in.
