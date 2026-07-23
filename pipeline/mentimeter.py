from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin


TITLE_PATTERN = re.compile(r"^Desafio Trauma\s*-\s*(\d{2}/\d{2}/\d{4})$")
BACKFILL_START = date(2024, 10, 23)


@dataclass(frozen=True, slots=True)
class PresentationRef:
    presentation_id: str
    title: str
    href: str
    complete: bool = False

    @property
    def session_date(self):
        match = TITLE_PATTERN.match(self.title)
        if not match:
            raise ValueError(f"Invalid presentation title: {self.title}")
        return datetime.strptime(match.group(1), "%d/%m/%Y").date()


def matches_title(title: str) -> bool:
    return bool(TITLE_PATTERN.fullmatch(title.strip()))


def extract_slide_deck(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        if isinstance(payload.get("slide_deck"), dict):
            return payload["slide_deck"]
        for value in payload.values():
            deck = extract_slide_deck(value)
            if deck is not None:
                return deck
    elif isinstance(payload, list):
        for value in payload:
            deck = extract_slide_deck(value)
            if deck is not None:
                return deck
    return None


def remember_json_response(candidates: list[Any], response: Any) -> None:
    """Record response handles without reading bodies inside Playwright callbacks."""
    if "json" in (response.headers.get("content-type") or "").lower():
        candidates.append(response)


def extract_latest_slide_deck(candidates: list[Any]) -> dict[str, Any] | None:
    """Read response bodies only after the active Playwright page operation completes."""
    for response in reversed(candidates):
        try:
            deck = extract_slide_deck(response.json())
        except Exception:
            continue
        if deck is not None:
            return deck
    return None


def select_presentations(
    refs: list[PresentationRef], mode: str, known_ids: set[str] | None = None, manual_id: str | None = None
) -> list[PresentationRef]:
    known_ids = known_ids or set()
    ordered = sorted((ref for ref in refs if ref.session_date >= BACKFILL_START), key=lambda ref: ref.session_date)
    if mode == "manual":
        if not manual_id:
            raise ValueError("manual mode requires --presentation-id")
        matches = [ref for ref in ordered if ref.presentation_id == manual_id]
        if not matches:
            raise ValueError(f"presentation not found: {manual_id}")
        return matches
    if mode == "backfill":
        return ordered
    if mode != "incremental":
        raise ValueError(f"unsupported mode: {mode}")
    if manual_id:
        matches = [ref for ref in ordered if ref.presentation_id == manual_id]
        if not matches:
            raise ValueError(f"presentation not found: {manual_id}")
        return matches
    recent = {ref.presentation_id for ref in ordered[-2:]}
    return [ref for ref in ordered if ref.presentation_id not in known_ids or not ref.complete or ref.presentation_id in recent]


class MentimeterClient:
    """Authenticated Playwright scraper. Playwright is imported lazily for tests."""

    base_url = "https://www.mentimeter.com"

    def __init__(self, email: str | None = None, password: str | None = None, headless: bool = True):
        # LOGIN_* is a local backwards-compatible fallback. CI uses MENTIMETER_*.
        self.email = email or os.getenv("MENTIMETER_EMAIL") or os.getenv("LOGIN_EMAIL")
        self.password = password or os.getenv("MENTIMETER_PASSWORD") or os.getenv("LOGIN_PASSWORD")
        self.headless = headless
        self.storage_state_path = Path(
            os.getenv("PIPELINE_WORKDIR", ".pipeline-data")
        ) / "mentimeter-storage-state.json"
        if not self.email or not self.password:
            raise RuntimeError("MENTIMETER_EMAIL and MENTIMETER_PASSWORD are required")

    def _authenticated_page(self, browser):
        has_state = self.storage_state_path.is_file()
        options: dict[str, Any] = {"accept_downloads": True}
        if has_state:
            options["storage_state"] = str(self.storage_state_path)
        context = browser.new_context(**options)
        page = context.new_page()
        if not has_state:
            self._login(page)
            self.storage_state_path.parent.mkdir(parents=True, exist_ok=True)
            context.storage_state(path=str(self.storage_state_path))
            self.storage_state_path.chmod(0o600)
        return context, page

    @staticmethod
    def _remove_consent_overlay(page) -> None:
        consent = page.locator("#cookiebanner, #cookiebanner-container, #cookiebanner-backdrop")
        if consent.count():
            # Keep the default consent state; only remove the visual overlay that
            # otherwise intercepts automation clicks in fresh CI contexts.
            consent.evaluate_all("(elements) => elements.forEach((element) => element.remove())")

    def _login(self, page) -> None:
        page.goto(f"{self.base_url}/login", wait_until="domcontentloaded")
        self._remove_consent_overlay(page)
        page.get_by_label(re.compile("email", re.I)).fill(self.email)
        page.get_by_test_id("password-input").fill(self.password)
        page.get_by_test_id("login-btn").click()
        page.wait_for_url(re.compile(r"/(app|dashboard)"), timeout=45_000)

    def _discover_with_page(self, page) -> list[PresentationRef]:
        page.goto(f"{self.base_url}/app/dashboard", wait_until="domcontentloaded")
        folder_selector = 'a[href*="/app/folder/"]'
        page.wait_for_selector(folder_selector, timeout=30_000)
        folders = page.locator(folder_selector)
        folder_href = ""
        for index in range(folders.count()):
            folder = folders.nth(index)
            if (folder.inner_text() or "").strip() == "Desafio Trauma":
                folder_href = folder.get_attribute("href") or ""
                break
        if not folder_href:
            raise RuntimeError('Mentimeter folder "Desafio Trauma" was not found')

        page.goto(urljoin(self.base_url, folder_href), wait_until="domcontentloaded")
        presentation_selector = 'a[href*="/app/presentation/"][href*="/edit"]'
        page.wait_for_selector(presentation_selector, timeout=30_000)

        # The library uses a nested overflow container and loads cards in batches.
        # Require three unchanged, non-loading observations before collecting links.
        scroll_script = """
        () => {
          const elements = Array.from(document.querySelectorAll("*"));
          const container = elements.find((element) => {
            const style = getComputedStyle(element);
            return element.scrollHeight > element.clientHeight + 50
              && (style.overflowY === "auto" || style.overflowY === "scroll");
          });
          const links = document.querySelectorAll(
            'a[href*="/app/presentation/"][href*="/edit"]'
          ).length;
          const loading = document.body.innerText.includes("Loading more...");
          if (container) {
            container.scrollTo(0, container.scrollHeight);
          }
          return {
            links,
            loading,
            scrollHeight: container ? container.scrollHeight : document.body.scrollHeight
          };
        }
        """
        previous_signature: tuple[int, int] | None = None
        stable_observations = 0
        for _ in range(100):
            state = page.evaluate(scroll_script)
            signature = (int(state["links"]), int(state["scrollHeight"]))
            if signature == previous_signature and not state["loading"]:
                stable_observations += 1
            else:
                stable_observations = 0
            if stable_observations >= 3:
                break
            previous_signature = signature
            page.wait_for_timeout(350)
        else:
            raise RuntimeError("Mentimeter presentation list did not finish loading")

        anchors = page.locator(presentation_selector)
        result: dict[str, PresentationRef] = {}
        for index in range(anchors.count()):
            anchor = anchors.nth(index)
            title = (anchor.inner_text() or "").strip()
            href = anchor.get_attribute("href") or ""
            if not matches_title(title):
                continue
            match = re.search(r"/presentation/([^/?]+)", href)
            if match:
                presentation_id = match.group(1)
                results_href = f"/app/presentation/{presentation_id}/results?source=dashboard"
                result[presentation_id] = PresentationRef(presentation_id, title, results_href)
        return sorted(result.values(), key=lambda ref: ref.session_date)

    def discover(self) -> list[PresentationRef]:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=self.headless)
            context, page = self._authenticated_page(browser)
            result = self._discover_with_page(page)
            context.storage_state(path=str(self.storage_state_path))
            self.storage_state_path.chmod(0o600)
            browser.close()
            return result

    def _download_with_page(self, page, ref: PresentationRef, destination: Path) -> Path:
        destination.mkdir(parents=True, exist_ok=True)
        page.goto(urljoin(self.base_url, ref.href), wait_until="domcontentloaded", timeout=45_000)
        download_button = page.get_by_role("button", name="Download", exact=True)
        try:
            download_button.wait_for(state="visible", timeout=45_000)
        except Exception:
            # Legacy result pages can remain in an insights-loading state on
            # their first render. One clean reload reliably mounts the toolbar.
            page.reload(wait_until="domcontentloaded", timeout=45_000)
            download_button.wait_for(state="visible", timeout=45_000)
        def trigger_xlsx_download():
            # The consent component is injected asynchronously on application
            # routes. Remove it only after the results controls have mounted.
            self._remove_consent_overlay(page)
            download_button.click()
            xlsx_menuitem = page.locator("#excel-download-button")
            xlsx_menuitem.wait_for(state="visible", timeout=15_000)
            with page.expect_event("download", timeout=45_000) as download_info:
                xlsx_menuitem.click()
            return download_info.value

        try:
            download = trigger_xlsx_download()
        except Exception:
            # Mentimeter occasionally delays XLSX generation even after the
            # menu is visible. Reload once to obtain a fresh export request.
            page.reload(wait_until="domcontentloaded", timeout=45_000)
            download_button.wait_for(state="visible", timeout=45_000)
            download = trigger_xlsx_download()
        xlsx_path = destination / f"{ref.presentation_id}.xlsx"
        download.save_as(xlsx_path)
        return xlsx_path

    def fetch(self, ref: PresentationRef, destination: Path) -> tuple[Path, dict[str, Any]]:
        """Download XLSX and capture the authoritative slide_deck JSON response."""
        from playwright.sync_api import sync_playwright

        destination.mkdir(parents=True, exist_ok=True)
        response_candidates: list[Any] = []
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=self.headless)
            context, page = self._authenticated_page(browser)

            def on_response(response) -> None:
                remember_json_response(response_candidates, response)

            page.on("response", on_response)
            xlsx_path = self._download_with_page(page, ref, destination)
            page.wait_for_timeout(750)
            deck = extract_latest_slide_deck(response_candidates)
            browser.close()
        if deck is None:
            raise RuntimeError(f"No JSON response containing slide_deck for {ref.presentation_id}")
        deck_path = destination / f"{ref.presentation_id}.slide_deck.json"
        deck_path.write_text(json.dumps({"slide_deck": deck}, ensure_ascii=False), encoding="utf-8")
        return xlsx_path, deck
