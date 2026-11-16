# docs/specs/matching.md: Matching (v1)

## 3. Matching rules (v1)

Eligible candidates are all users who are:
- live right now, within the **smaller** of the two users' radii, and with overlapping time windows,
- same institution scope (v1: everyone is Concordia, but filter on `institution_id` anyway),
- not blocked in either direction, and not already in an active match.

Hard filters: dietary needs must be compatible (e.g. a vegetarian is never matched into a plan that cannot work; v1 rule: if either user has a dietary restriction, the pair must share at least one cuisine).

Score (0 to 1) = weighted sum:
- cuisine overlap (Jaccard similarity): 0.6
- budget range overlap: 0.25
- "happy to share dishes" agreement: 0.15

Pick the highest score above a minimum threshold; break ties by distance. Pure function, unit-tested heavily. No machine learning.

Match group size is **2 (pairs)** in v1. Keep it a named constant so groups of 3-4 can come later.

## 4. Match state machine

```
PROPOSED ──(both accept chat / first message)──> CHATTING ──(both confirm)──> CONFIRMED
    │                                                │
    └──(decline / timeout)──> DECLINED / EXPIRED <───┘
```

- A user can decline a proposal; they stay live and get the next-best candidate (never the same one again this session).
- Proposed and chatting matches expire after 10 minutes without both confirming.
