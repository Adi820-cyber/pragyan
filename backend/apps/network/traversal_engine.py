import logging
from typing import Dict, Any, List, Optional
from apps.network.models import NetworkDevice, DeviceInterface, CableLink, PacketInspectionRule

logger = logging.getLogger(__name__)

MAX_HOPS = 25


def trace_packet_path(
    tenant_id: str,
    source_interface_id: str,
    destination_interface_id: str,
    protocol: str = "HTTPS",
    destination_port: str = "443",
    packet_size_bytes: int = 1420,
    payload_label: str = "Customer Data Ingestion / Inference Request",
) -> Dict[str, Any]:
    """
    NetBox-inspired recursive packet path tracer.
    Traces the physical and logical route from a source interface to a destination interface.
    Inspects cables, pass-through cross-connects, MTU bottlenecks, transit encryption,
    and firewall inspection checkpoints.
    """
    try:
        source_iface = DeviceInterface.objects.select_related("device").get(
            id=source_interface_id, tenant_id=tenant_id
        )
        dest_iface = DeviceInterface.objects.select_related("device").get(
            id=destination_interface_id, tenant_id=tenant_id
        )
    except DeviceInterface.DoesNotExist:
        return {
            "status": "ERROR",
            "message": "Source or destination network interface not found.",
            "hops": [],
        }

    hops: List[Dict[str, Any]] = []
    visited_interfaces = set()
    current_iface = source_iface
    cumulative_latency_ms = 0.0
    traversal_status = "DELIVERED"
    termination_reason = "Packet successfully reached destination interface."
    min_mtu = current_iface.mtu
    unencrypted_hops = 0
    hop_index = 1

    while hop_index <= MAX_HOPS:
        visited_interfaces.add(str(current_iface.id))

        if current_iface.mtu < min_mtu:
            min_mtu = current_iface.mtu

        # Check MTU limit
        mtu_issue = None
        if packet_size_bytes > current_iface.mtu:
            mtu_issue = f"Packet size ({packet_size_bytes}B) exceeds MTU ({current_iface.mtu}B) - fragmented"

        # Check Device Operational Status & Firewall
        device = current_iface.device
        device_inspection = "PERMIT"
        device_note = "Interface forwarded frame"

        if device.status == "OFFLINE":
            traversal_status = "DROPPED"
            termination_reason = f"Device '{device.name}' is OFFLINE. Packet dropped."
            hops.append({
                "hop_number": hop_index,
                "device_name": device.name,
                "device_role": device.role,
                "interface_name": current_iface.name,
                "ip_address": current_iface.ip_address or device.primary_ip or "N/A",
                "cable_label": "None",
                "cable_type": "Internal",
                "hop_latency_ms": 0.0,
                "cumulative_latency_ms": round(cumulative_latency_ms, 2),
                "is_encrypted": True,
                "mtu": current_iface.mtu,
                "action": "DROP_OFFLINE",
                "notes": termination_reason,
            })
            break

        # Check Firewall rules on current device
        rules = PacketInspectionRule.objects.filter(
            tenant_id=tenant_id, device=device
        ).order_by("priority")
        
        rule_blocked = False
        for rule in rules:
            proto_match = rule.protocol in ("ANY", protocol)
            port_match = rule.destination_port in ("*", destination_port)
            if proto_match and port_match:
                if rule.action == "DENY_DROP":
                    device_inspection = "DENIED"
                    device_note = f"Blocked by rule '{rule.rule_name}': {rule.notes or 'Access Forbidden'}"
                    rule_blocked = True
                    break
                elif rule.action == "INSPECT_PASS":
                    device_inspection = "INSPECTED"
                    device_note = f"Verified by rule '{rule.rule_name}' (Deep Packet Inspection passed)"
                    break

        if rule_blocked:
            traversal_status = "BLOCKED_FIREWALL"
            termination_reason = f"Security filter on {device.name} dropped packet."
            hops.append({
                "hop_number": hop_index,
                "device_name": device.name,
                "device_role": device.role,
                "interface_name": current_iface.name,
                "ip_address": current_iface.ip_address or device.primary_ip or "N/A",
                "cable_label": "None",
                "cable_type": "Internal",
                "hop_latency_ms": 0.0,
                "cumulative_latency_ms": round(cumulative_latency_ms, 2),
                "is_encrypted": True,
                "mtu": current_iface.mtu,
                "action": "FIREWALL_DROP",
                "notes": device_note,
            })
            break

        # Did we reach destination interface?
        if current_iface.id == dest_iface.id:
            hops.append({
                "hop_number": hop_index,
                "device_name": device.name,
                "device_role": device.role,
                "interface_name": current_iface.name,
                "ip_address": current_iface.ip_address or device.primary_ip or "N/A",
                "cable_label": "Destination Termination",
                "cable_type": "Endpoint",
                "hop_latency_ms": 0.05,
                "cumulative_latency_ms": round(cumulative_latency_ms + 0.05, 2),
                "is_encrypted": True,
                "mtu": current_iface.mtu,
                "action": "DELIVERED",
                "notes": f"Destination socket reached ({payload_label})",
            })
            cumulative_latency_ms += 0.05
            break

        # Handle Pass-Through Ports (e.g. Front port to Rear port on NetBox patch panels)
        if current_iface.is_pass_through and current_iface.pass_through_counterpart:
            counterpart = current_iface.pass_through_counterpart
            hops.append({
                "hop_number": hop_index,
                "device_name": device.name,
                "device_role": device.role,
                "interface_name": f"{current_iface.name} ➔ {counterpart.name}",
                "ip_address": "Passive Pass-Through",
                "cable_label": "Internal Patch Cross-Connect",
                "cable_type": "Passive Pass-Through",
                "hop_latency_ms": 0.02,
                "cumulative_latency_ms": round(cumulative_latency_ms + 0.02, 2),
                "is_encrypted": True,
                "mtu": current_iface.mtu,
                "action": "PASS_THROUGH",
                "notes": f"Cross-connected internally on {device.name}",
            })
            cumulative_latency_ms += 0.02
            current_iface = counterpart
            hop_index += 1
            continue

        # Find connected cable connected to this interface
        cable = CableLink.objects.filter(
            tenant_id=tenant_id
        ).filter(
            models.Q(termination_a=current_iface) | models.Q(termination_b=current_iface)
        ).select_related("termination_a__device", "termination_b__device").first()

        if not cable:
            traversal_status = "DISCONNECTED"
            termination_reason = f"No connected cable found leaving {device.name}:{current_iface.name}."
            hops.append({
                "hop_number": hop_index,
                "device_name": device.name,
                "device_role": device.role,
                "interface_name": current_iface.name,
                "ip_address": current_iface.ip_address or device.primary_ip or "N/A",
                "cable_label": "UNTERMINATED",
                "cable_type": "Disconnected",
                "hop_latency_ms": 0.0,
                "cumulative_latency_ms": round(cumulative_latency_ms, 2),
                "is_encrypted": False,
                "mtu": current_iface.mtu,
                "action": "UNCONNECTED_PORT",
                "notes": termination_reason,
            })
            break

        if cable.status == "SEVERED":
            traversal_status = "SEVERED_CABLE"
            termination_reason = f"Cable {cable.label} is SEVERED/CUT. Physical signal interrupted."
            hops.append({
                "hop_number": hop_index,
                "device_name": device.name,
                "device_role": device.role,
                "interface_name": current_iface.name,
                "ip_address": current_iface.ip_address or device.primary_ip or "N/A",
                "cable_label": cable.label,
                "cable_type": cable.get_cable_type_display(),
                "hop_latency_ms": 0.0,
                "cumulative_latency_ms": round(cumulative_latency_ms, 2),
                "is_encrypted": cable.is_encrypted,
                "mtu": current_iface.mtu,
                "action": "CABLE_SEVERED",
                "notes": termination_reason,
            })
            break

        # Move across cable to the peer interface
        next_iface = cable.termination_b if cable.termination_a_id == current_iface.id else cable.termination_a
        hop_latency = cable.latency_ms
        if cable.status == "DEGRADED":
            hop_latency *= 4.5  # High jitter / degradation simulation

        cumulative_latency_ms += hop_latency
        if not cable.is_encrypted:
            unencrypted_hops += 1

        hops.append({
            "hop_number": hop_index,
            "device_name": device.name,
            "device_role": device.role,
            "interface_name": current_iface.name,
            "ip_address": current_iface.ip_address or device.primary_ip or "N/A",
            "cable_label": cable.label,
            "cable_type": cable.get_cable_type_display(),
            "bandwidth_gbps": cable.bandwidth_gbps,
            "hop_latency_ms": round(hop_latency, 2),
            "cumulative_latency_ms": round(cumulative_latency_ms, 2),
            "is_encrypted": cable.is_encrypted,
            "mtu": current_iface.mtu,
            "mtu_issue": mtu_issue,
            "action": device_inspection,
            "notes": device_note if device_note != "Interface forwarded frame" else f"Traversed {cable.label} ({cable.get_cable_type_display()}) to {next_iface.device.name}",
        })

        if str(next_iface.id) in visited_interfaces:
            traversal_status = "ROUTING_LOOP"
            termination_reason = f"Routing loop detected returning to {next_iface.device.name}:{next_iface.name}."
            break

        current_iface = next_iface
        hop_index += 1

    if hop_index > MAX_HOPS and traversal_status == "DELIVERED":
        traversal_status = "HOP_LIMIT_EXCEEDED"
        termination_reason = f"Exceeded maximum hop limit ({MAX_HOPS} hops)."

    # Security & Compliance rating
    compliance_score = "COMPLIANT"
    if unencrypted_hops > 0:
        compliance_score = "WARNING_UNENCRYPTED_TRANSIT"
    if traversal_status in ("BLOCKED_FIREWALL", "SEVERED_CABLE", "DROPPED"):
        compliance_score = "FAILED_DELIVERY"

    return {
        "status": traversal_status,
        "termination_reason": termination_reason,
        "source": {
            "device": source_iface.device.name,
            "role": source_iface.device.role,
            "interface": source_iface.name,
            "ip": source_iface.ip_address or source_iface.device.primary_ip,
        },
        "destination": {
            "device": dest_iface.device.name,
            "role": dest_iface.device.role,
            "interface": dest_iface.name,
            "ip": dest_iface.ip_address or dest_iface.device.primary_ip,
        },
        "protocol": protocol,
        "destination_port": destination_port,
        "packet_size_bytes": packet_size_bytes,
        "payload_label": payload_label,
        "total_hops": len(hops),
        "total_latency_ms": round(cumulative_latency_ms, 2),
        "bottleneck_mtu": min_mtu,
        "unencrypted_hops": unencrypted_hops,
        "compliance_score": compliance_score,
        "hops": hops,
    }


