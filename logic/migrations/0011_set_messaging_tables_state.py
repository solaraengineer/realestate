from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('logic', '0009_remove_conversation_logic_conve_buyer_i_f6e078_idx_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterModelTable(name='conversation', table='"messaging"."conversation"'),
                migrations.AlterModelTable(name='message', table='"messaging"."message"'),
            ],
        )
    ]
