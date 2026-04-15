---
status: investigating
trigger: friends accessing their links with their tokens see wrong page - should get friend-specific dashboard but getting balance-not-found with full dashboard access
created: "2026-04-14"
updated: "2026-04-14"
---

## Symptoms

1. **Expected behavior**: Friends accessing shared links with their tokens should see a friend-specific dashboard showing only their assigned expenses/balances from the link creator's shared data
2. **Actual behavior**: Friends are redirected to a "balance not found" page with access to full dashboard, accounts, and everything
3. **Error messages**: None specified yet
4. **Timeline**: Issue exists currently - needs fix
5. **Reproduction**: Share a link as a user, then access that link as the friend recipient using their token

## Current Focus

hypothesis: The token-based auth for friend links is not properly scoped - when a friend token is validated, the system treats them as the main user rather than as a friend with limited view
next_action: gather initial evidence