def seed_demo_network(tenant) -> Dict[str, Any]:
    """
    Creates a rich NetBox-style enterprise data center & AI cloud network topology.
    Includes edge routers, WAF firewalls, patch panel cross-connects, core switches,
    Kubernetes AI gateways, DGX inference hosts, and vector databases.
    """
    # 1. Clear existing network nodes for this tenant
    CableLink.objects.filter(tenant=tenant).delete()
    PacketInspectionRule.objects.filter(tenant=tenant).delete()
    DeviceInterface.objects.filter(tenant=tenant).delete()
    NetworkDevice.objects.filter(tenant=tenant).delete()

    # 2. Create Devices
    edge_router = NetworkDevice.objects.create(
        tenant=tenant,
        name="edge-rt01.reskure.net",
        role="EDGE_ROUTER",
        status="ACTIVE",
        primary_ip="198.51.100.1",
        site_location="Ashburn DC-1",
        rack_unit="Rack R01, U40-U42",
        vendor_model="Cisco ASR 9904",
        metadata={"asn": "AS64512", "bgp_neighbors": 4},
    )

    perimeter_waf = NetworkDevice.objects.create(
        tenant=tenant,
        name="sec-fw01.reskure.net",
        role="FIREWALL_WAF",
        status="ACTIVE",
        primary_ip="10.100.0.1",
        site_location="Ashburn DC-1",
        rack_unit="Rack R01, U36-U38",
        vendor_model="Palo Alto Networks PA-5260",
        metadata={"threat_prevention": "Enabled", "active_sessions": 48210},
    )

    core_switch = NetworkDevice.objects.create(
        tenant=tenant,
        name="core-sw01.reskure.net",
        role="CORE_SWITCH",
        status="ACTIVE",
        primary_ip="10.100.10.1",
        site_location="Ashburn DC-1",
        rack_unit="Rack R02, U20-U22",
        vendor_model="Arista DCS-7050X3-48YC8",
        metadata={"spine_leaf": "Spine", "vlan_count": 24},
    )

    patch_panel = NetworkDevice.objects.create(
        tenant=tenant,
        name="patch-pp01.reskure.net",
        role="PATCH_PANEL",
        status="ACTIVE",
        primary_ip=None,
        site_location="Ashburn DC-1",
        rack_unit="Rack R02, U10",
        vendor_model="Corning 24-Port High-Density Fiber Enclosure",
        metadata={"structured_cabling": True, "connector": "LC Duplex / MPO-12"},
    )

    tor_switch = NetworkDevice.objects.create(
        tenant=tenant,
        name="tor-sw03.reskure.net",
        role="TOR_SWITCH",
        status="ACTIVE",
        primary_ip="10.100.20.1",
        site_location="Ashburn DC-1",
        rack_unit="Rack R03, U44",
        vendor_model="Cisco Nexus 93180YC-FX",
        metadata={"leaf_id": "Leaf-03", "vxlan_enabled": True},
    )

    ai_gateway = NetworkDevice.objects.create(
        tenant=tenant,
        name="ai-ingress-gw01.reskure.net",
        role="LOAD_BALANCER",
        status="ACTIVE",
        primary_ip="10.100.30.50",
        site_location="Ashburn DC-1",
        rack_unit="Rack R03, U30-U32",
        vendor_model="F5 BIG-IP / Envoy Ingress Mesh",
        metadata={"proxy_protocol": "HTTP/2, gRPC", "rate_limit_rps": 50000},
    )

    dgx_inference = NetworkDevice.objects.create(
        tenant=tenant,
        name="dgx-infer-01.reskure.net",
        role="COMPUTE_HOST",
        status="ACTIVE",
        primary_ip="10.100.40.10",
        site_location="Ashburn DC-1",
        rack_unit="Rack R03, U12-U18",
        vendor_model="NVIDIA DGX H100 (8x H100 80GB SXM5)",
        metadata={"accelerator": "8x H100 GPU", "model_hosted": "HireLens-Risk-Classifier-v2"},
    )

    vector_db = NetworkDevice.objects.create(
        tenant=tenant,
        name="vectordb-cl01.reskure.net",
        role="DATABASE_HOST",
        status="ACTIVE",
        primary_ip="10.100.50.25",
        site_location="Ashburn DC-1",
        rack_unit="Rack R04, U24-U26",
        vendor_model="Pure Storage FlashBlade // Supermicro NVMe",
        metadata={"engine": "Qdrant / PostgreSQL pgvector", "encryption": "AES-256-XTS"},
    )

    # 3. Create Interfaces
    # Edge Router Interfaces
    er_wan = DeviceInterface.objects.create(
        tenant=tenant, device=edge_router, name="HundredGigE0/0/0/0",
        interface_type="100G_QSFP28", ip_address="198.51.100.1", mtu=9000
    )
    er_lan = DeviceInterface.objects.create(
        tenant=tenant, device=edge_router, name="TenGigE0/0/0/1",
        interface_type="10G_SFP_PLUS", ip_address="10.100.0.2", mtu=1500
    )

    # Perimeter WAF Interfaces
    waf_ingress = DeviceInterface.objects.create(
        tenant=tenant, device=perimeter_waf, name="ethernet1/1 (WAN)",
        interface_type="10G_SFP_PLUS", ip_address="10.100.0.1", mtu=1500
    )
    waf_egress = DeviceInterface.objects.create(
        tenant=tenant, device=perimeter_waf, name="ethernet1/2 (LAN)",
        interface_type="10G_SFP_PLUS", ip_address="10.100.10.2", mtu=1500
    )

    # Core Switch Interfaces
    core_p1 = DeviceInterface.objects.create(
        tenant=tenant, device=core_switch, name="Ethernet1/1",
        interface_type="10G_SFP_PLUS", ip_address="10.100.10.1", mtu=1500
    )
    core_p2 = DeviceInterface.objects.create(
        tenant=tenant, device=core_switch, name="Ethernet1/24",
        interface_type="25G_SFP28", ip_address=None, mtu=9000
    )

    # Patch Panel Pass-Through Ports (Front Port 01 <-> Rear Port 01)
    pp_rear = DeviceInterface.objects.create(
        tenant=tenant, device=patch_panel, name="Rear Port 01 (MPO Trunk)",
        interface_type="PASS_THROUGH", is_pass_through=True, mtu=9000
    )
    pp_front = DeviceInterface.objects.create(
        tenant=tenant, device=patch_panel, name="Front Port 01 (LC Cross-Connect)",
        interface_type="PASS_THROUGH", is_pass_through=True,
        pass_through_counterpart=pp_rear, mtu=9000
    )
    pp_rear.pass_through_counterpart = pp_front
    pp_rear.save()

    # ToR Switch Interfaces
    tor_uplink = DeviceInterface.objects.create(
        tenant=tenant, device=tor_switch, name="Port-Channel 1 (Uplink)",
        interface_type="25G_SFP28", ip_address="10.100.20.1", mtu=9000
    )
    tor_p1 = DeviceInterface.objects.create(
        tenant=tenant, device=tor_switch, name="Ethernet1/10",
        interface_type="10G_SFP_PLUS", ip_address=None, mtu=1500
    )
    tor_p2 = DeviceInterface.objects.create(
        tenant=tenant, device=tor_switch, name="Ethernet1/15",
        interface_type="100G_QSFP28", ip_address=None, mtu=9000
    )

    # AI Ingress Gateway Interfaces
    gw_eth0 = DeviceInterface.objects.create(
        tenant=tenant, device=ai_gateway, name="eth0 (Ingress VIP)",
        interface_type="10G_SFP_PLUS", ip_address="10.100.30.50", mtu=1500
    )
    gw_eth1 = DeviceInterface.objects.create(
        tenant=tenant, device=ai_gateway, name="eth1 (Service Mesh)",
        interface_type="10G_SFP_PLUS", ip_address="10.100.30.51", mtu=1500
    )

    # DGX Inference Node Interfaces
    dgx_net0 = DeviceInterface.objects.create(
        tenant=tenant, device=dgx_inference, name="net0 (Inference Cluster API)",
        interface_type="100G_QSFP28", ip_address="10.100.40.10", mtu=9000
    )
    dgx_storage0 = DeviceInterface.objects.create(
        tenant=tenant, device=dgx_inference, name="ib0 (InfiniBand/Storage)",
        interface_type="100G_QSFP28", ip_address="10.100.40.11", mtu=9000
    )

    # Vector DB Interfaces
    vdb_eth0 = DeviceInterface.objects.create(
        tenant=tenant, device=vector_db, name="bond0 (Database Cluster)",
        interface_type="25G_SFP28", ip_address="10.100.50.25", mtu=9000
    )

    # 4. Connect Physical & Logical Cables (NetBox Cable Links)
    # Cable 1: Edge Router -> Perimeter WAF
    CableLink.objects.create(
        tenant=tenant,
        label="CBL-WAN-001",
        termination_a=er_lan,
        termination_b=waf_ingress,
        cable_type="FIBER_SMF",
        status="CONNECTED",
        length_meters=15.0,
        latency_ms=0.18,
        bandwidth_gbps=10.0,
        is_encrypted=True,
    )

    # Cable 2: Perimeter WAF -> Core Switch
    CableLink.objects.create(
        tenant=tenant,
        label="CBL-SEC-002",
        termination_a=waf_egress,
        termination_b=core_p1,
        cable_type="FIBER_SMF",
        status="CONNECTED",
        length_meters=25.0,
        latency_ms=0.22,
        bandwidth_gbps=10.0,
        is_encrypted=True,
    )

    # Cable 3: Core Switch -> Patch Panel Rear Port (Inter-Rack Trunk)
    CableLink.objects.create(
        tenant=tenant,
        label="TRK-MPO-003",
        termination_a=core_p2,
        termination_b=pp_rear,
        cable_type="FIBER_MMF",
        status="CONNECTED",
        length_meters=45.0,
        latency_ms=0.35,
        bandwidth_gbps=25.0,
        is_encrypted=True,
    )

    # Cable 4: Patch Panel Front Port -> ToR Switch
    CableLink.objects.create(
        tenant=tenant,
        label="CBL-CROSS-004",
        termination_a=pp_front,
        termination_b=tor_uplink,
        cable_type="FIBER_MMF",
        status="CONNECTED",
        length_meters=2.5,
        latency_ms=0.08,
        bandwidth_gbps=25.0,
        is_encrypted=True,
    )

    # Cable 5: ToR Switch -> AI Ingress Gateway
    CableLink.objects.create(
        tenant=tenant,
        label="CBL-GW-005",
        termination_a=tor_p1,
        termination_b=gw_eth0,
        cable_type="CAT6A",
        status="CONNECTED",
        length_meters=3.0,
        latency_ms=0.12,
        bandwidth_gbps=10.0,
        is_encrypted=True,
    )

    # Cable 6: AI Ingress Gateway -> DGX Inference Host
    CableLink.objects.create(
        tenant=tenant,
        label="CBL-GPU-006",
        termination_a=gw_eth1,
        termination_b=dgx_net0,
        cable_type="DAC_TWINAX",
        status="CONNECTED",
        length_meters=2.0,
        latency_ms=0.05,
        bandwidth_gbps=100.0,
        is_encrypted=True,
    )

    # Cable 7: DGX Inference Host -> Vector DB Storage
    CableLink.objects.create(
        tenant=tenant,
        label="CBL-VDB-007",
        termination_a=dgx_storage0,
        termination_b=vdb_eth0,
        cable_type="FIBER_SMF",
        status="CONNECTED",
        length_meters=18.0,
        latency_ms=0.15,
        bandwidth_gbps=25.0,
        is_encrypted=True,
    )

    # 5. Create Inspection & Firewall Rules
    PacketInspectionRule.objects.create(
        tenant=tenant,
        device=perimeter_waf,
        priority=10,
        action="INSPECT_PASS",
        protocol="HTTPS",
        destination_port="443",
        rule_name="WAF-HTTPS-DEEP-INSPECTION",
        notes="TLS 1.3 termination, OWASP Top 10 payload validation & Bot filtering",
    )

    PacketInspectionRule.objects.create(
        tenant=tenant,
        device=perimeter_waf,
        priority=20,
        action="INSPECT_PASS",
        protocol="GRPC",
        destination_port="8000-9000",
        rule_name="PERMIT-AI-INFERENCE-GRPC",
        notes="Protobuf schema verification and API token authentication",
    )

    PacketInspectionRule.objects.create(
        tenant=tenant,
        device=perimeter_waf,
        priority=999,
        action="DENY_DROP",
        protocol="ANY",
        destination_port="23,3389",
        rule_name="DROP-LEGACY-UNENCRYPTED",
        notes="Telnet and exposed RDP explicitly forbidden under Zero-Trust policy",
    )

    return {
        "devices_count": 8,
        "interfaces_count": 14,
        "cables_count": 7,
        "rules_count": 3,
        "source_interface_id": str(er_wan.id),
        "inference_interface_id": str(dgx_net0.id),
        "db_interface_id": str(vdb_eth0.id),
    }
