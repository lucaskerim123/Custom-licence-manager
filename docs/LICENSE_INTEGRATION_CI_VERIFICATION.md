# License Integration Verification

This file records the cross-system contract exercised by CI.

- License Master is the independent authority for issuance, validation, activation, installation state, rotation, suspension and termination.
- External integrations use the canonical /api/v1 namespace.
- Public customer validation is exposed through /api/v1/license/validate without a customer-specific integration token.
- The internal /license page remains a License Manager UI and does not depend on its public API unnecessarily.
