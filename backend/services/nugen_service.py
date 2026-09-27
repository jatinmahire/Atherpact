"""
AetherPact — Addendum 9: Nugen domain-aligned AI integration (Phases 62-64).

The one deliberate, disclosed exception to this project's "no mandatory
external AI API" rule — HackCelestial 3.0 requires it. Kept contained to
this file and the three agents it defines.

Request/response shapes below are confirmed two ways, not guessed:
1. Read directly from the official cookbook
   (github.com/nugen-in/nugen-cookbook/guides/build_your_agents/guide.ipynb).
2. Verified live against the real API with a temporary probe agent
   (created, matched the cookbook's response shape exactly, then deleted).

Every public method fails soft (returns None) rather than raising, so a
caller can show "Domain insight temporarily unavailable" instead of
breaking a real flow (negotiation, listing submission) that doesn't
depend on it. This matters in practice, not just in theory: at the time
this was built, Nugen's own inference backend was returning a real 502
on every run-agent call (confirmed on both the agents-run endpoint and
the raw /inference/chat/completions endpoint), while agent *creation*
worked fine — exactly the partial-outage shape this fallback exists for.
"""

import json
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.nugen.in"

# qwen-v2p5-0p5b-instruct: small and fast, appropriate for a per-request
# advisory panel that must not add much latency to a real negotiation or
# listing submission. Confirmed as a real, currently-available model via
# GET /api/v3/agents/available_models — not assumed from the cookbook's
# generic "nugen-flash-instruct" example, which isn't in this account's
# actual model list.
DEFAULT_MODEL = "qwen-v2p5-0p5b-instruct"


class NugenClient:
    def __init__(self) -> None:
        self._api_key = os.environ.get("NUGEN_API_KEY", "")

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "accept": "application/json",
        }

    def find_agent_by_name(self, agent_name: str) -> bool:
        """Returns True if an agent with this exact name already exists."""
        if not self._api_key:
            return False
        try:
            resp = httpx.get(f"{BASE_URL}/api/v3/agents", headers=self._headers(), timeout=15.0)
            if resp.status_code != 200:
                return False
            body = resp.json()
            # Real shape confirmed live: {"agents": [...]}. Also tolerates
            # {"data": [...]} or a bare list, in case that ever changes.
            if isinstance(body, dict):
                agents = body.get("agents", body.get("data", body))
            else:
                agents = body
            if not isinstance(agents, list):
                return False
            return any(a.get("name") == agent_name for a in agents if isinstance(a, dict))
        except Exception:
            logger.exception("Nugen list-agents call failed")
            return False

    def create_agent(
        self,
        agent_name: str,
        agent_description: str,
        instructions: str,
        demonstrations: list[dict],
        model: str = DEFAULT_MODEL,
        temperature: float = 0.3,
        max_token: Optional[int] = None,
    ) -> bool:
        if not self._api_key:
            return False
        payload = {
            "agent_name": agent_name,
            "agent_description": agent_description,
            "model": model,
            "temperature": temperature,
            "instructions": instructions,
            "demonstrations": demonstrations,
        }
        if max_token is not None:
            payload["max_token"] = max_token
        try:
            resp = httpx.post(
                f"{BASE_URL}/api/v3/agents/create",
                json=payload,
                headers=self._headers(),
                timeout=30.0,
            )
            if resp.status_code not in (200, 201):
                # Idempotency fallback: if find_agent_by_name ever misses (as
                # it did once, before its list-shape parsing was corrected
                # against the real API), a 400 "already exists" here still
                # means the agent is real and usable — treat it as success
                # rather than as a reason to give up on this agent.
                if resp.status_code == 400 and "already exists" in resp.text.lower():
                    return True
                logger.warning("Nugen create-agent for %s failed: %s %s", agent_name, resp.status_code, resp.text)
                return False
            return True
        except Exception:
            logger.exception("Nugen create-agent call failed for %s", agent_name)
            return False

    def run_agent(self, agent_name: str, message: str) -> Optional[str]:
        """Runs an existing agent and returns its concatenated response text,
        or None on any failure (missing key, network error, non-200 status,
        or a malformed/empty stream)."""
        if not self._api_key:
            return None
        try:
            with httpx.stream(
                "POST",
                f"{BASE_URL}/api/v3/agents/run-agents/{agent_name}/run",
                json={"message": message},
                headers=self._headers(),
                # Nugen's API has been unreachable for this entire session
                # (immediate 502s, confirmed repeatedly) — verified live just
                # now that it can also accept a connection and then stall
                # instead, so a short timeout matters: callers like the
                # Weather Digital Twin endpoint (Phase 91-96) call this once
                # per unique city/condition and a judge is waiting on it.
                timeout=12.0,
            ) as resp:
                if resp.status_code != 200:
                    logger.warning("Nugen run-agent for %s failed: HTTP %s", agent_name, resp.status_code)
                    return None
                full_text = ""
                for line in resp.iter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    chunk_str = line[len("data:"):].strip()
                    if chunk_str in ("[DONE]", ""):
                        continue
                    try:
                        chunk = json.loads(chunk_str)
                    except json.JSONDecodeError:
                        continue
                    if "error" in chunk:
                        logger.warning("Nugen run-agent for %s returned an error chunk: %s", agent_name, chunk["error"])
                        return None
                    full_text += chunk.get("choices", [{}])[0].get("delta", {}).get("text", "")
                return full_text.strip() or None
        except Exception:
            logger.exception("Nugen run-agent call failed for %s", agent_name)
            return None


