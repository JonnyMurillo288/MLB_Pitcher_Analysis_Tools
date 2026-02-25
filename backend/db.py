"""DB layer router: delegates to db_local (psycopg2) in TEST_MODE, db_supabase otherwise."""

import os

if os.getenv("TEST_MODE") == "1":
    from db_local import (  # noqa: F401
        get_saved_pitchers,
        add_saved_pitcher,
        remove_saved_pitcher,
        get_subscription,
        upsert_subscription,
        is_active_subscriber,
        get_notification_settings,
        upsert_notification_settings,
        get_all_notifiable_users,
    )
else:
    from db_supabase import (  # noqa: F401
        get_saved_pitchers,
        add_saved_pitcher,
        remove_saved_pitcher,
        get_subscription,
        upsert_subscription,
        is_active_subscriber,
        get_notification_settings,
        upsert_notification_settings,
        get_all_notifiable_users,
    )
