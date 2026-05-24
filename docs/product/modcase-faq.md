# ModCase FAQ

## What is ModCase?

ModCase is a moderation precedent assistant. It helps moderators answer: "How has this team handled similar cases under this reason before?"

## What does it store?

It stores normalized decision records: subreddit, target type, hashed target id, approve/remove action, controlled reason label, timestamp, source, and an optional short snippet.

## What does it avoid storing?

It does not store raw moderator names or raw author names. Moderator identity is only used transiently to filter bots and app actors.

## Why use a reason picker?

A controlled reason picker keeps precedent lookup coherent. Free-text removal notes would create too many one-off buckets and can include sensitive context.

## What does "settled" mean?

The starter marks a reason as settled when at least five matching decisions exist and at least 80 percent of recent matching decisions point to the same action.