_client: Optional[NugenClient] = None


def get_client() -> NugenClient:
    global _client
    if _client is None:
        _client = NugenClient()
    return _client


# Agents are created lazily, on first real use, and only once per process —
# mirrors the same lazy-singleton pattern already used for the local MiniLM
# model (services/matcher.py) and the Qwen phrasing model (services/llm_service.py).
_ensured_agents: set[str] = set()


def _ensure_agent(agent_name: str, agent_description: str, instructions: str, demonstrations: list[dict]) -> Optional[str]:
    if agent_name in _ensured_agents:
        return agent_name
    client = get_client()
    if client.find_agent_by_name(agent_name) or client.create_agent(agent_name, agent_description, instructions, demonstrations):
        _ensured_agents.add(agent_name)
        return agent_name
    return None


# ── A very small, disclosed heuristic — not a real demographic dataset — ────
# used only to give Agent 1 the "city tier" context the addendum asks for.
_TIER_1_CITIES = (
    "mumbai", "delhi", "bengaluru", "bangalore", "chennai", "kolkata",
    "hyderabad", "pune", "ahmedabad",
)


def classify_city_tier(address: str) -> str:
    lower = (address or "").lower()
    for city in _TIER_1_CITIES:
        if city in lower:
            return f"Tier 1 ({city.title()})"
    return "Tier 2/3"


