import logging
from typing import Any, Dict, Iterable, List, Optional

from django.core.exceptions import ValidationError
from django.db.models import Q

from apps.network.models import NetworkDevice, DeviceInterface, CableLink, PacketInspectionRule

logger = logging.getLogger(__name__)

MAX_HOPS = 25


def port_matches(rule_port: str, port: str) -> bool:
    """Match a packet port against a rule: "*", "443", "23,3389", "8000-9000" or a mix like "22,8000-9000"."""
    rule_port = (rule_port or "").strip()
    if rule_port in ("", "*"):
        return True
    try:
        wanted = int(str(port).strip())
    except (TypeError, ValueError):
        return False
    for part in rule_port.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if "-" in part:
                low, high = (int(x) for x in part.split("-", 1))
                if low <= wanted <= high:
                    return True
            elif int(part) == wanted:
                return True
        except ValueError:
            continue
    return False


def _build_graph(tenant_id: str):
    """Ports are nodes. Edges: cables, passive pass-through pairs, and forwarding between ports of one device."""
    interfaces = {
        str(i.id): i
        for i in DeviceInterface.objects.select_related("device", "pass_through_counterpart").filter(tenant_id=tenant_id)
    }
    cables = list(
        CableLink.objects.filter(tenant_id=tenant_id).select_related("termination_a__device", "termination_b__device")
    )
    adjacency: Dict[str, List[tuple]] = {key: [] for key in interfaces}
    for cable in cables:
        a, b = str(cable.termination_a_id), str(cable.termination_b_id)
        if a in adjacency and b in adjacency:
            adjacency[a].append((b, "cable", cable))
            adjacency[b].append((a, "cable", cable))
    by_device: Dict[str, List[str]] = {}
    for key, iface in interfaces.items():
        by_device.setdefault(str(iface.device_id), []).append(key)
        if iface.is_pass_through and iface.pass_through_counterpart_id:
            other = str(iface.pass_through_counterpart_id)
            if other in adjacency:
                adjacency[key].append((other, "pass", None))
    for keys in by_device.values():
        for a in keys:
            for b in keys:
                if a == b:
                    continue
                ia, ib = interfaces[a], interfaces[b]
                if ia.is_pass_through or ib.is_pass_through:
                    continue  # passive ports only connect to their counterpart
                adjacency[a].append((b, "internal", None))
    return interfaces, adjacency


def _find_route(adjacency, src: str, dst: str, blocked_cables: set):
    """Shortest route as a list of (from_port, to_port, kind, cable). None if there is no route."""
    from collections import deque

    previous = {src: None}
    queue = deque([src])
    while queue:
        node = queue.popleft()
        if node == dst:
            break
        for nxt, kind, cable in adjacency.get(node, []):
            if nxt in previous:
                continue
            if kind == "cable" and cable.id in blocked_cables:
                continue
            previous[nxt] = (node, kind, cable)
            queue.append(nxt)
    if dst not in previous:
        return None
    route = []
    node = dst
    while previous[node] is not None:
        prev, kind, cable = previous[node]
        route.append((prev, node, kind, cable))
        node = prev
    route.reverse()
    return route


