from django.db import migrations 

class Migration(migrations.Migration): 
    dependencies = [
        ('logic', '0007_alter_fa_user'), 
    ] 
    operations = [ 
        migrations.RunSQL( 
            sql="""
                CREATE SCHEMA IF NOT EXISTS messaging; 
                ALTER TABLE IF EXISTS logic_conversation 
                SET SCHEMA messaging; 
                ALTER TABLE IF EXISTS logic_message 
                SET SCHEMA messaging;
            """, 
            reverse_sql=""" 
            ALTER TABLE IF EXISTS messaging.conversation 
                SET SCHEMA public; 
                ALTER TABLE IF EXISTS messaging.message 
                SET SCHEMA public;
            """, 
        ), 
    ]
