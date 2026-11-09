"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const navigation = [
  { name: "Dashboard", icon: "▦" },
  { name: "Shipments", icon: "▤" },
  { name: "Decisions", icon: "⇄" },
  { name: "Outcomes", icon: "◷" },
  { name: "Decision ROI", icon: "₹" },
];

type Shipment = {
  shipment_id?: string | number;
  supplier?: string;
  route?: string;
  order_qty?: number;
  planned_lead_days?: number;
  supplier_reliability?: number;
  port_congestion?: number;
  weather_risk?: number;
  delay_days?: number;
  is_delayed?: boolean | number | string;
};

type Decision = {
  id?: number;
  shipment_id?: number;
  option?: string;
  predicted_cost?: number;
  created_at?: string;
};

type Outcome = {
  id?: number;
  decision_id?: number;
  actual_cost?: number | null;
  actual_delay_days?: number | null;
  recorded_at?: string;
};

type RiskAssessment = {
  shipment_id: number;
  supplier: string;
  route: string;
  planned_lead_days: number;
  risk_score: number;
  risk_level: "Low" | "Medium" | "High";
  delay_probability: number;
  predicted_delay_days: number;
  historical_delay_days: number;
  historically_delayed: boolean;
  method: string;
};

type PrescriptionOption = {
  option: "A" | "B" | "C";
  name: string;
  est_cost: number;
  days_saved: number;
  risk: number;
  residual_delay_days: number;
  fraction_used: number;
  total_cost: number;
};

type PrescriptionResult = {
  shipment_id: number;
  supplier?: string;
  route?: string;
  budget: number;
  prediction: {
    delay_probability: number;
    predicted_delay_days: number;
  };
  recommendation: PrescriptionOption;
  options?: PrescriptionOption[];
  all_options?: PrescriptionOption[];
  message: string;
};

type OptionEvaluation = {
  decisions: number;
  avg_predicted_cost: number;
  avg_actual_cost: number;
  mean_pct_error: number;
  mean_abs_error_usd: number;
  success_rate: number;
  old_weight: number;
  new_weight: number;
};

type EvaluationReport = {
  total_decisions: number;
  overall_abs_pct_error: number;
  overall_success_rate: number;
  needs_retrain: boolean;
  per_option: Record<string, OptionEvaluation>;
};

type EvaluationResponse = {
  message?: string;
  report?: EvaluationReport | null;
};

const chartColors = ["#2563eb", "#f59e0b"];

function isDelayed(shipment: Shipment): boolean {
  const status = shipment.is_delayed;

  return (
    status === true ||
    status === 1 ||
    (typeof status === "string" &&
      ["true", "1", "yes"].includes(status.toLowerCase())) ||
    Number(shipment.delay_days) > 0
  );
}

function formatCost(value?: number | null): string {
  if (value === undefined || value === null) return "—";

  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value?: string): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPercent(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return "—";
  }

  return `${(value * 100).toFixed(2)}%`;
}

