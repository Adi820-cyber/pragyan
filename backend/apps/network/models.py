import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import TenantScopedModel


class NetworkDevice(TenantScopedModel):
    """
    Physical or virtual network entity (Router, Switch, Firewall, Host, Patch Panel)
    modeled directly after NetBox DCIM Device abstractions.
    """
    ROLE_CHOICES = [
        ("EDGE_ROUTER", "Edge / Border Router"),
        ("FIREWALL_WAF", "Next-Gen Firewall / WAF"),
        ("CORE_SWITCH", "Core Distribution Switch"),
        ("TOR_SWITCH", "Top of Rack (ToR) Switch"),
        ("LOAD_BALANCER", "Application Load Balancer"),
        ("PATCH_PANEL", "Passive Patch Panel / Cross-Connect"),
        ("COMPUTE_HOST", "Application / AI Worker Host"),
        ("DATABASE_HOST", "Database / Storage Node"),
        ("VPC_GATEWAY", "Cloud VPC Transit Gateway"),
    ]

    STATUS_CHOICES = [
        ("ACTIVE", "Active / Operational"),
        ("MAINTENANCE", "Under Maintenance"),
        ("OFFLINE", "Offline / Severed"),
        ("DECOMMISSIONED", "Decommissioned"),
    ]

    name = models.CharField(max_length=150)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default="CORE_SWITCH")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")
    primary_ip = models.GenericIPAddressField(null=True, blank=True)
    site_location = models.CharField(max_length=100, default="Primary Datacenter (DC-1)")
    rack_unit = models.CharField(max_length=50, blank=True, help_text="e.g. Rack A04, U18-U20")
    vendor_model = models.CharField(max_length=100, blank=True, default="Cisco / Arista / Linux")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "reskure_network_device"
        ordering = ["role", "name"]
        unique_together = ("tenant", "name")

    def __str__(self):
        return f"{self.name} [{self.get_role_display()}] ({self.primary_ip or 'No IP'})"


class DeviceInterface(TenantScopedModel):
    """
    A network termination point on a device (e.g. eth0, GigabitEthernet0/1, Port 12).
    Follows NetBox's Interface and Pass-Through termination architecture.
    """
    TYPE_CHOICES = [
        ("1000BASE_T", "1G Copper (RJ-45)"),
        ("10G_SFP_PLUS", "10G Fiber (SFP+)"),
        ("25G_SFP28", "25G Fiber (SFP28)"),
        ("100G_QSFP28", "100G Fiber (QSFP28)"),
        ("VIRTUAL", "Virtual / Loopback / VPC VIF"),
        ("PASS_THROUGH", "Pass-Through Front/Rear Port"),
    ]

    device = models.ForeignKey(NetworkDevice, on_delete=models.CASCADE, related_name="interfaces")
    name = models.CharField(max_length=100, help_text="e.g. eth0, gi-0/0/1, Port 1")
    interface_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default="10G_SFP_PLUS")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    mac_address = models.CharField(max_length=30, blank=True)
    mtu = models.IntegerField(default=1500, help_text="Maximum Transmission Unit in bytes (1500 standard, 9000 jumbo)")
    enabled = models.BooleanField(default=True)
    
    # NetBox Pass-Through Port modeling (e.g. front port internally wired to rear port on patch panels)
    is_pass_through = models.BooleanField(default=False)
    pass_through_counterpart = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="counterpart_port"
    )

    class Meta:
        db_table = "reskure_device_interface"
        ordering = ["device", "name"]
        unique_together = ("tenant", "device", "name")

    def __str__(self):
        return f"{self.device.name}:{self.name}"


class CableLink(TenantScopedModel):
    """
    A physical or logical connection joining two interfaces (NetBox Cable).
    Carries packets and models latency, bandwidth, in-flight encryption, and status.
    """
    CABLE_TYPES = [
        ("CAT6A", "Cat6A Shielded Twisted Pair"),
        ("FIBER_SMF", "Single-Mode Fiber (OS2)"),
        ("FIBER_MMF", "Multi-Mode Fiber (OM4)"),
        ("DAC_TWINAX", "Direct Attach Copper (Twinax)"),
        ("VPC_PEERING", "AWS DirectConnect / VPC Cloud Peering"),
    ]

    STATUS_CHOICES = [
        ("CONNECTED", "Connected & Operational"),
        ("DEGRADED", "High Latency / Jitter"),
        ("SEVERED", "Severed / Disconnected (Packet Drop)"),
    ]

    label = models.CharField(max_length=100, help_text="Cable tag or circuit ID, e.g. CBL-1049")
    termination_a = models.ForeignKey(
        DeviceInterface, on_delete=models.CASCADE, related_name="cables_as_a"
    )
    termination_b = models.ForeignKey(
        DeviceInterface, on_delete=models.CASCADE, related_name="cables_as_b"
    )
    cable_type = models.CharField(max_length=30, choices=CABLE_TYPES, default="FIBER_SMF")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="CONNECTED")
    length_meters = models.FloatField(default=10.0)
    latency_ms = models.FloatField(default=0.15, help_text="Propagation delay per hop in milliseconds")
    bandwidth_gbps = models.FloatField(default=10.0, help_text="Available throughput in Gbps")
    is_encrypted = models.BooleanField(default=True, help_text="MACsec or IPsec transit encryption active")
    packet_loss_percent = models.FloatField(default=0.0)

    class Meta:
        db_table = "reskure_cable_link"
        ordering = ["label"]

    def __str__(self):
        return f"{self.label} ({self.termination_a} <-> {self.termination_b})"


class PacketInspectionRule(TenantScopedModel):
    """
    Firewall or WAF filter rule attached to a NetworkDevice to inspect passing packets.
    """
    ACTION_CHOICES = [
        ("PERMIT", "Permit & Forward"),
        ("INSPECT_PASS", "Deep Packet Inspection (DPI) & Allow"),
        ("DENY_DROP", "Deny & Drop Packet"),
    ]

    device = models.ForeignKey(NetworkDevice, on_delete=models.CASCADE, related_name="inspection_rules")
    priority = models.IntegerField(default=100)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, default="PERMIT")
    protocol = models.CharField(max_length=20, default="TCP", help_text="TCP, UDP, ICMP, HTTPS, GRPC, ANY")
    destination_port = models.CharField(max_length=30, default="*", help_text="Port or range, e.g. 443, 8000-9000, *")
    rule_name = models.CharField(max_length=150)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "reskure_packet_inspection_rule"
        ordering = ["device", "priority"]

    def __str__(self):
        return f"[{self.action}] {self.device.name}: {self.rule_name}"
