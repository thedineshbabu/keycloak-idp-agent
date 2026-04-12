"""
Datadog API Client
Async httpx client for Datadog log, trace, metric, monitor, and event APIs.
Pattern follows platform_api.py. Uses verify=True (Datadog is external).
Enabled only when DD_API_KEY and DD_APP_KEY are both set.
"""
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx

DD_API_KEY  = os.getenv("DATADOG_API_KEY", "")
DD_APP_KEY  = os.getenv("DATADOG_APP_KEY", "")
DD_SITE     = os.getenv("DATADOG_SITE", "datadoghq.com")
DD_BASE_URL = f"https://api.{DD_SITE}"

_OPTS = dict(timeout=httpx.Timeout(30.0), verify=True)


def dd_available() -> bool:
    """Return True when both Datadog API keys are configured."""
    return bool(DD_API_KEY and DD_APP_KEY)


def _dd_headers() -> dict:
    return {
        "DD-API-KEY":         DD_API_KEY,
        "DD-APPLICATION-KEY": DD_APP_KEY,
        "Content-Type":       "application/json",
    }


def _parse_time_range(range_str: str) -> tuple[str, str]:
    """Convert friendly range strings (1h, 6h, 24h, 7d) to ISO 8601 UTC timestamps.

    Returns (from_ts, to_ts) as ISO 8601 strings suitable for Datadog API calls.
    Unknown values default to 1h.
    """
    now = datetime.now(timezone.utc)
    deltas = {
        "1h":  timedelta(hours=1),
        "6h":  timedelta(hours=6),
        "24h": timedelta(hours=24),
        "7d":  timedelta(days=7),
    }
    delta = deltas.get(range_str, timedelta(hours=1))
    from_dt = now - delta
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    return from_dt.strftime(fmt), now.strftime(fmt)


def _trim_log(entry: dict) -> dict:
    """Trim a Datadog log entry to fields relevant for LLM context."""
    attrs = entry.get("attributes", {})
    msg = attrs.get("message", "") or ""
    return {
        "timestamp": attrs.get("timestamp"),
        "service":   attrs.get("service"),
        "status":    attrs.get("status"),
        "message":   msg[:500] if msg else "",
        "error_kind":    attrs.get("error", {}).get("kind") if isinstance(attrs.get("error"), dict) else None,
        "error_message": attrs.get("error", {}).get("message") if isinstance(attrs.get("error"), dict) else None,
        "user_email":    attrs.get("usr", {}).get("email") if isinstance(attrs.get("usr"), dict) else None,
        "http_status":   attrs.get("http", {}).get("status_code") if isinstance(attrs.get("http"), dict) else None,
    }


def _trim_span(entry: dict) -> dict:
    """Trim a Datadog span entry to fields relevant for LLM context."""
    attrs = entry.get("attributes", {})
    return {
        "timestamp":    attrs.get("timestamp"),
        "service":      attrs.get("service"),
        "operation":    attrs.get("operationName"),
        "resource":     attrs.get("resourceName"),
        "duration_ns":  attrs.get("duration"),
        "status":       attrs.get("status"),
        "error":        attrs.get("error"),
        "user_email":   attrs.get("meta", {}).get("usr.email") if isinstance(attrs.get("meta"), dict) else None,
    }


# ── Log search ────────────────────────────────────────────────────────────────

async def dd_search_logs(query: str, time_from: str, time_to: str, limit: int = 50) -> dict:
    """POST /api/v2/logs/events/search — search Datadog logs."""
    payload = {
        "filter": {
            "query": query,
            "from":  time_from,
            "to":    time_to,
        },
        "page": {"limit": limit},
        "sort": "-timestamp",
    }
    try:
        async with httpx.AsyncClient(**_OPTS) as c:
            r = await c.post(
                f"{DD_BASE_URL}/api/v2/logs/events/search",
                headers=_dd_headers(),
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
            entries = data.get("data", [])
            return {
                "count": len(entries),
                "logs":  [_trim_log(e) for e in entries],
            }
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}", "detail": exc.response.text[:300]}
    except httpx.RequestError as exc:
        return {"error": "Datadog unreachable", "detail": str(exc)}


# ── Trace search ──────────────────────────────────────────────────────────────

