import time
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.ai_audit.models import AuditRun
from apps.ai_audit.services import runner


def claim_next_run():
    """Atomically move one queued run to running. Returns the run id or None."""
    for run_id in AuditRun.all_objects.filter(status="queued").order_by("created_at").values_list("id", flat=True)[:5]:
        claimed = AuditRun.all_objects.filter(id=run_id, status="queued").update(
            status="running", started_at=timezone.now(), heartbeat_at=timezone.now(), progress=1, progress_message="Starting"
        )
        if claimed:
            return run_id
    return None


def fail_stale_runs() -> int:
    """A run whose worker died stops heartbeating; mark it failed rather than leaving it 'running' forever."""
    limit = timezone.now() - timedelta(seconds=settings.AUDIT_RUN_TIMEOUT_SECONDS + 120)
    return AuditRun.all_objects.filter(status="running", heartbeat_at__lt=limit).update(
        status="failed", error="The worker stopped responding. Start the run again.", finished_at=timezone.now()
    )


class Command(BaseCommand):
    help = "Polls for queued audit runs and executes them one at a time."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Process queued runs, then exit.")
        parser.add_argument("--interval", type=float, default=2.0, help="Seconds between polls.")

    def handle(self, *args, **options):
        self.stdout.write("Audit worker started. Press Ctrl+C to stop.")
        try:
            while True:
                fail_stale_runs()
                run_id = claim_next_run()
                if run_id:
                    self.stdout.write(f"Running audit {run_id}")
                    runner.execute(run_id)
                    status = AuditRun.all_objects.get(id=run_id).status
                    self.stdout.write(f"Audit {run_id} finished: {status}")
                    continue
                if options["once"]:
                    break
                time.sleep(options["interval"])
        except KeyboardInterrupt:
            self.stdout.write("Worker stopped.")
