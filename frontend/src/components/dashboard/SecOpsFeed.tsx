"use client";

import { useState } from "react";
import { Radio, AlertOctagon, ShieldX, Check, Lock, ArrowRight, Zap } from "lucide-react";
import { SecurityAlert } from "@/lib/types";

export function SecOpsFeed({ alerts }: { alerts: SecurityAlert[] }) {
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);
  const [actionType, setActionType] = useState("ISOLATE_HOST");
  const [autoApprove, setAutoApprove] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const handleContainmentSubmit = () => {
    if (!selectedAlert) return;
    setSubmittedMessage(
      autoApprove
        ? `[OK] Containment '${actionType}' automatically approved and dispatched.`
        : `[OK] Approval request generated for '${actionType}'. Routed to Compliance Lead.`
    );
    setTimeout(() => {
      setSelectedAlert(null);
      setSubmittedMessage(null);
    }, 2800);
  };

  return (
    <div className="glass-panel p-6 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            Unified SecOps Ingestion & Threat Feed
          </h2>
          <p className="text-xs text-slate-400">
            Pre-processed alerts from AWS, Azure, GCP, and Wazuh SIEM.
          </p>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
          Integration-First • Zero Log Bloat
        </span>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => {
          const isCritical = alert.severity === "CRITICAL";
          return (
            <div
              key={alert.id}
              className="p-3.5 rounded-xl bg-slate-900/70 border border-white/5 hover:border-cyan-500/30 transition-all flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isCritical
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                      : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                  }`}
                >
                  <AlertOctagon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-100">{alert.title}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        isCritical ? "bg-rose-500/20 text-rose-300" : "bg-orange-500/20 text-orange-300"
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-1">{alert.description}</p>
                  <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-3">
                    <span>Source: {alert.source_name}</span>
                    <span>•</span>
                    <span>{new Date(alert.ingested_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedAlert(alert)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ShieldX className="w-3.5 h-3.5" />
                <span>Contain</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Containment Action Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b1329] border border-cyan-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <ShieldX className="w-4 h-4 text-cyan-400" />
                Execute Containment Action
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            {submittedMessage ? (
              <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium text-center">
                {submittedMessage}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-slate-400">Target Alert:</div>
                  <div className="text-xs font-bold text-slate-200 mt-0.5">{selectedAlert.title}</div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Remediation Runbook:
                  </label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ISOLATE_HOST">Isolate Compute Host from VPC Network</option>
                    <option value="REVOKE_CREDENTIALS">Revoke IAM Security Credentials & Session</option>
                    <option value="BLOCK_IP">Block Malicious IP at Edge WAF / Security Group</option>
                    <option value="QUARANTINE_FILE">Quarantine Suspicious Artifact</option>
                  </select>
                </div>

                {/* Auto-Approval Toggle */}
                <div className="p-3 rounded-lg bg-slate-900/60 border border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      Auto-Approve Action
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {autoApprove ? "Dispatches immediately without human sign-off" : "Default: Requires human security lead sign-off"}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoApprove}
                    onChange={(e) => setAutoApprove(e.target.checked)}
                    className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setSelectedAlert(null)}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleContainmentSubmit}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 flex items-center gap-1.5"
                  >
                    <span>{autoApprove ? "Authorize & Dispatch" : "Submit for Approval"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