function getArray<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const result = record[key] ?? record.data;

    if (Array.isArray(result)) return result as T[];
  }

  return [];
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    Low: "bg-emerald-100 text-emerald-800",
    Medium: "bg-amber-100 text-amber-800",
    High: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        styles[level] || "bg-slate-100 text-slate-700"
      }`}
    >
      {level} Risk
    </span>
  );
}

function StatusBadge({ delayed }: { delayed: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        delayed
          ? "bg-amber-50 text-amber-700"
          : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {delayed ? "Delayed" : "On Track"}
    </span>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full lg:w-72">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        ⌕
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
      />
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="p-12 text-center text-sm text-slate-500">{text}</div>
  );
}

function StatCard({
  title,
  value,
  detail,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: string;
  color: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${color}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-5 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{detail}</p>
    </article>
  );
}

export default function Home() {
  const [activePage, setActivePage] = useState("Dashboard");

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [search, setSearch] = useState("");

  // Shipment selection
  const [selectedShipmentId, setSelectedShipmentId] = useState("");

  // XGBoost risk assessment
  const [riskResult, setRiskResult] =
    useState<RiskAssessment | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState("");

  // Prescriptions
  const [prescription, setPrescription] =
    useState<PrescriptionResult | null>(null);
  const [prescriptionLoading, setPrescriptionLoading] = useState(false);
  const [prescriptionError, setPrescriptionError] = useState("");

  // Decision execution
  const [selectedOption, setSelectedOption] =
    useState<PrescriptionOption | null>(null);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");

  // Outcome form
  const [outcomeDecisionId, setOutcomeDecisionId] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [actualDelayDays, setActualDelayDays] = useState("");
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [outcomeError, setOutcomeError] = useState("");
  const [outcomeMessage, setOutcomeMessage] = useState("");

  // ROI report
  const [evaluationReport, setEvaluationReport] =
    useState<EvaluationReport | null>(null);
  const [roiLoading, setRoiLoading] = useState(false);
  const [roiError, setRoiError] = useState("");
  const [roiMessage, setRoiMessage] = useState("");

  // Load dashboard data
  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setApiError("");

        const [shipmentResponse, decisionResponse, outcomeResponse] =
          await Promise.all([
            fetch(`${API_URL}/shipments`),
            fetch(`${API_URL}/decisions`),
            fetch(`${API_URL}/outcomes`),
          ]);

        if (!shipmentResponse.ok) {
          throw new Error("Unable to load shipment data.");
        }

        const shipmentData: unknown = await shipmentResponse.json();

        const decisionData: unknown = decisionResponse.ok
          ? await decisionResponse.json()
          : [];

        const outcomeData: unknown = outcomeResponse.ok
          ? await outcomeResponse.json()
          : [];

        const shipmentList = getArray<Shipment>(
          shipmentData,
          "shipments"
        );

        const decisionList = getArray<Decision>(
          decisionData,
          "decisions"
        );

        setShipments(shipmentList);
        setDecisions(decisionList);
        setOutcomes(getArray<Outcome>(outcomeData, "outcomes"));

        if (shipmentList.length > 0) {
          setSelectedShipmentId(
            String(shipmentList[0].shipment_id ?? "")
          );
        }

        if (decisionList.length > 0) {
          setOutcomeDecisionId(String(decisionList[0].id ?? ""));
        }
      } catch (error) {
        console.error("Dashboard API error:", error);
        setApiError(
          "Unable to connect to the backend. Check that the FastAPI server is running."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  async function refreshDecisions() {
    const response = await fetch(`${API_URL}/decisions`);

    if (!response.ok) {
      throw new Error("Unable to refresh decisions.");
    }

    const data: unknown = await response.json();
    const list = getArray<Decision>(data, "decisions");

    setDecisions(list);

    if (!outcomeDecisionId && list.length > 0) {
      setOutcomeDecisionId(String(list[0].id ?? ""));
    }
  }

  async function refreshOutcomes() {
    const response = await fetch(`${API_URL}/outcomes`);

    if (!response.ok) {
      throw new Error("Unable to refresh outcomes.");
    }

    const data: unknown = await response.json();
    setOutcomes(getArray<Outcome>(data, "outcomes"));
  }

  // XGBoost risk assessment
  async function assessRisk() {
    if (!selectedShipmentId) {
      setRiskError("Please select a shipment first.");
      return;
    }

    setRiskLoading(true);
    setRiskError("");
    setRiskResult(null);

    try {
      const response = await fetch(
        `${API_URL}/predict/${encodeURIComponent(selectedShipmentId)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to assess shipment risk.");
      }

      setRiskResult(data as RiskAssessment);
    } catch (error) {
      setRiskError(
        error instanceof Error
          ? error.message
          : "Unable to connect to the prediction API."
      );
    } finally {
      setRiskLoading(false);
    }
  }

  // Generate A, B and C recommendations
  async function getRecommendations() {
    if (!selectedShipmentId) {
      setPrescriptionError("Please select a shipment first.");
      return;
    }

    setPrescriptionLoading(true);
    setPrescriptionError("");
    setDecisionMessage("");
    setPrescription(null);
    setSelectedOption(null);

    try {
      const response = await fetch(
        `${API_URL}/prescriptions/${encodeURIComponent(
          selectedShipmentId
        )}?budget=20000`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to generate recommendations."
        );
      }

      const result = data as PrescriptionResult;
      const returnedOptions =
        result.options ?? result.all_options ?? [];

      if (returnedOptions.length === 0) {
        throw new Error("No recommendation options were returned.");
      }

      setPrescription({
        ...result,
        options: returnedOptions,
      });
    } catch (error) {
      setPrescriptionError(
        error instanceof Error
          ? error.message
          : "Unable to connect to prescription API."
      );
    } finally {
      setPrescriptionLoading(false);
    }
  }

  // Save selected option as a decision
  async function executeDecision() {
    if (!prescription || !selectedOption) {
      setPrescriptionError("Please select an option first.");
      return;
    }

    setDecisionSaving(true);
    setPrescriptionError("");
    setDecisionMessage("");

    try {
      const response = await fetch(`${API_URL}/decisions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shipment_id: prescription.shipment_id,
          option: selectedOption.option,
          predicted_cost: selectedOption.est_cost,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to save decision.");
      }

      const savedId = data?.decision?.id;

      setDecisionMessage(
        `Option ${selectedOption.option} saved successfully! Decision ID: ${
          savedId ?? "Saved"
        }`
      );

      await refreshDecisions();

      if (savedId) {
        setOutcomeDecisionId(String(savedId));
      }
    } catch (error) {
      setPrescriptionError(
        error instanceof Error ? error.message : "Unable to save decision."
      );
    } finally {
      setDecisionSaving(false);
    }
  }

  // Submit actual outcome
  async function submitOutcome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setOutcomeError("");
    setOutcomeMessage("");

    const decisionId = Number(outcomeDecisionId);
    const cost = Number(actualCost);
    const delay = Number(actualDelayDays);

    if (!outcomeDecisionId || !Number.isInteger(decisionId)) {
      setOutcomeError("Please select a valid saved decision.");
      return;
    }

    if (actualCost.trim() === "" || !Number.isFinite(cost) || cost < 0) {
      setOutcomeError("Enter a valid actual cost (zero or more).");
      return;
    }

    if (
      actualDelayDays.trim() === "" ||
      !Number.isInteger(delay) ||
      delay < 0
    ) {
      setOutcomeError("Enter a valid actual delay in whole days.");
      return;
    }

    setOutcomeSaving(true);

    try {
      const response = await fetch(`${API_URL}/outcomes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision_id: decisionId,
          actual_cost: cost,
          actual_delay_days: delay,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to save outcome.");
      }

      setOutcomeMessage(
        `Outcome recorded successfully! Outcome ID: ${
          data?.outcome?.id ?? "Saved"
        }`
      );

      setActualCost("");
      setActualDelayDays("");

      await refreshOutcomes();
    } catch (error) {
      setOutcomeError(
        error instanceof Error ? error.message : "Unable to save outcome."
      );
    } finally {
      setOutcomeSaving(false);
    }
  }

  // Load evaluation report
  async function loadEvaluationReport() {
    setRoiLoading(true);
    setRoiError("");
    setRoiMessage("");

    try {
      const response = await fetch(`${API_URL}/evaluation-report`);

      const data: EvaluationResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load evaluation report."
        );
      }

      if (!data.report) {
        setEvaluationReport(null);
        setRoiMessage(
          data.message || "Evaluation report is not available yet."
        );
        return;
      }

      setEvaluationReport(data.report);
      setRoiMessage(data.message || "Evaluation report loaded successfully.");
    } catch (error) {
      setRoiError(
        error instanceof Error
          ? error.message
          : "Unable to connect to evaluation report API."
      );
    } finally {
      setRoiLoading(false);
    }
  }

  // Load ROI report when the ROI page is opened
  useEffect(() => {
    if (activePage === "Decision ROI") {
      loadEvaluationReport();
    }
    // loadEvaluationReport is intentionally triggered on page navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  // Dashboard calculations
  const delayedCount = useMemo(
    () => shipments.filter(isDelayed).length,
    [shipments]
  );

  const onTrackCount = shipments.length - delayedCount;

  const routeData = useMemo(() => {
    const routeCounts: Record<string, number> = {};

    shipments.forEach((shipment) => {
      const route = shipment.route || "Unknown";
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    });

    return Object.entries(routeCounts)
      .map(([route, total]) => ({ route, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [shipments]);

  const statusData = [
    { name: "On Track", value: onTrackCount },
    { name: "Delayed", value: delayedCount },
  ].filter((item) => item.value > 0);

  const filteredShipments = shipments.filter((shipment) =>
    [
      shipment.shipment_id,
      shipment.supplier,
      shipment.route,
      shipment.order_qty,
      shipment.delay_days,
    ].some((value) =>
      String(value ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

  const filteredDecisions = decisions.filter((decision) =>
    [
      decision.id,
      decision.shipment_id,
      decision.option,
      decision.predicted_cost,
    ].some((value) =>
      String(value ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

  const filteredOutcomes = outcomes.filter((outcome) =>
    [
      outcome.id,
      outcome.decision_id,
      outcome.actual_cost,
      outcome.actual_delay_days,
    ].some((value) =>
      String(value ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

  const stats = [
    {
      title: "Total Shipments",
      value: shipments.length,
      detail: "Shipment records from database",
      icon: "▤",
      color: "bg-blue-50 text-blue-600",
    },
    {
      title: "Delayed Shipments",
      value: delayedCount,
      detail: "Shipments with recorded delays",
      icon: "◷",
      color: "bg-amber-50 text-amber-600",
    },
    {
      title: "Decisions Made",
      value: decisions.length,
      detail: "Saved supply chain decisions",
      icon: "⇄",
      color: "bg-violet-50 text-violet-600",
    },
    {
      title: "Recorded Outcomes",
      value: outcomes.length,
      detail: "Recorded actual results",
      icon: "✓",
      color: "bg-emerald-50 text-emerald-600",
    },
  ];

  function openPage(page: string) {
    setActivePage(page);
    setSearch("");
  }

  function handleShipmentChange(value: string) {
    setSelectedShipmentId(value);
    setRiskResult(null);
    setRiskError("");
    setPrescription(null);
    setPrescriptionError("");
    setSelectedOption(null);
    setDecisionMessage("");
  }

  const selectedDecision = decisions.find(
    (decision) => String(decision.id) === outcomeDecisionId
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 md:flex">
      {/* Sidebar */}
      <aside className="flex w-full flex-col border-r border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
        <div className="border-b border-slate-100 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
              SP
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-blue-700">
                Supply Prescript
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Smart Supply Chain
              </p>
            </div>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto p-4 md:flex-col">
          {navigation.map((item) => (
            <button
              key={item.name}
              onClick={() => openPage(item.name)}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                activePage === item.name
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-slate-100 p-6 md:block">
          <p className="text-xs text-slate-400">
            Supply Prescript · Version 1.0
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 p-5 md:p-8 lg:p-10">
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 text-sm text-slate-500">
              Supply Chain / {activePage}
            </p>
            <h2 className="text-3xl font-bold tracking-tight">
              {activePage}
            </h2>
            <p className="mt-2 text-sm text-slate-500 md:text-base">
              Monitor shipments and make smarter supply chain decisions.
            </p>
          </div>

          <div
            className={`flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
              loading
                ? "border-blue-100 bg-blue-50 text-blue-700"
                : apiError
                  ? "border-red-100 bg-red-50 text-red-700"
                  : "border-emerald-100 bg-emerald-50 text-emerald-700"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                loading
                  ? "bg-blue-500"
                  : apiError
                    ? "bg-red-500"
                    : "bg-emerald-500"
              }`}
            />
            {loading
              ? "Connecting..."
              : apiError
                ? "API Offline"
                : "API Connected"}
          </div>
        </header>

        {apiError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {apiError}
          </div>
        )}

        {/* Dashboard */}
        {activePage === "Dashboard" && (
          <>
            <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <StatCard
                  key={stat.title}
                  title={stat.title}
                  value={
                    loading
                      ? "..."
                      : stat.value.toLocaleString("en-IN")
                  }
                  detail={stat.detail}
                  icon={stat.icon}
                  color={stat.color}
                />
              ))}
            </section>

            <section className="mt-7 grid gap-6 xl:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <h3 className="text-lg font-bold">Shipment Status</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Delayed versus on-track shipments
                  </p>
                </div>

                {loading ? (
                  <EmptyMessage text="Loading chart data..." />
                ) : shipments.length === 0 ? (
                  <EmptyMessage text="No shipment data available." />
                ) : (
                  <>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statusData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={65}
                            outerRadius={100}
                            paddingAngle={4}
                          >
                            {statusData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={
                                  entry.name === "On Track"
                                    ? chartColors[0]
                                    : chartColors[1]
                                }
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => [
                              Number(value).toLocaleString("en-IN"),
                              "Shipments",
                            ]}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div className="rounded-xl bg-emerald-50 p-4">
                        <p className="text-sm text-emerald-700">On Track</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-800">
                          {onTrackCount.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="rounded-xl bg-amber-50 p-4">
                        <p className="text-sm text-amber-700">Delayed</p>
                        <p className="mt-1 text-2xl font-bold text-amber-800">
                          {delayedCount.toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <h3 className="text-lg font-bold">Shipments by Route</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Top 8 routes by shipment count
                  </p>
                </div>

                {loading ? (
                  <EmptyMessage text="Loading chart data..." />
                ) : routeData.length === 0 ? (
                  <EmptyMessage text="No route data available." />
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={routeData}
                        margin={{
                          top: 10,
                          right: 10,
                          left: 0,
                          bottom: 5,
                        }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="route"
                          tick={{ fontSize: 12 }}
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                          height={55}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar
                          dataKey="total"
                          name="Shipments"
                          fill="#2563eb"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </article>
            </section>

            <section className="mt-7 grid gap-6 xl:grid-cols-3">
              <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
                <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-6 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-bold">Recent Shipments</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Latest records from your database
                    </p>
                  </div>
                  <button
                    onClick={() => openPage("Shipments")}
                    className="w-fit rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                  >
                    View all →
                  </button>
                </div>

                {loading ? (
                  <EmptyMessage text="Loading shipment data..." />
                ) : shipments.length === 0 ? (
                  <EmptyMessage text="No shipment records available." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-6 py-4">Shipment ID</th>
                          <th className="px-6 py-4">Supplier</th>
                          <th className="px-6 py-4">Route</th>
                          <th className="px-6 py-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {shipments.slice(0, 5).map((shipment, index) => (
                          <tr
                            key={shipment.shipment_id ?? index}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="whitespace-nowrap px-6 py-4 font-medium">
                              {shipment.shipment_id ?? `SHP-${index + 1}`}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                              {shipment.supplier ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                              {shipment.route ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <StatusBadge delayed={isDelayed(shipment)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">Quick Actions</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Explore your supply chain data.
                </p>

                <div className="mt-6 space-y-3">
                  {[
                    {
                      name: "Shipments",
                      description: "Track shipments and assess risk",
                      icon: "▤",
                    },
                    {
                      name: "Decisions",
                      description: "Review saved decisions",
                      icon: "⇄",
                    },
                    {
                      name: "Outcomes",
                      description: "Record actual results",
                      icon: "◷",
                    },
                    {
                      name: "Decision ROI",
                      description: "Review decision performance",
                      icon: "₹",
                    },
                  ].map((item) => (
                    <button
                      key={item.name}
                      onClick={() => openPage(item.name)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-lg text-blue-600">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {item.name}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {item.description}
                        </span>
                      </span>
                      <span className="text-blue-600">→</span>
                    </button>
                  ))}
                </div>
              </article>
            </section>
          </>
        )}

        {/* Shipments */}
        {activePage === "Shipments" && (
          <>
            <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Intelligent Risk Analysis
                </span>
                <h3 className="mt-2 text-xl font-bold">
                  Shipment Risk Assessment
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Select a shipment to assess its delay risk using the
                  trained XGBoost model.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <select
                  value={selectedShipmentId}
                  onChange={(event) =>
                    handleShipmentChange(event.target.value)
                  }
                  disabled={loading || shipments.length === 0}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="">Select a shipment</option>
                  {shipments.map((shipment, index) => (
                    <option
                      key={shipment.shipment_id ?? index}
                      value={String(shipment.shipment_id ?? "")}
                    >
                      Shipment #{shipment.shipment_id ?? index + 1} —{" "}
                      {shipment.supplier ?? "Unknown Supplier"} —{" "}
                      {shipment.route ?? "Unknown Route"}
                    </option>
                  ))}
                </select>

                <button
                  onClick={assessRisk}
                  disabled={riskLoading || !selectedShipmentId}
                  className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {riskLoading ? "Predicting..." : "Assess Risk →"}
                </button>
              </div>

              {riskError && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                  {riskError}
                </div>
              )}

              {riskResult && (
                <div className="mt-6 border-t border-slate-100 pt-6">
                  <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm text-slate-500">
                        XGBoost prediction result
                      </p>
                      <h4 className="mt-1 text-lg font-bold">
                        Shipment #{riskResult.shipment_id}
                      </h4>
                    </div>
                    <RiskBadge level={riskResult.risk_level} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl bg-blue-50 p-5">
                      <p className="text-sm text-blue-700">Risk Score</p>
                      <p className="mt-2 text-3xl font-bold text-blue-800">
                        {riskResult.risk_score}
                        <span className="ml-1 text-base font-medium">
                          /100
                        </span>
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
                        <div
                          className={`h-full rounded-full ${
                            riskResult.risk_level === "High"
                              ? "bg-red-500"
                              : riskResult.risk_level === "Medium"
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                          style={{
                            width: `${Math.min(
                              Math.max(riskResult.risk_score, 0),
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl bg-violet-50 p-5">
                      <p className="text-sm text-violet-700">
                        Delay Probability
                      </p>
                      <p className="mt-2 text-3xl font-bold text-violet-800">
                        {(riskResult.delay_probability * 100).toFixed(1)}%
                      </p>
                    </div>

                    <div className="rounded-xl bg-amber-50 p-5">
                      <p className="text-sm text-amber-700">
                        Predicted Delay
                      </p>
                      <p className="mt-2 text-3xl font-bold text-amber-800">
                        {riskResult.predicted_delay_days} days
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-5">
                      <p className="text-sm text-slate-500">
                        Planned Lead Days
                      </p>
                      <p className="mt-2 text-3xl font-bold">
                        {riskResult.planned_lead_days ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-500">Supplier</p>
                      <p className="mt-2 text-lg font-bold">
                        {riskResult.supplier || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-500">Route</p>
                      <p className="mt-2 text-lg font-bold">
                        {riskResult.route || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-500">
                        Historical Delay
                      </p>
                      <p className="mt-2 text-lg font-bold">
                        {riskResult.historical_delay_days ?? 0} days
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                    Method: {riskResult.method || "XGBoost ML prediction"}
                  </p>
                </div>
              )}
            </section>

            {/* Prescriptive Recommendations */}
            <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                  Prescriptive Analytics
                </span>
                <h3 className="mt-2 text-xl font-bold">
                  Shipment Recommendations
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Generate XGBoost delay predictions and compare the
                  available strategies.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  onClick={getRecommendations}
                  disabled={
                    prescriptionLoading || !selectedShipmentId
                  }
                  className="rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {prescriptionLoading
                    ? "Generating Recommendations..."
                    : "Get Recommendations →"}
                </button>

                {prescription && (
                  <span className="text-sm text-slate-500">
                    Shipment #{prescription.shipment_id}
                  </span>
                )}
              </div>

              {prescriptionError && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                  {prescriptionError}
                </div>
              )}

              {prescription && (
                <div className="mt-7">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl bg-blue-50 p-4">
                      <p className="text-sm text-blue-700">
                        Delay Probability
                      </p>
                      <p className="mt-2 text-2xl font-bold text-blue-800">
                        {(
                          prescription.prediction.delay_probability * 100
                        ).toFixed(1)}
                        %
                      </p>
                    </div>

                    <div className="rounded-xl bg-amber-50 p-4">
                      <p className="text-sm text-amber-700">
                        Predicted Delay
                      </p>
                      <p className="mt-2 text-2xl font-bold text-amber-800">
                        {prescription.prediction.predicted_delay_days} days
                      </p>
                    </div>

                    <div className="rounded-xl bg-violet-50 p-4">
                      <p className="text-sm text-violet-700">
                        Available Budget
                      </p>
                      <p className="mt-2 text-2xl font-bold text-violet-800">
                        {formatCost(prescription.budget)}
                      </p>
                    </div>
                  </div>

                  <div className="mb-5 mt-7">
                    <h4 className="text-lg font-bold">Compare Strategies</h4>
                    <p className="mt-1 text-sm text-slate-500">
                      Select one option to execute the decision.
                    </p>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-3">
                    {(prescription.options ?? []).map((option) => {
                      const isSelected =
                        selectedOption?.option === option.option;

                      const isRecommended =
                        prescription.recommendation.option ===
                        option.option;

                      return (
                        <button
                          type="button"
                          key={option.option}
                          onClick={() => {
                            setSelectedOption(option);
                            setDecisionMessage("");
                            setPrescriptionError("");
                          }}
                          className={`relative rounded-2xl border-2 p-5 text-left transition hover:-translate-y-1 hover:shadow-md ${
                            isSelected
                              ? "border-blue-600 bg-blue-50 shadow-md"
                              : "border-slate-200 bg-white hover:border-blue-300"
                          }`}
                        >
                          {isRecommended && (
                            <span className="mb-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Best Recommendation
                            </span>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-blue-600">
                              OPTION {option.option}
                            </span>
                            <span className="text-xs font-semibold text-slate-500">
                              {isSelected ? "Selected ✓" : "Select"}
                            </span>
                          </div>

                          <h5 className="mt-3 text-lg font-bold text-slate-900">
                            {option.name}
                          </h5>

                          <div className="mt-5 space-y-4">
                            <div>
                              <p className="text-xs text-slate-500">
                                Estimated Action Cost
                              </p>
                              <p className="mt-1 text-2xl font-bold text-slate-900">
                                {formatCost(option.est_cost)}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-lg bg-slate-50 p-3">
                                <p className="text-xs text-slate-500">
                                  Days Saved
                                </p>
                                <p className="mt-1 text-lg font-bold text-emerald-700">
                                  {option.days_saved}
                                </p>
                              </div>
                              <div className="rounded-lg bg-slate-50 p-3">
                                <p className="text-xs text-slate-500">
                                  Residual Delay
                                </p>
                                <p className="mt-1 text-lg font-bold text-slate-800">
                                  {option.residual_delay_days} days
                                </p>
                              </div>
                            </div>

                            <div className="border-t border-slate-200 pt-3">
                              <p className="text-xs text-slate-500">
                                Total Evaluated Cost
                              </p>
                              <p className="mt-1 text-lg font-bold text-blue-700">
                                {formatCost(option.total_cost)}
                              </p>
                            </div>

                            <p className="text-xs text-slate-500">
                              Risk score: {(option.risk * 100).toFixed(0)}%
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <h4 className="font-bold text-slate-900">
                          Execute Selected Decision
                        </h4>
                        <p className="mt-1 text-sm text-slate-500">
                          {selectedOption
                            ? `Option ${selectedOption.option} — ${selectedOption.name}`
                            : "Select an option above to continue."}
                        </p>
                      </div>

                      <button
                        onClick={executeDecision}
                        disabled={!selectedOption || decisionSaving}
                        className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {decisionSaving
                          ? "Saving Decision..."
                          : "Execute Decision →"}
                      </button>
                    </div>

                    {decisionMessage && (
                      <p
                        role="status"
                        className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700"
                      >
                        {decisionMessage}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* All Shipments */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-lg font-bold">All Shipments</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {loading
                      ? "Loading records..."
                      : `${filteredShipments.length.toLocaleString(
                          "en-IN"
                        )} shipment records found`}
                  </p>
                </div>
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Search shipments..."
                />
              </div>

              {loading ? (
                <EmptyMessage text="Loading shipments..." />
              ) : filteredShipments.length === 0 ? (
                <EmptyMessage text="No matching shipment records found." />
              ) : (
                <div className="max-h-[650px] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-5 py-4">Shipment ID</th>
                        <th className="px-5 py-4">Supplier</th>
                        <th className="px-5 py-4">Route</th>
                        <th className="px-5 py-4">Order Qty</th>
                        <th className="px-5 py-4">Lead Days</th>
                        <th className="px-5 py-4">Delay Days</th>
                        <th className="px-5 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredShipments.map((shipment, index) => (
                        <tr
                          key={shipment.shipment_id ?? index}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap px-5 py-4 font-medium">
                            {shipment.shipment_id ?? `SHP-${index + 1}`}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {shipment.supplier ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {shipment.route ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {shipment.order_qty?.toLocaleString("en-IN") ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {shipment.planned_lead_days ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {shipment.delay_days ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <StatusBadge delayed={isDelayed(shipment)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* Decisions */}
        {activePage === "Decisions" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-6 lg:flex-row lg:items-center">
              <div>
                <h3 className="text-lg font-bold">Saved Decisions</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {loading
                    ? "Loading decisions..."
                    : `${filteredDecisions.length} decisions retrieved from the database`}
                </p>
              </div>
              <SearchBox
                value={search}
                onChange={setSearch}
                placeholder="Search decisions..."
              />
            </div>

            {loading ? (
              <EmptyMessage text="Loading decisions..." />
            ) : filteredDecisions.length === 0 ? (
              <EmptyMessage text="No saved decisions found." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Decision ID</th>
                      <th className="px-6 py-4">Shipment ID</th>
                      <th className="px-6 py-4">Option</th>
                      <th className="px-6 py-4">Predicted Cost</th>
                      <th className="px-6 py-4">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDecisions.map((decision, index) => (
                      <tr
                        key={decision.id ?? index}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-6 py-4 font-semibold">
                          #{decision.id ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                          {decision.shipment_id ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                            Option {decision.option ?? "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 font-semibold">
                          {formatCost(decision.predicted_cost)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                          {formatDate(decision.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-xs text-slate-500">
              Showing {filteredDecisions.length} of {decisions.length} saved
              decisions
            </div>
          </section>
        )}

        {/* Outcomes */}
        {activePage === "Outcomes" && (
          <>
            {/* Add Outcome Form */}
            <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  Actual Performance
                </span>
                <h3 className="mt-2 text-xl font-bold">
                  Record Decision Outcome
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Select a saved decision and enter its actual cost and
                  actual delay to evaluate the result.
                </p>
              </div>

              {decisions.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No saved decisions available. Execute a decision from
                  the Shipments page before recording an outcome.
                </div>
              ) : (
                <form onSubmit={submitOutcome} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Select Saved Decision
                    </label>
                    <select
                      value={outcomeDecisionId}
                      onChange={(event) =>
                        setOutcomeDecisionId(event.target.value)
                      }
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                    >
                      <option value="">Choose a decision</option>
                      {decisions.map((decision) => (
                        <option
                          key={decision.id}
                          value={String(decision.id ?? "")}
                        >
                          Decision #{decision.id} — Shipment #
                          {decision.shipment_id} — Option {decision.option}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedDecision && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl bg-blue-50 p-4">
                        <p className="text-xs text-blue-700">Decision ID</p>
                        <p className="mt-1 text-lg font-bold text-blue-800">
                          #{selectedDecision.id}
                        </p>
                      </div>
                      <div className="rounded-xl bg-violet-50 p-4">
                        <p className="text-xs text-violet-700">Shipment ID</p>
                        <p className="mt-1 text-lg font-bold text-violet-800">
                          #{selectedDecision.shipment_id}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-500">
                          Predicted Cost
                        </p>
                        <p className="mt-1 text-lg font-bold">
                          {formatCost(selectedDecision.predicted_cost)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Actual Cost (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={actualCost}
                        onChange={(event) =>
                          setActualCost(event.target.value)
                        }
                        placeholder="Enter actual cost"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Actual Delay (Days)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={actualDelayDays}
                        onChange={(event) =>
                          setActualDelayDays(event.target.value)
                        }
                        placeholder="Enter actual delay days"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                      />
                    </div>
                  </div>

                  {outcomeError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                    >
                      {outcomeError}
                    </div>
                  )}

                  {outcomeMessage && (
                    <div
                      role="status"
                      className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
                    >
                      {outcomeMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={outcomeSaving}
                    className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {outcomeSaving ? "Saving Outcome..." : "Save Outcome →"}
                  </button>
                </form>
              )}
            </section>

            {/* Outcomes Table */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-6 lg:flex-row lg:items-center">
                <div>
                  <h3 className="text-lg font-bold">Recorded Outcomes</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {loading
                      ? "Loading outcomes..."
                      : `${filteredOutcomes.length} actual results retrieved from the database`}
                  </p>
                </div>
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Search outcomes..."
                />
              </div>

              {loading ? (
                <EmptyMessage text="Loading outcomes..." />
              ) : filteredOutcomes.length === 0 ? (
                <EmptyMessage text="No recorded outcomes found." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-6 py-4">Outcome ID</th>
                        <th className="px-6 py-4">Decision ID</th>
                        <th className="px-6 py-4">Actual Cost</th>
                        <th className="px-6 py-4">Actual Delay</th>
                        <th className="px-6 py-4">Recorded At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOutcomes.map((outcome, index) => (
                        <tr
                          key={outcome.id ?? index}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap px-6 py-4 font-semibold">
                            #{outcome.id ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                            #{outcome.decision_id ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 font-semibold">
                            {formatCost(outcome.actual_cost)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                            {outcome.actual_delay_days == null
                              ? "Not recorded"
                              : `${outcome.actual_delay_days} days`}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                            {formatDate(outcome.recorded_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-xs text-slate-500">
                Showing {filteredOutcomes.length} of {outcomes.length} recorded
                outcomes
              </div>
            </section>
          </>
        )}

        {/* Decision ROI */}
        {activePage === "Decision ROI" && (
          <section className="space-y-6">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Performance Evaluation
                </span>
                <h3 className="mt-2 text-xl font-bold">
                  Decision ROI Dashboard
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Compare predicted costs with actual results and review
                  decision performance.
                </p>
              </div>

              <button
                onClick={loadEvaluationReport}
                disabled={roiLoading}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {roiLoading ? "Refreshing..." : "↻ Refresh Report"}
              </button>
            </div>

            {roiLoading && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
                Loading evaluation report...
              </div>
            )}

            {roiError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              >
                {roiError}
              </div>
            )}

            {roiMessage && !roiError && !roiLoading && !evaluationReport && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {roiMessage}
              </div>
            )}

            {evaluationReport && (
              <>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    title="Total Decisions"
                    value={evaluationReport.total_decisions}
                    detail="Decisions included in evaluation"
                    icon="⇄"
                    color="bg-blue-50 text-blue-600"
                  />

                  <StatCard
                    title="Overall Success Rate"
                    value={formatPercent(
                      evaluationReport.overall_success_rate
                    )}
                    detail="Overall decision success"
                    icon="✓"
                    color="bg-emerald-50 text-emerald-600"
                  />

                  <StatCard
                    title="Absolute Percentage Error"
                    value={formatPercent(
                      evaluationReport.overall_abs_pct_error
                    )}
                    detail="Predicted versus actual cost error"
                    icon="%"
                    color="bg-violet-50 text-violet-600"
                  />

                  <StatCard
                    title="Retraining Required"
                    value={evaluationReport.needs_retrain ? "Yes" : "No"}
                    detail="Model retraining status"
                    icon="⚙"
                    color={
                      evaluationReport.needs_retrain
                        ? "bg-amber-50 text-amber-600"
                        : "bg-emerald-50 text-emerald-600"
                    }
                  />
                </div>

                <div
                  className={`rounded-2xl border p-5 ${
                    evaluationReport.needs_retrain
                      ? "border-amber-200 bg-amber-50"
                      : "border-emerald-200 bg-emerald-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">
                      {evaluationReport.needs_retrain ? "⚠" : "✓"}
                    </span>
                    <div>
                      <h4
                        className={`font-bold ${
                          evaluationReport.needs_retrain
                            ? "text-amber-800"
                            : "text-emerald-800"
                        }`}
                      >
                        {evaluationReport.needs_retrain
                          ? "Model Retraining Recommended"
                          : "Model Performance is Stable"}
                      </h4>
                      <p
                        className={`mt-1 text-sm ${
                          evaluationReport.needs_retrain
                            ? "text-amber-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {evaluationReport.needs_retrain
                          ? "The evaluation report indicates that the model needs retraining."
                          : "The evaluation report indicates that retraining is not currently required."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-6">
                    <h3 className="text-lg font-bold">
                      Option-wise Performance
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Evaluation details for each option returned by the
                      backend report.
                    </p>
                  </div>

                  {Object.keys(evaluationReport.per_option || {}).length ===
                  0 ? (
                    <EmptyMessage text="No option-wise evaluation data available." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-5 py-4">Option</th>
                            <th className="px-5 py-4">Decisions</th>
                            <th className="px-5 py-4">Avg. Predicted Cost</th>
                            <th className="px-5 py-4">Avg. Actual Cost</th>
                            <th className="px-5 py-4">Mean % Error</th>
                            <th className="px-5 py-4">Mean Abs. Error</th>
                            <th className="px-5 py-4">Success Rate</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                          {Object.entries(
                            evaluationReport.per_option
                          ).map(([option, item]) => (
                            <tr
                              key={option}
                              className="transition hover:bg-slate-50"
                            >
                              <td className="whitespace-nowrap px-5 py-4">
                                <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                                  Option {option}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-5 py-4">
                                {item.decisions}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 font-medium">
                                {formatCost(item.avg_predicted_cost)}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 font-medium">
                                {formatCost(item.avg_actual_cost)}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4">
                                {formatPercent(item.mean_pct_error)}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4">
                                {formatCost(item.mean_abs_error_usd)}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 font-semibold text-emerald-700">
                                {formatPercent(item.success_rate)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-6">
                    <h3 className="text-lg font-bold">
                      Solver Weight Updates
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Old and new weights for each evaluated option.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-6 py-4">Option</th>
                          <th className="px-6 py-4">Old Weight</th>
                          <th className="px-6 py-4">New Weight</th>
                          <th className="px-6 py-4">Weight Change</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Object.entries(
                          evaluationReport.per_option
                        ).map(([option, item]) => (
                          <tr key={option}>
                            <td className="px-6 py-4 font-semibold">
                              Option {option}
                            </td>
                            <td className="px-6 py-4">
                              {item.old_weight.toFixed(4)}
                            </td>
                            <td className="px-6 py-4">
                              {item.new_weight.toFixed(4)}
                            </td>
                            <td className="px-6 py-4">
                              {(item.new_weight - item.old_weight).toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  Report data is loaded from the backend evaluation-report
                  endpoint.
                </p>
              </>
            )}
          </section>
        )}

        <footer className="mt-10 pb-4 text-center text-xs text-slate-400">
          Supply Prescript · Supply Chain Prediction and Decision Support
        </footer>
      </main>
    </div>
  );
}