async def dd_search_traces(query: str, time_from: str, time_to: str, limit: int = 20) -> dict:
    """POST /api/v2/spans/events/search — search Datadog APM traces/spans."""
    payload = {
        "filter": {
            "query": query,
            "from":  time_from,
            "to":    time_to,
        },
        "page": {"limit": limit},
        "sort": "-timestamp",
    }
    try:
        async with httpx.AsyncClient(**_OPTS) as c:
            r = await c.post(
                f"{DD_BASE_URL}/api/v2/spans/events/search",
                headers=_dd_headers(),
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
            entries = data.get("data", [])
            return {
                "count": len(entries),
                "spans": [_trim_span(e) for e in entries],
            }
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}", "detail": exc.response.text[:300]}
    except httpx.RequestError as exc:
        return {"error": "Datadog unreachable", "detail": str(exc)}


# ── Metrics query ─────────────────────────────────────────────────────────────

async def dd_query_metrics(query: str, from_epoch: int, to_epoch: int) -> dict:
    """GET /api/v1/query — query Datadog metrics timeseries."""
    try:
        async with httpx.AsyncClient(**_OPTS) as c:
            r = await c.get(
                f"{DD_BASE_URL}/api/v1/query",
                headers=_dd_headers(),
                params={"query": query, "from": from_epoch, "to": to_epoch},
            )
            r.raise_for_status()
            data = r.json()
            series = data.get("series", [])
            # Summarise each series: name + last point value
            summary = []
            for s in series:
                points = s.get("pointlist", [])
                last_val = points[-1][1] if points else None
                summary.append({
                    "metric":     s.get("metric"),
                    "scope":      s.get("scope"),
                    "last_value": last_val,
                    "unit":       s.get("unit", [{}])[0].get("name") if s.get("unit") else None,
                })
            return {"series_count": len(series), "series": summary}
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}", "detail": exc.response.text[:300]}
    except httpx.RequestError as exc:
        return {"error": "Datadog unreachable", "detail": str(exc)}


# ── Monitor / alert list ──────────────────────────────────────────────────────

async def dd_get_active_monitors(query: str = "", tags: Optional[list] = None) -> dict:
    """GET /api/v1/monitor — list monitors, filtered to triggered/alert state."""
    params: dict = {"monitor_tags_only": "false"}
    if query:
        params["name"] = query
    if tags:
        params["tags"] = ",".join(tags)
    try:
        async with httpx.AsyncClient(**_OPTS) as c:
            r = await c.get(
                f"{DD_BASE_URL}/api/v1/monitor",
                headers=_dd_headers(),
                params=params,
            )
            r.raise_for_status()
            monitors = r.json()
            # Only return triggered monitors (Alert / Warn / No-Data)
            active = [
                {
                    "id":      m.get("id"),
                    "name":    m.get("name"),
                    "type":    m.get("type"),
                    "status":  m.get("overall_state"),
                    "message": (m.get("message") or "")[:300],
                    "tags":    m.get("tags", []),
                }
                for m in monitors
                if m.get("overall_state") in ("Alert", "Warn", "No Data")
            ]
            return {"active_count": len(active), "monitors": active}
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}", "detail": exc.response.text[:300]}
    except httpx.RequestError as exc:
        return {"error": "Datadog unreachable", "detail": str(exc)}


# ── Event search ──────────────────────────────────────────────────────────────

async def dd_search_events(query: str, time_from: str, time_to: str) -> dict:
    """POST /api/v2/events/search — search Datadog events (deploys, incidents)."""
    payload = {
        "filter": {
            "query": query,
            "from":  time_from,
            "to":    time_to,
        },
        "page": {"limit": 25},
        "sort": "-timestamp",
    }
    try:
        async with httpx.AsyncClient(**_OPTS) as c:
            r = await c.post(
                f"{DD_BASE_URL}/api/v2/events/search",
                headers=_dd_headers(),
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
            entries = data.get("data", [])
            events = []
            for e in entries:
                attrs = e.get("attributes", {})
                events.append({
                    "timestamp": attrs.get("timestamp"),
                    "title":     attrs.get("title"),
                    "text":      (attrs.get("message") or "")[:300],
                    "tags":      attrs.get("tags", []),
                    "priority":  attrs.get("priority"),
                })
            return {"count": len(events), "events": events}
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}", "detail": exc.response.text[:300]}
    except httpx.RequestError as exc:
        return {"error": "Datadog unreachable", "detail": str(exc)}
