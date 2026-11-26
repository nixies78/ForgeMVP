# Working in this repo

- **Keep everything uploaded to GitHub.** After every finished, checked change, commit it and push to
  `origin/main` (https://github.com/nixies78/ForgeMVP) without waiting to be asked. Never leave work
  only on disk. The repository is public: anything committed is published.
- Run `npm test` before pushing; it must pass.
- This copy runs locally at http://forgeflavio.localhost:8650/ with live reload (settings in the
  git-ignored `.local/settings.ini`; see the README). Pages refresh themselves when files change.
- Home page mockups live in `public/concepts/<n>-<name>/` and are listed on `public/mockups/index.html`;
  the shared design brief is `support/home-concepts-brief.md`. The other page-type sets (questions,
  lessons, randomiser, and the AI chat wireframes) are in the same folder and behind the same index;
  each set's brief is in `support/` and the living record of directions taken is
  `support/mockup-directions.md`.
