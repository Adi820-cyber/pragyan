import django.db.models.deletion
import django.utils.timezone
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="NetworkDevice",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        default=django.utils.timezone.now, editable=False
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=150)),
                (
                    "role",
                    models.CharField(
                        choices=[
                            ("EDGE_ROUTER", "Edge / Border Router"),
                            ("FIREWALL_WAF", "Next-Gen Firewall / WAF"),
                            ("CORE_SWITCH", "Core Distribution Switch"),
                            ("TOR_SWITCH", "Top of Rack (ToR) Switch"),
                            ("LOAD_BALANCER", "Application Load Balancer"),
                            ("PATCH_PANEL", "Passive Patch Panel / Cross-Connect"),
                            ("COMPUTE_HOST", "Application / AI Worker Host"),
                            ("DATABASE_HOST", "Database / Storage Node"),
                            ("VPC_GATEWAY", "Cloud VPC Transit Gateway"),
                        ],
                        default="CORE_SWITCH",
                        max_length=30,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("ACTIVE", "Active / Operational"),
                            ("MAINTENANCE", "Under Maintenance"),
                            ("OFFLINE", "Offline / Severed"),
                            ("DECOMMISSIONED", "Decommissioned"),
                        ],
                        default="ACTIVE",
                        max_length=20,
                    ),
                ),
                ("primary_ip", models.GenericIPAddressField(blank=True, null=True)),
                (
                    "site_location",
                    models.CharField(
                        default="Primary Datacenter (DC-1)", max_length=100
                    ),
                ),
                (
                    "rack_unit",
                    models.CharField(
                        blank=True,
                        help_text="e.g. Rack A04, U18-U20",
                        max_length=50,
                    ),
                ),
                (
                    "vendor_model",
                    models.CharField(
                        blank=True,
                        default="Cisco / Arista / Linux",
                        max_length=100,
                    ),
                ),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_records",
                        to="core.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "reskure_network_device",
                "ordering": ["role", "name"],
                "unique_together": {("tenant", "name")},
            },
        ),
        migrations.CreateModel(
            name="DeviceInterface",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        default=django.utils.timezone.now, editable=False
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "name",
                    models.CharField(
                        help_text="e.g. eth0, gi-0/0/1, Port 1", max_length=100
                    ),
                ),
                (
                    "interface_type",
                    models.CharField(
                        choices=[
                            ("1000BASE_T", "1G Copper (RJ-45)"),
                            ("10G_SFP_PLUS", "10G Fiber (SFP+)"),
                            ("25G_SFP28", "25G Fiber (SFP28)"),
                            ("100G_QSFP28", "100G Fiber (QSFP28)"),
                            ("VIRTUAL", "Virtual / Loopback / VPC VIF"),
                            ("PASS_THROUGH", "Pass-Through Front/Rear Port"),
                        ],
                        default="10G_SFP_PLUS",
                        max_length=30,
                    ),
                ),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("mac_address", models.CharField(blank=True, max_length=30)),
                (
                    "mtu",
                    models.IntegerField(
                        default=1500,
                        help_text="Maximum Transmission Unit in bytes (1500 standard, 9000 jumbo)",
                    ),
                ),
                ("enabled", models.BooleanField(default=True)),
                ("is_pass_through", models.BooleanField(default=False)),
                (
                    "device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="interfaces",
                        to="network.networkdevice",
                    ),
                ),
                (
                    "pass_through_counterpart",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="counterpart_port",
                        to="network.deviceinterface",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_records",
                        to="core.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "reskure_device_interface",
                "ordering": ["device", "name"],
                "unique_together": {("tenant", "device", "name")},
            },
        ),
        migrations.CreateModel(
            name="CableLink",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        default=django.utils.timezone.now, editable=False
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "label",
                    models.CharField(
                        help_text="Cable tag or circuit ID, e.g. CBL-1049",
                        max_length=100,
                    ),
                ),
                (
                    "cable_type",
                    models.CharField(
                        choices=[
                            ("CAT6A", "Cat6A Shielded Twisted Pair"),
                            ("FIBER_SMF", "Single-Mode Fiber (OS2)"),
                            ("FIBER_MMF", "Multi-Mode Fiber (OM4)"),
                            ("DAC_TWINAX", "Direct Attach Copper (Twinax)"),
                            (
                                "VPC_PEERING",
                                "AWS DirectConnect / VPC Cloud Peering",
                            ),
                        ],
                        default="FIBER_SMF",
                        max_length=30,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("CONNECTED", "Connected & Operational"),
                            ("DEGRADED", "High Latency / Jitter"),
                            (
                                "SEVERED",
                                "Severed / Disconnected (Packet Drop)",
                            ),
                        ],
                        default="CONNECTED",
                        max_length=20,
                    ),
                ),
                ("length_meters", models.FloatField(default=10.0)),
                (
                    "latency_ms",
                    models.FloatField(
                        default=0.15,
                        help_text="Propagation delay per hop in milliseconds",
                    ),
                ),
                (
                    "bandwidth_gbps",
                    models.FloatField(
                        default=10.0,
                        help_text="Available throughput in Gbps",
                    ),
                ),
                (
                    "is_encrypted",
                    models.BooleanField(
                        default=True,
                        help_text="MACsec or IPsec transit encryption active",
                    ),
                ),
                ("packet_loss_percent", models.FloatField(default=0.0)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_records",
                        to="core.tenant",
                    ),
                ),
                (
                    "termination_a",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cables_as_a",
                        to="network.deviceinterface",
                    ),
                ),
                (
                    "termination_b",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cables_as_b",
                        to="network.deviceinterface",
                    ),
                ),
            ],
            options={
                "db_table": "reskure_cable_link",
                "ordering": ["label"],
            },
        ),
        migrations.CreateModel(
            name="PacketInspectionRule",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        default=django.utils.timezone.now, editable=False
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("priority", models.IntegerField(default=100)),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("PERMIT", "Permit & Forward"),
                            (
                                "INSPECT_PASS",
                                "Deep Packet Inspection (DPI) & Allow",
                            ),
                            ("DENY_DROP", "Deny & Drop Packet"),
                        ],
                        default="PERMIT",
                        max_length=20,
                    ),
                ),
                (
                    "protocol",
                    models.CharField(
                        default="TCP",
                        help_text="TCP, UDP, ICMP, HTTPS, GRPC, ANY",
                        max_length=20,
                    ),
                ),
                (
                    "destination_port",
                    models.CharField(
                        default="*",
                        help_text="Port or range, e.g. 443, 8000-9000, *",
                        max_length=30,
                    ),
                ),
                ("rule_name", models.CharField(max_length=150)),
                ("notes", models.TextField(blank=True)),
                (
                    "device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="inspection_rules",
                        to="network.networkdevice",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_records",
                        to="core.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "reskure_packet_inspection_rule",
                "ordering": ["device", "priority"],
            },
        ),
    ]
