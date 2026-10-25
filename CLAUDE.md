# piu-rivals

## Database and architecture decisions

- ALWAYS ask for confirmation before adding a database migration or changing the schema. First explain why the change is needed, and why the data already there isn't enough. Then wait for a yes.

- Review every architectural decision (database, backend, API, where data is kept or worked out) before building it: its pros, its cons, and its limitations, including edge cases (e.g. other devices, cleared caches, rescans, first loads, ordering, data already stored). Compare it with the alternatives worth considering.

- List each limitation on its own and ask whether it's acceptable for this case. Don't build until each one is confirmed as acceptable, or the design is changed to avoid it.

## Site's score cache

- When a change needs browsers to reload cached scores (e.g. a new field from the API, a changed stored shape), raise `DB_VERSION` in `web/src/pages/rivals/bests_cache.ts`. Never lower it, not even when reverting a change: browsers that loaded the higher version would then run without a cache, or keep rows of the wrong shape once the version goes back up. Raising it a few times during one task is fine.

- When the API and the site change together in local development, the API must be restarted before the site reloads, or the cache fills with the old API's rows. If that happened, raise `DB_VERSION` again once the API is restarted. Never ask the user to clear the cache by hand. (Production deploys the server before the site.)

## Commits

- Work in the branch you're on, no PRs, unless told otherwise. 

- Never commit on your own, not even after a finished, tested change. Commit only when told to, and push only when told to; "commit" is not permission to push. Pushing `main` triggers the automatic deploy.

- Stage only the files you changed or created for the change (e.g. a new database migration). Leave other untracked files alone and don't keep mentioning them.

- Keep commit messages short: one line about the overall change, e.g. improved UX on phones, shows some new info, adds a feature. Don't list each parameter, value or pixel change, and don't copy the long, detailed style of older commits.

- Don't prefix messages with `Rivals: `, since the whole project is about rivals. Name the part only when it's a separate one, such as one of the Chrome extensions.

- Always name database changes in the message, such as tables or fields added, changed or removed.
