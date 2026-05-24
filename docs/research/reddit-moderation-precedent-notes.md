# Reddit Moderation Precedent Notes

ModCase focuses on precedent for moderator teams, not automated enforcement. The early product promise is narrow: show recent team patterns for a selected reason and content type without turning the app into a rule engine.

## Design Constraints

- Human moderator decisions are the signal.
- Automoderator and bot actions are excluded.
- The app should explain uncertainty instead of overclaiming.
- Counts come from recent matching decisions, not global subreddit totals.
- The moderator chooses the reason because raw content classification is outside the first slice.

## Summary Labels

- `limited_history`: fewer than five matching decisions.
- `settled`: at least 80 percent majority action.
- `leaning`: at least 60 percent majority action.
- `contested`: no clear majority.