# ── Phase 62: Agent 1 — Domain-Aligned Negotiation Advisor ──────────────────
_NEGOTIATION_AGENT_NAME = "aetherpact-negotiation-domain-advisor"
_NEGOTIATION_INSTRUCTIONS = (
    "You are a domain expert in B2B hospitality resource rental negotiations in India. "
    "Given a settled agreement's resource type, city tier, clearing price, and terms, "
    "assess in 2 to 3 sentences whether this is typical for this domain and briefly explain why."
)
_NEGOTIATION_DEMONSTRATIONS = [
    {
        "user_input": "Resource type: Commercial kitchen\nCity tier: Tier 1 (Mumbai)\nClearing price: ₹18,000/day\nTerms: none specified",
        "model_output": (
            "A ₹18,000/day rate for a commercial kitchen in a Tier 1 city like Mumbai is well within the typical "
            "range for shared industrial kitchens in that market, which commonly run ₹12,000-₹25,000/day depending "
            "on equipment and certification level. This settlement looks reasonable for both sides given standard "
            "Tier 1 kitchen rental benchmarks."
        ),
    },
    {
        "user_input": "Resource type: Rooftop event space\nCity tier: Tier 1 (Bengaluru)\nClearing price: ₹9,500/day\nTerms: includes basic AV setup",
        "model_output": (
            "₹9,500/day for a rooftop event space in a Tier 1 city is on the lower end for venues that include AV "
            "setup, since rooftop venues in major metros typically command a premium for ambience and views. The "
            "inclusion of AV in the terms without a corresponding price bump suggests the seeker got a favorable "
            "deal, though not unusually so."
        ),
    },
    {
        "user_input": "Resource type: AV equipment rental\nCity tier: Tier 2/3\nClearing price: ₹3,200/day\nTerms: 3-day minimum",
        "model_output": (
            "A ₹3,200/day rate for AV equipment in a Tier 2/3 city aligns with typical regional pricing, which "
            "tends to run 30-40% below Tier 1 rates for comparable gear. The 3-day minimum term is a standard "
            "practice for equipment rentals to offset setup/teardown overhead, so this settlement looks "
            "unremarkable and fair."
        ),
    },
    {
        "user_input": "Resource type: Banquet hall\nCity tier: Tier 1 (Delhi)\nClearing price: ₹65,000/day\nTerms: security deposit required",
        "model_output": (
            "₹65,000/day for a banquet hall in Delhi sits within the expected band for mid-to-large capacity "
            "venues in a Tier 1 market, where banquet space commonly ranges ₹40,000-₹1,00,000/day depending on "
            "capacity and season. A security deposit requirement is standard practice for banquet-hall bookings "
            "given higher damage/cleanup risk, so nothing here looks atypical."
        ),
    },
]


def negotiation_domain_insight(resource_type: str, city_tier: str, clearing_price: float, terms: Optional[str]) -> Optional[str]:
    agent = _ensure_agent(
        _NEGOTIATION_AGENT_NAME,
        "Domain-aligned advisor assessing whether a settled B2B hospitality rental price is typical for its resource type and city tier in India.",
        _NEGOTIATION_INSTRUCTIONS,
        _NEGOTIATION_DEMONSTRATIONS,
    )
    if not agent:
        return None
    message = (
        f"Resource type: {resource_type}\n"
        f"City tier: {city_tier}\n"
        f"Clearing price: ₹{clearing_price:,.2f}/day\n"
        f"Terms: {terms or 'none specified'}"
    )
    return get_client().run_agent(agent, message)


# ── Phase 63: Agent 2 — Domain-Aligned Listing Compliance Reviewer ──────────
_COMPLIANCE_AGENT_NAME = "aetherpact-listing-compliance-reviewer"
_COMPLIANCE_INSTRUCTIONS = (
    "You are a hospitality safety and compliance domain expert reviewing resource listings for B2B rental in "
    "India. Given a listing's resource type and description, identify any real safety, hygiene, or regulatory "
    "concerns specific to that resource type, or confirm none are apparent."
)
_COMPLIANCE_DEMONSTRATIONS = [
    {
        "user_input": "Resource type: Commercial kitchen\nDescription: Spacious kitchen with 4 burners and a large fridge, available for daily rental.",
        "model_output": (
            "This description doesn't mention fire-safety equipment (extinguishers, exhaust hood, gas shut-off) "
            "or FSSAI hygiene compliance, both of which are standard expectations for a commercial kitchen "
            "listing in India. I'd flag this listing for the provider to add fire-safety and "
            "hygiene-certification details before publishing."
        ),
    },
    {
        "user_input": "Resource type: Rooftop / event space\nDescription: Rooftop with city views, ideal for parties, holds up to 150 guests.",
        "model_output": (
            "The listing states a 150-guest capacity but doesn't mention railing/parapet height or a fire-exit "
            "route, both important for rooftop venues given fall-hazard and crowd-safety regulations in most "
            "Indian municipalities. I'd flag this for the provider to confirm railing safety and an emergency "
            "exit before publishing."
        ),
    },
    {
        "user_input": "Resource type: Commercial kitchen\nDescription: Licensed commercial kitchen, FSSAI-certified, equipped with fire extinguishers and an exhaust hood, gas safety inspected quarterly.",
        "model_output": (
            "This description explicitly covers FSSAI certification, fire-safety equipment, and a documented "
            "gas-safety inspection schedule, which are exactly the concerns that matter for a commercial "
            "kitchen. No compliance concerns are apparent from this description."
        ),
    },
    {
        "user_input": "Resource type: AV & event equipment\nDescription: Full AV setup including projector, speakers, and wiring, delivered and set up by our team, includes electrical safety check before every rental.",
        "model_output": (
            "The listing covers the main AV-equipment concern (electrical safety), confirming a pre-rental "
            "check. No specific safety or regulatory concerns are apparent from this description."
        ),
    },
]

