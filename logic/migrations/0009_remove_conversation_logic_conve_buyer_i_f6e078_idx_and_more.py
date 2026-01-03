from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('logic', '0008_remove_conversation_logic_conve_buyer_i_f6e078_idx_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE SCHEMA IF NOT EXISTS messaging;

                ALTER TABLE IF EXISTS public.logic_conversation
                SET SCHEMA messaging;

                ALTER TABLE IF EXISTS public.logic_message
                SET SCHEMA messaging;

                -- opcjonalnie: zmień nazwy, by usunąć prefiks "logic_"
                ALTER TABLE IF EXISTS messaging.logic_conversation RENAME TO conversation;
                ALTER TABLE IF EXISTS messaging.logic_message RENAME TO message;
            """,
            reverse_sql="""
                ALTER TABLE IF EXISTS messaging.conversation SET SCHEMA public;
                ALTER TABLE IF EXISTS messaging.message SET SCHEMA public;
            """,
        ),
    ]
