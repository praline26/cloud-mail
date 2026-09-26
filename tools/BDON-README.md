# BDon sequential registration

This local script submits two registrations in sequence, reads the corresponding new verification emails through the existing Cloud Mail API, opens each verification link, and logs out after the first. It does not bypass a site challenge; complete any challenge manually in the visible browser if requested.

```bash
python -m pip install httpx playwright
python -m playwright install chromium
```

Set `CLOUD_MAIL_LOGIN_EMAIL` and `CLOUD_MAIL_LOGIN_PASSWORD` as environment variables. Optionally set `CLOUD_MAIL_BASE` for a different deployment. Do not commit passwords or account files.

Create a local `accounts.json` containing exactly two entries:

```json
[{"email":"first@example.com","password":"..."},{"email":"second@example.com","password":"..."}]
```

Create a local `selectors.json` with CSS selectors from the actual registration page:

```json
{
  "open_register": "CSS_SELECTOR",
  "email": "CSS_SELECTOR",
  "password": "CSS_SELECTOR",
  "submit": "CSS_SELECTOR",
  "logout": "CSS_SELECTOR"
}
```

Optional selectors: `confirm_password`, `agreement`, `submitted_indicator`, `verified_indicator`, `logged_out_indicator`. Inspect the site with browser DevTools to fill these values. No verified selectors for the external site are included because its live UI was unavailable during implementation.

Run `python tools/bdon_register.py --accounts accounts.json --selectors selectors.json`. Use only mailboxes you own. The script records existing message IDs immediately before each submission so the second run cannot select an old email. It only opens HTTPS verification links on Bilibili domains. Keep `accounts.json` outside the repository.
