"""Sequential BDon signup with Cloud Mail API verification.

Configure the site's CSS selectors in bdon_selectors.json after inspecting its
registration page. No account credentials or verification URLs are logged.
"""
import argparse
import asyncio
import html
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

import httpx
from playwright.async_api import async_playwright

MAIL_BASE = os.getenv("CLOUD_MAIL_BASE", "https://cloud-mail.gumifans.workers.dev").rstrip("/")
SITE = "https://bdon.biligames.com/"
SUBJECT = "请验证您的邮箱地址"
ALLOWED_HOSTS = ("bilibili.com", "biligame.com", "biligames.com")


def payload(response):
    response.raise_for_status()
    body = response.json()
    if body.get("code") != 200:
        raise RuntimeError(f"Cloud Mail API error: {body.get('message', body.get('code'))}")
    return body["data"]


def verification_link(message):
    body = html.unescape((message.get("content") or "") + "\n" + (message.get("text") or ""))
    candidates = re.findall(r'''href\s*=\s*["']([^"']+)["']''', body, re.I)
    candidates += re.findall(r'''https?://[^\s"'<>]+''', body, re.I)
    for candidate in candidates:
        url = html.unescape(candidate).strip().rstrip(".,;)")
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme == "https" and any(host == d or host.endswith("." + d) for d in ALLOWED_HOSTS):
            if any(k in url.lower() for k in ("verify", "confirm", "activate", "token")):
                return url
    raise RuntimeError("Verification mail found, but no trusted verification URL was recognized")


class Mail:
    def __init__(self, client, token):
        self.client = client
        self.headers = {"Authorization": token}  # Cloud Mail expects the raw JWT.

    @classmethod
    async def login(cls, client):
        email = os.environ["CLOUD_MAIL_LOGIN_EMAIL"]
        password = os.environ["CLOUD_MAIL_LOGIN_PASSWORD"]
        token = payload(await client.post("/login", json={"email": email, "password": password}))["token"]
        return cls(client, token)

    async def account_id(self, address):
        last_sort, cursor = 9999999999, 0
        while True:
            rows = payload(await self.client.get("/account/list", headers=self.headers,
                                                 params={"size": 30, "lastSort": last_sort, "accountId": cursor}))
            for row in rows:
                if row["email"].casefold() == address.casefold():
                    return row["accountId"]
            if len(rows) < 30:
                raise ValueError(f"Mailbox not owned by this Cloud Mail user: {address}")
            last_sort, cursor = rows[-1]["sort"], rows[-1]["accountId"]

    async def messages(self, account_id):
        data = payload(await self.client.get("/email/list", headers=self.headers,
                                             params={"accountId": account_id, "size": 50,
                                                     "type": 0, "full": 1, "allReceive": 0}))
        return data["list"]

    async def wait_for_link(self, account_id, old_ids, timeout=120):
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            for message in await self.messages(account_id):
                if message["emailId"] in old_ids or SUBJECT not in (message.get("subject") or ""):
                    continue
                sender = (message.get("sendEmail") or "").lower()
                if not ("bilibili" in sender or "biligame" in sender):
                    continue
                return verification_link(message)
            await asyncio.sleep(3)
        raise TimeoutError("No new Bilibili verification mail arrived within 120 seconds")


async def click(page, selector):
    await page.locator(selector).click(timeout=15000)


async def register(page, selectors, address, password):
    await page.goto(SITE)
    await click(page, selectors["open_register"])
    await page.locator(selectors["email"]).fill(address)
    await page.locator(selectors["password"]).fill(password)
    if selectors.get("confirm_password"):
        await page.locator(selectors["confirm_password"]).fill(password)
    if selectors.get("agreement"):
        await page.locator(selectors["agreement"]).check()
    await click(page, selectors["submit"])
    if selectors.get("submitted_indicator"):
        await page.locator(selectors["submitted_indicator"]).wait_for(timeout=30000)


async def main(args):
    selectors = json.loads(Path(args.selectors).read_text(encoding="utf-8"))
    accounts = json.loads(Path(args.accounts).read_text(encoding="utf-8"))
    if len(accounts) != 2 or any(not a.get("email") or not a.get("password") for a in accounts):
        raise ValueError("accounts JSON must contain exactly two objects with email and password")
    async with httpx.AsyncClient(base_url=MAIL_BASE, timeout=20) as client:
        mail = await Mail.login(client)
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=False)
            context = await browser.new_context()
            page = await context.new_page()
            try:
                for index, account in enumerate(accounts):
                    address = account["email"]
                    account_id = await mail.account_id(address)
                    old_ids = {m["emailId"] for m in await mail.messages(account_id)}
                    await register(page, selectors, address, account["password"])
                    print(f"[{index + 1}/2] Registration submitted; waiting for new mail: {address}")
                    link = await mail.wait_for_link(account_id, old_ids)
                    verify = await context.new_page()
                    await verify.goto(link, wait_until="domcontentloaded")
                    if selectors.get("verified_indicator"):
                        await verify.locator(selectors["verified_indicator"]).wait_for(timeout=30000)
                    await verify.close()
                    print(f"[{index + 1}/2] Verification link opened: {address}")
                    if index == 0:
                        await page.reload()
                        await click(page, selectors["logout"])
                        if selectors.get("logged_out_indicator"):
                            await page.locator(selectors["logged_out_indicator"]).wait_for(timeout=15000)
            finally:
                await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--accounts", required=True, help="Local JSON file with two email/password objects")
    parser.add_argument("--selectors", required=True, help="Local JSON file with CSS selectors for the site")
    asyncio.run(main(parser.parse_args()))
