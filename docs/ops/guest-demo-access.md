# Guest reviewer access to the hosted demo

By default the hosted demo needs a named, allowlisted account (`PRONTO_DEMO_ALLOWED_USER_IDS`). For reviewers who should only need the URL, enable **guest reviewer access**. It is off unless you set it.

```text
PRONTO_DEMO_GUEST_ACCESS=1       # enables /enter and guest sessions (protected-demo or customer-demo deployments only)
PRONTO_DEMO_GUEST_SIMULATOR=1    # optional: also let guests chat with the customer simulator (spends LLM credit)
```

## What a visitor sees
Opening the URL sends them to **/enter**, where they type a name and continue. Nothing else is asked. They get a 7-day session as a new demo-tenant user (`guest-<uuid>@guest.invalid`, no password, no staff capability grants). Their comments are attributed to the name they typed, and other reviewers' comments appear for them like any other. The "Sign in instead" link remains for team accounts.

## What a guest can and cannot do
- **Can:** read every page of the synthetic PS Cafe demo and leave, reply to, resolve and export feedback.
- **Cannot:** any other write. The request proxy refuses every non-GET request from a guest session except feedback, sign-in and sign-out (and, only with `PRONTO_DEMO_GUEST_SIMULATOR=1`, the two simulator endpoints), returning 403 before any route runs. New API routes are therefore read-only for guests by default.
- Guests hold none of the staff capabilities (approve knowledge, activate channels, respond to or release conversations, manage permissions or escalation policy), so they cannot open real conversations either.
- Operator routes remain operator-only.

## Abuse limits
- Creating a guest is limited to 8 per visitor and 60 in total per 15 minutes (production, or when `PRONTO_LOGIN_THROTTLE=1`), using keyed hashes rather than raw IPs.
- At most 500 guest users exist in the demo tenant; further visits are refused until old guests are deleted.
- Guest sessions cannot sign in with a password. Delete them with `delete from users where email like '%@guest.invalid'` (their feedback stays, with the author link cleared).

## Know before you enable it
- Anyone who has the URL can enter and read the demo data and add feedback. Keep the data synthetic. Feedback comments are visible to every reviewer and exports include author names.
- Without `PRONTO_DEMO_GUEST_SIMULATOR`, the customer simulator page is viewable but sending messages returns an error. Enabling it lets any visitor trigger LLM calls; per-call limits exist but there is no dollar ceiling, so set a provider-side spend limit first.
- The login form's attempt limiter does not cover this flow; the limits above do.
- To turn it off, unset `PRONTO_DEMO_GUEST_ACCESS`: `/enter` returns 404 and existing guest sessions no longer pass the demo check.
