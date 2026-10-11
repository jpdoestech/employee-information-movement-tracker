# Philippine addresses and emergency contacts

The default **Address** field group contains Home Address, Current Address and emergency contact name, number and relationship. These are ordinary permission-controlled field definitions: C/R/U/D, applicability, restricted-field rules and server-authorized projections still apply. New fields remain default-denied until the administrator grants Address group inheritance or explicit field access.

Home Address retains `address`, `province`, `city_municipality`, `barangay`, `postal_code`. Current Address uses the same keys with `current_` prefixes. Region is derived; reference codes are used only for selection and hierarchy resolution. Postal code is entered manually; the copied city ZIP values are never used.

The supplied `src/address` JSON references are used locally. Region, province and city lists are searchable without selecting parents. Barangay searching loads the combined index on demand through Vite's emitted asset URL, shares concurrent loads, caches successful loads and permits retry after failure. Queries debounce for 150 ms, ignore stale results, rank prefix matches before substring matches and return at most 20 suggestions with city/province context. Slow loading uses the shared floating progress notification.

Confirmed selections fill their correct parents. Region changes clear province/city/barangay; province changes clear city/barangay; city changes clear barangay. Street and postal values are preserved. Typed unconfirmed location text is kept as a local draft and blocks saving. Escape closes suggestions and Enter selects a unique result. Controls and suggestions use the shared semantic tokens, keyboard focus, modal top layer and viewport bounds.

Each address column has independent access checks. Read-only values remain visible when authorized. Read-only controls are disabled; nationwide suggestions that require unauthorized parent writes or dependent clears are marked unavailable. Editing a child whose parent stays unchanged remains permitted. The form never sends hidden values or unauthorized side-effect writes. Unchanged hidden values are validated in PostgreSQL rather than fetched into the browser. Required rules remain separate from official-list hierarchy validation.

## Migration and existing records

`20261011000200_default_addresses.sql` snapshots the supplied 82 provinces, 1,642 cities and 42,011 barangays into private indexed tables. A database trigger validates the merged address on every address change, including bulk updates and destination-data writes, inside the existing locked/versioned transaction. Invalid combinations roll back values, revisions, audit records and synchronization outbox writes. Existing legacy addresses are retained; unrelated edits do not require rewriting them. Editing an address requires its hierarchy to be valid.

The migration reuses existing field keys/IDs and recognizes `emergency_name`, `emergency_phone`, and `emergency_relationship` aliases. Existing immutable types, required rules, applicability, sensitivity and explicit field policies are retained. Existing group permission sources are recorded privately for relocated fields; they remain subject to direct-field precedence, restricted-field exceptions and active source groups. They apply only while the field remains in the Address destination group. New Address fields receive no legacy permissions. Fields from inactive groups remain inactive after relocation. Existing select relationship choices are retained alongside the default relationship list.

Apply this migration through the project's normal Supabase migration workflow before using connected mode. No hosted migration is applied by the UI or by local demo startup. `scripts/generate-address-migration.mjs` deterministically generates this migration from the copied references and `defaultFields.json`; applied migrations must remain immutable. Future reference changes require a new versioned migration and matching local references.

## Verification

Tests are under `.test-db`. Unit checks cover nationwide Agdao search, ranking/limit, normalization, hierarchy rejection, cities without a province, lazy/concurrent loading, retry, column permissions and read-only rendering. PostgreSQL checks cover existing-field relocation and policy precedence, default deny, private reference protection, address mutation denial, normalization, bulk rollback and concurrent version conflicts. Browser checks cover duplicate-name context, parent resolution and clearing, unconfirmed text, retry/no-results, both address sections saved through confirmation, existing-record editing and bounded suggestions at phone, tablet, laptop and short landscape sizes.

The local database harness uses native PostgreSQL 18 with simulated Supabase identity claims. Hosted Supabase Auth/REST and live Google Sheets synchronization are separate release checks.
