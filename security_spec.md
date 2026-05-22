# Security Specification - Shopee Affiliate Planner

## Data Invariants
1. Every Account, Product, ScheduleItem, Violation, and Sale must be owned by a registered user.
2. Users can only read and write their own data.
3. Account `status` and `stage` must be from the allowed enum values.
4. Violation records must be linked to a valid account ID belonging to the user.
5. Sales records must be linked to a valid account ID and product ID belonging to the user.
6. `createdAt` fields are immutable after creation.
7. `updatedAt` must be updated with `request.time`.
8. GMV, Commission, and Quantity values in Sales must be non-negative numbers.

## The "Dirty Dozen" Payloads (Deny Expected)

1. **Identity Spoofing**: Attempt to create an account with `userId` of another user.
2. **Identity Spoofing (Update)**: Attempt to change the `userId` field of an existing account.
3. **Resource Poisoning**: Create an account with a 2MB `notes` string.
4. **Enum Bypass**: Set account status to `banned_hero` (not in enum).
5. **ID Injection**: Create a document where ID contains script tags like `accountId="<script>alert(1)</script>"`.
6. **Orphaned Violation**: Create a violation with an `accountId` that doesn't exist in the user's accounts.
7. **Cross-User Read**: User B tries to `get` User A's account details.
8. **Shadow Field**: Create an account with an extra field `isAdmin: true`.
9. **Timestamp Cheat**: Post a `createdAt` value from 1999.
10. **Partial Update Gap**: Attempt to update `userId` while only supposed to update `status`.
11. **Negative Frequency**: Set `productionFrequency` to -5.
12. **Unauthorized List**: Anonymous user trying to list all accounts.

## Test Runner (Logic Outline)
The tests will use the Firebase Rules Emulator to verify `PERMISSION_DENIED` for all these cases.