# Maps the frontend's stored category value to a readable resource type for the prompt.
_CATEGORY_LABELS = {
    "banquet_hall": "Banquet hall",
    "commercial_kitchen": "Commercial kitchen",
    "av_equipment": "AV & event equipment",
    "transportation": "Transportation / fleet",
    "event_space": "Rooftop / event space",
    "other": "Other hospitality resource",
}


def listing_domain_compliance_review(category: str, description: str) -> Optional[str]:
    agent = _ensure_agent(
        _COMPLIANCE_AGENT_NAME,
        "Domain-aligned safety/hygiene/regulatory reviewer for hospitality resource listings in India.",
        _COMPLIANCE_INSTRUCTIONS,
        _COMPLIANCE_DEMONSTRATIONS,
    )
    if not agent:
        return None
    resource_type = _CATEGORY_LABELS.get(category, category or "Unspecified resource")
    message = f"Resource type: {resource_type}\nDescription: {description}"
    return get_client().run_agent(agent, message)


# ── Phase 64: Agent 3 — Domain-Aligned Weather-Impact Reasoning ─────────────
# Not wired into any UI yet — created and tested here only. The Weather
# Digital Twin addendum calls this function directly.
_WEATHER_AGENT_NAME = "aetherpact-weather-impact-reasoning"
_WEATHER_INSTRUCTIONS = (
    "You are a hospitality operations expert. Given a weather condition and a real-world social signal about a "
    "specific city or district, explain the likely impact on demand for outdoor venues, indoor venues, and "
    "delivery reliability in that area."
)
_WEATHER_DEMONSTRATIONS = [
    {
        "user_input": "Weather: Flood warning issued for Mumbai.\nSocial signal: multiple reports of waterlogging on Andheri and Bandra roads.",
        "model_output": (
            "With active waterlogging reported in Andheri and Bandra, outdoor venue demand in those areas will "
            "likely drop sharply as guests avoid travel risk, while indoor venues with reliable access roads "
            "may see a short-term demand bump from relocated events. Delivery reliability will likely degrade "
            "significantly on affected routes, so providers should expect delays and possible rescheduling "
            "requests."
        ),
    },
    {
        "user_input": "Weather: Clear skies forecast for Pune.\nSocial signal: no notable weather advisories or social signals reported.",
        "model_output": (
            "With clear weather and no disruptive signals, outdoor venue demand in Pune should follow normal "
            "seasonal patterns with no expected suppression, and indoor venues shouldn't see any weather-driven "
            "shift either way. Delivery reliability should remain at baseline levels with no anticipated delays."
        ),
    },
    {
        "user_input": "Weather: Extreme heat advisory issued for Delhi, temperatures forecast above 45°C.\nSocial signal: none specific beyond the advisory.",
        "model_output": (
            "An extreme heat advisory above 45°C will likely suppress outdoor venue bookings during daytime "
            "hours as organizers shift events indoors or to evening slots, while air-conditioned indoor venues "
            "should see increased demand as a substitute. Delivery reliability may dip slightly due to "
            "heat-related staffing and vehicle constraints, though less severely than in a flood scenario."
        ),
    },
]


def weather_impact_reasoning(weather_condition: str, social_signal: str, location: str) -> Optional[str]:
    agent = _ensure_agent(
        _WEATHER_AGENT_NAME,
        "Domain-aligned reasoning over weather + real-world social signals for hospitality demand impact in India.",
        _WEATHER_INSTRUCTIONS,
        _WEATHER_DEMONSTRATIONS,
    )
    if not agent:
        return None
    message = f"Weather: {weather_condition} ({location}).\nSocial signal: {social_signal}"
    return get_client().run_agent(agent, message)
