# Synthetic weekly digest — issues

This is a format fixture for a hypothetical project, not a request to modify the
harness. Requirements: R-1 saves a digest preference and delivers a scheduled
message; R-2 allows one retry on failure; R-3 schedules in the user's timezone.

## Dependency graph

ISS-DIGEST-ROUNDTRIP precedes ISS-DIGEST-RETRY and ISS-DIGEST-TIMEZONE.

## Tracer bullet: enable and receive a weekly digest

**ID:** ISS-DIGEST-ROUNDTRIP
**Depends on:** none
**Requirements:** R-1
**JTBD:** TBD — synthetic fixture

### Description
Connect settings, saved preference and scheduled delivery in one vertical slice.
Use UTC for the initial scheduling path; the timezone slice extends it.

### Acceptance criteria
- [ ] Given a disabled weekly digest, when the user enables it and reopens settings, then the saved preference remains enabled.
- [ ] Given an enabled digest, when Monday 09:00 UTC arrives, then one digest message is queued for that user.

### Technical notes
**Files touched:** src/settings.mjs, src/digest.mjs, test/digest.test.mjs
Use the existing preference store and queue. Verify through the settings and scheduler entry points.

## Retry a failed digest once

**ID:** ISS-DIGEST-RETRY
**Depends on:** ISS-DIGEST-ROUNDTRIP
**Requirements:** R-2
**JTBD:** TBD — synthetic fixture

### Description
Add the specified failure path to the existing delivery outcome.

### Acceptance criteria
- [ ] Given the initial digest delivery fails, when failure handling runs, then exactly one retry is queued.
- [ ] Given the retry also fails, when failure handling runs, then the error is recorded and no further retry is queued.

### Technical notes
**Files touched:** src/digest.mjs, test/digest.test.mjs
Keep retry state tied to the scheduled message identity.

## Schedule the digest in the user's timezone

**ID:** ISS-DIGEST-TIMEZONE
**Depends on:** ISS-DIGEST-ROUNDTRIP
**Requirements:** R-3
**JTBD:** TBD — synthetic fixture

### Description
Extend the saved-preference flow to schedule the existing delivery path in the
user's chosen timezone. Timezone data comes from existing account settings.

### Acceptance criteria
- [ ] Given a user with a configured timezone, when Monday 09:00 occurs in that timezone, then one digest message is queued for that user.
- [ ] Given the user's timezone changes before the next scheduled digest, when the next schedule is calculated, then it uses Monday 09:00 in the new timezone.

### Technical notes
**Files touched:** src/digest.mjs, test/digest-timezone.test.mjs
Use the project's existing timezone handling. Verify both scheduling boundaries with a controlled clock.
