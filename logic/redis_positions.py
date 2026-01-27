import time
from typing import Literal, Optional, List, Dict, Any

from django_redis import get_redis_connection

ActorType = Literal["user", "bot"]

GEO_KEY = "geo:actors"
POS_KEY_PREFIX = "pos"

DEFAULT_TTL_SECONDS = 120
STALE_SECONDS = 180


def _pos_key(actor_type: ActorType, actor_id: int | str) -> str:
    return f"{POS_KEY_PREFIX}:{actor_type}:{actor_id}"


def _member_name(actor_type: ActorType, actor_id: int | str) -> str:
    return f"{actor_type}:{actor_id}"


def update_actor_position(
    actor_type: ActorType,
    actor_id: int | str,
    lat: float,
    lon: float,
    *,
    alt: Optional[float] = None,
    name: Optional[str] = None,
    op: Optional[str] = None,     
    heading: Optional[float] = None,
    speed: Optional[float] = None,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> None:
    """Update actor position in Redis geo index and hash."""
    r = get_redis_connection("default")
    member = _member_name(actor_type, actor_id)
    pos_key = _pos_key(actor_type, actor_id)

    lon_f = float(lon)
    lat_f = float(lat)
    r.geoadd(GEO_KEY, [lon_f, lat_f, member])

    now_ts = int(time.time())
    mapping: Dict[str, Any] = {
        "lat": str(lat_f),
        "lon": str(lon_f),
        "ts": str(now_ts),
        "type": actor_type,
    }
    if alt is not None:
        mapping["alt"] = str(float(alt))
    if name:
        mapping["name"] = str(name)
    if op:
        mapping["op"] = str(op)
    if heading is not None:
        mapping["heading"] = str(float(heading))
    if speed is not None:
        mapping["speed"] = str(float(speed))

    r.hset(pos_key, mapping=mapping)
    r.expire(pos_key, ttl_seconds)


def get_actor_position(actor_type: ActorType, actor_id: int | str) -> Optional[dict]:
    """Return actor position from Redis or None if not found/stale."""
    r = get_redis_connection("default")
    pos_key = _pos_key(actor_type, actor_id)
    data = r.hgetall(pos_key)
    if not data:
        return None

    decoded = {k.decode("utf-8"): v.decode("utf-8") for k, v in data.items()}

    ts_str = decoded.get("ts")
    try:
        ts = int(ts_str) if ts_str is not None else None
    except ValueError:
        ts = None

    now_ts = int(time.time())
    if ts is None or now_ts - ts > STALE_SECONDS:
        return None

    try:
        lat = float(decoded["lat"])
        lon = float(decoded["lon"])
    except (KeyError, ValueError):
        return None

    result: dict = {
        "type": decoded.get("type") or actor_type,
        "id": actor_id,
        "lat": lat,
        "lon": lon,
        "ts": ts,
    }
    if "alt" in decoded:
        try:
            result["alt"] = float(decoded["alt"])
        except ValueError:
            pass
    if "name" in decoded:
        result["name"] = decoded["name"]
    if "heading" in decoded:
        try:
            result["heading"] = float(decoded["heading"])
        except ValueError:
            pass
    if "speed" in decoded:
        try:
            result["speed"] = float(decoded["speed"])
        except ValueError:
            pass

    return result


def get_nearby_actors(
    lat: float,
    lon: float,
    radius_km: float,
    *,
    max_results: int = 200,
    include_types: Optional[List[ActorType]] = None,
) -> List[dict]:
    """Return list of actors within radius_km from point (lat, lon)."""
    r = get_redis_connection("default")

    lat_f = float(lat)
    lon_f = float(lon)
    radius = float(radius_km)

    raw_results = r.georadius(
        GEO_KEY,
        lon_f,
        lat_f,
        radius,
        unit="km",
        withdist=True,
        withcoord=True,
        count=max_results,
    )

    pipe = r.pipeline()
    for member_bytes, dist, coords in raw_results:
        member = member_bytes.decode("utf-8")
        actor_type, actor_id = member.split(":", 1)
        pos_key = _pos_key(actor_type, actor_id)
        pipe.hgetall(pos_key)

    hashes = pipe.execute()

    now_ts = int(time.time())
    results: List[dict] = []

    for (member_bytes, dist, coords), h in zip(raw_results, hashes):
        if not h:
            continue

        member = member_bytes.decode("utf-8")
        actor_type, actor_id = member.split(":", 1)

        if include_types is not None and actor_type not in include_types:
            continue

        decoded = {k.decode("utf-8"): v.decode("utf-8") for k, v in h.items()}

        ts_str = decoded.get("ts")
        try:
            ts = int(ts_str) if ts_str is not None else None
        except ValueError:
            ts = None

        if ts is None or now_ts - ts > STALE_SECONDS:
            continue

        try:
            lat_val = float(decoded["lat"])
            lon_val = float(decoded["lon"])
        except (KeyError, ValueError):
            continue

        item: dict = {
            "type": decoded.get("type") or actor_type,
            "id": actor_id,
            "lat": lat_val,
            "lon": lon_val,
            "dist_km": float(dist),
            "ts": ts,
        }
        if "alt" in decoded:
            try:
                item["alt"] = float(decoded["alt"])
            except ValueError:
                pass
        if "name" in decoded:
            item["name"] = decoded["name"]
        if "heading" in decoded:
            try:
                item["heading"] = float(decoded["heading"])
            except ValueError:
                pass
        if "speed" in decoded:
            try:
                item["speed"] = float(decoded["speed"])
            except ValueError:
                pass
        if "op" in decoded:
            item["op"] = decoded["op"]

        results.append(item)

    return results
