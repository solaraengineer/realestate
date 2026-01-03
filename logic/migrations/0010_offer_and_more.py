from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('logic', '0011_set_messaging_tables_state'),
    ]

    operations = [
        # --- Nowy model: Offer (w schemacie messaging) ---
        migrations.CreateModel(
            name='Offer',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)),
                ('price', models.DecimalField(max_digits=14, decimal_places=2)),
                ('type', models.CharField(max_length=16)),   # 'offer' | 'counter'
                ('accepted', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': '"messaging"."offer"',
            },
        ),

        # --- Usunięcie starego pola schema_id z Message (po state-fix do messaging.message) ---
        migrations.RemoveField(
            model_name='message',
            name='schema_id',
        ),

        # --- FK do Conversation i User dla Offer ---
        migrations.AddField(
            model_name='offer',
            name='conversation',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='offers',
                to='logic.conversation'
            ),
        ),
        migrations.AddField(
            model_name='offer',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='offers',
                to=settings.AUTH_USER_MODEL
            ),
        ),

        # --- Indeks przyspieszający pobieranie ostatnich ofert w rozmowie ---
        migrations.AddIndex(
            model_name='offer',
            index=models.Index(
                fields=['conversation', 'created_at'],
                name='offer_convers_created_idx',
            ),
        ),
    ]
