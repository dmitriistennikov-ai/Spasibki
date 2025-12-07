from datetime import datetime, timezone, timedelta

LOCAL_OFFSET_HOURS = 5

LOCAL_TZ = timezone(timedelta(hours=LOCAL_OFFSET_HOURS))


def ensure_utc(dt: datetime) -> datetime:

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def to_local_time(dt: datetime | None) -> datetime | None:

    if dt is None:
        return None

    utc_dt = ensure_utc(dt)
    return utc_dt.astimezone(LOCAL_TZ)