def trace_packet_path(
    tenant_id: str,
    source_interface_id: str,
    destination_interface_id: str,
    protocol: str = "HTTPS",
    destination_port: str = "443",
    packet_size_bytes: int = 1420,
    payload_label: str = "Customer Data Ingestion / Inference Request",
    assume_severed_cables: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    """
    Trace the physical and logical route of a packet between two ports.

    The route is found first (shortest path over cables, passive cross-connects and forwarding inside
    devices). It is then walked hop by hop, checking device status, firewall rules, the cable, MTU and
    encryption. Cables listed in `assume_severed_cables` (ids or labels) are treated as cut for this
    trace only; nothing is saved.
    """
    assumed_cut = {str(c) for c in (assume_severed_cables or [])}
    try:
        source_iface = DeviceInterface.objects.select_related("device").get(id=source_interface_id, tenant_id=tenant_id)
        dest_iface = DeviceInterface.objects.select_related("device").get(id=destination_interface_id, tenant_id=tenant_id)
    except (DeviceInterface.DoesNotExist, ValidationError, ValueError):
        return {"status": "ERROR", "message": "Source or destination network interface not found.", "hops": []}

    interfaces, adjacency = _build_graph(tenant_id)
    src_key, dst_key = str(source_iface.id), str(dest_iface.id)

    def is_cut(cable) -> bool:
        return cable.status == "SEVERED" or str(cable.id) in assumed_cut or cable.label in assumed_cut

    cut_ids = {c.id for edges in adjacency.values() for (_, kind, c) in edges if kind == "cable" and is_cut(c)}
    route = _find_route(adjacency, src_key, dst_key, cut_ids)
    if route is None:
        # No working route: find the physical one so we can say where it breaks.
        route = _find_route(adjacency, src_key, dst_key, set())

    def endpoint(iface) -> Dict[str, Any]:
        return {"device": iface.device.name, "role": iface.device.role, "interface": iface.name,
                "ip": iface.ip_address or iface.device.primary_ip}

    def finish(status: str, reason: str, hops: List[Dict[str, Any]], latency: float, min_mtu: int, unencrypted: int):
        compliance = "COMPLIANT"
        if unencrypted > 0:
            compliance = "WARNING_UNENCRYPTED_TRANSIT"
        if status in ("BLOCKED_FIREWALL", "SEVERED_CABLE", "DROPPED", "DISCONNECTED", "HOP_LIMIT_EXCEEDED"):
            compliance = "FAILED_DELIVERY"
        return {
            "status": status, "termination_reason": reason, "source": endpoint(source_iface),
            "destination": endpoint(dest_iface), "protocol": protocol, "destination_port": destination_port,
            "packet_size_bytes": packet_size_bytes, "payload_label": payload_label, "total_hops": len(hops),
            "total_latency_ms": round(latency, 2), "bottleneck_mtu": min_mtu, "unencrypted_hops": unencrypted,
            "compliance_score": compliance, "hops": hops,
        }

    if route is None:
        hop = {
            "hop_number": 1, "device_name": source_iface.device.name, "device_role": source_iface.device.role,
            "interface_name": source_iface.name, "ip_address": source_iface.ip_address or source_iface.device.primary_ip or "N/A",
            "cable_label": "UNTERMINATED", "cable_type": "Disconnected", "hop_latency_ms": 0.0, "cumulative_latency_ms": 0.0,
            "is_encrypted": False, "mtu": source_iface.mtu, "action": "UNCONNECTED_PORT",
            "notes": f"No cabled path exists from {source_iface.device.name} to {dest_iface.device.name}.",
        }
        return finish("DISCONNECTED", hop["notes"], [hop], 0.0, source_iface.mtu, 0)

    # Group the route into device visits: arrive on one port, forward internally, leave on a cable (or finish).
    visits: List[Dict[str, Any]] = []
    current = {"ingress": interfaces[src_key], "egress": interfaces[src_key], "passive": False, "cable": None, "next": None}
    for from_key, to_key, kind, cable in route:
        to_iface = interfaces[to_key]
        if kind == "cable":
            current["cable"], current["next"] = cable, to_iface
            visits.append(current)
            current = {"ingress": to_iface, "egress": to_iface, "passive": False, "cable": None, "next": None}
        else:
            current["egress"] = to_iface
            current["passive"] = current["passive"] or kind == "pass"
    visits.append(current)

    hops: List[Dict[str, Any]] = []
    latency, unencrypted = 0.0, 0
    min_mtu = min(source_iface.mtu, dest_iface.mtu)
    status, reason = "DELIVERED", "Packet successfully reached destination interface."

    def base_hop(n: int, visit: Dict[str, Any]) -> Dict[str, Any]:
        ingress, egress = visit["ingress"], visit["egress"]
        name = ingress.name if ingress.id == egress.id else f"{ingress.name} ➔ {egress.name}"
        return {
            "hop_number": n, "device_name": ingress.device.name, "device_role": ingress.device.role, "interface_name": name,
            "ip_address": "Passive Pass-Through" if visit["passive"] else (ingress.ip_address or ingress.device.primary_ip or "N/A"),
            "mtu": min(ingress.mtu, egress.mtu),
        }

    for index, visit in enumerate(visits, start=1):
        if index > MAX_HOPS:
            status, reason = "HOP_LIMIT_EXCEEDED", f"Exceeded maximum hop limit ({MAX_HOPS} hops)."
            break
        device = visit["ingress"].device
        hop = base_hop(index, visit)
        min_mtu = min(min_mtu, hop["mtu"])

        if device.status == "OFFLINE":
            status, reason = "DROPPED", f"Device '{device.name}' is OFFLINE. Packet dropped."
            hops.append({**hop, "cable_label": "None", "cable_type": "Internal", "hop_latency_ms": 0.0,
                         "cumulative_latency_ms": round(latency, 2), "is_encrypted": True, "action": "DROP_OFFLINE", "notes": reason})
            break

        inspection, note = "PERMIT", "Interface forwarded frame"
        blocked = False
        for rule in PacketInspectionRule.objects.filter(tenant_id=tenant_id, device=device).order_by("priority"):
            if rule.protocol in ("ANY", protocol) and port_matches(rule.destination_port, destination_port):
                if rule.action == "DENY_DROP":
                    inspection, blocked = "DENIED", True
                    note = f"Blocked by rule '{rule.rule_name}': {rule.notes or 'Access Forbidden'}"
                    break
                if rule.action == "INSPECT_PASS":
                    inspection, note = "INSPECTED", f"Verified by rule '{rule.rule_name}' (Deep Packet Inspection passed)"
                    break
        if blocked:
            status, reason = "BLOCKED_FIREWALL", f"Security filter on {device.name} dropped packet."
            hops.append({**hop, "cable_label": "None", "cable_type": "Internal", "hop_latency_ms": 0.0,
                         "cumulative_latency_ms": round(latency, 2), "is_encrypted": True, "action": "FIREWALL_DROP", "notes": note})
            break

        cable = visit["cable"]
        if cable is None:  # last visit: the destination
            hops.append({**hop, "cable_label": "Destination Termination", "cable_type": "Endpoint", "hop_latency_ms": 0.05,
                         "cumulative_latency_ms": round(latency + 0.05, 2), "is_encrypted": True, "action": "DELIVERED",
                         "notes": f"Destination socket reached ({payload_label})"})
            latency += 0.05
            break

        if is_cut(cable):
            assumed = cable.status != "SEVERED"
            status = "SEVERED_CABLE"
            reason = (f"Cable {cable.label} is assumed cut for this what-if trace. No data was changed."
                      if assumed else f"Cable {cable.label} is SEVERED/CUT. Physical signal interrupted.")
            hops.append({**hop, "cable_label": f"{cable.label} [{'ASSUMED CUT' if assumed else 'SEVERED'}]",
                         "cable_type": cable.get_cable_type_display(), "hop_latency_ms": 0.0, "cumulative_latency_ms": round(latency, 2),
                         "is_encrypted": cable.is_encrypted, "action": "CABLE_SEVERED", "notes": reason})
            break

        mtu_issue = None
        if packet_size_bytes > hop["mtu"]:
            mtu_issue = f"Packet size ({packet_size_bytes}B) exceeds MTU ({hop['mtu']}B) - fragmented"
        hop_latency = cable.latency_ms * (4.5 if cable.status == "DEGRADED" else 1.0)
        latency += hop_latency
        if not cable.is_encrypted:
            unencrypted += 1
        if visit["passive"]:
            note = f"Cross-connected internally on {device.name}"
        elif note == "Interface forwarded frame":
            note = f"Traversed {cable.label} ({cable.get_cable_type_display()}) to {visit['next'].device.name}"
        hops.append({
            **hop, "cable_label": cable.label, "cable_type": cable.get_cable_type_display(), "bandwidth_gbps": cable.bandwidth_gbps,
            "hop_latency_ms": round(hop_latency, 2), "cumulative_latency_ms": round(latency, 2), "is_encrypted": cable.is_encrypted,
            "mtu_issue": mtu_issue, "action": "PASS_THROUGH" if visit["passive"] else inspection, "notes": note,
        })

    return finish(status, reason, hops, latency, min_mtu, unencrypted)

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
