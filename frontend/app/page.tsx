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
  historical_delay_days: number;
  historically_delayed: boolean;
  method: string;
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

export default function Home() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [search, setSearch] = useState("");

  // Risk assessment state
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [riskResult, setRiskResult] = useState<RiskAssessment | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState("");

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

        setShipments(shipmentList);
        setDecisions(getArray<Decision>(decisionData, "decisions"));
        setOutcomes(getArray<Outcome>(outcomeData, "outcomes"));

        if (shipmentList.length > 0) {
          setSelectedShipmentId(String(shipmentList[0].shipment_id ?? ""));
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
        throw new Error(
          data.detail || "Unable to assess shipment risk."
        );
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 md:flex">
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
                <article
                  key={stat.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-500">
                      {stat.title}
                    </p>

                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${stat.color}`}
                    >
                      {stat.icon}
                    </span>
                  </div>

                  <p className="mt-5 text-3xl font-bold">
                    {loading ? "..." : stat.value.toLocaleString("en-IN")}
                  </p>

                  <p className="mt-2 text-xs text-slate-400">
                    {stat.detail}
                  </p>
                </article>
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
                        margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
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
                      description: "Check recorded results",
                      icon: "◷",
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

        {/* Shipments and risk assessment */}
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
                  Select a shipment to assess its risk using supplier
                  reliability, port congestion and weather risk.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <select
                  value={selectedShipmentId}
                  onChange={(event) => {
                    setSelectedShipmentId(event.target.value);
                    setRiskResult(null);
                    setRiskError("");
                  }}
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
                  {riskLoading ? "Assessing Risk..." : "Assess Risk →"}
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
                        Risk assessment result
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
                        <span className="ml-1 text-base font-medium">/100</span>
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

                    <div className="rounded-xl bg-slate-50 p-5">
                      <p className="text-sm text-slate-500">Supplier</p>
                      <p className="mt-2 break-words text-lg font-bold">
                        {riskResult.supplier || "—"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-5">
                      <p className="text-sm text-slate-500">Route</p>
                      <p className="mt-2 text-lg font-bold">
                        {riskResult.route || "—"}
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

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-500">
                        Historical Delay
                      </p>
                      <p className="mt-2 text-lg font-bold">
                        {riskResult.historical_delay_days ?? 0} days
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-500">
                        Previously Delayed
                      </p>
                      <p
                        className={`mt-2 text-lg font-bold ${
                          riskResult.historically_delayed
                            ? "text-amber-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {riskResult.historically_delayed ? "Yes" : "No"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                    Method: Rule-based risk score. This is not a trained
                    machine-learning prediction.
                  </p>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-lg font-bold">All Shipments</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {loading
                      ? "Loading records..."
                      : `${filteredShipments.length.toLocaleString("en-IN")} shipment records found`}
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
        )}

        <footer className="mt-10 pb-4 text-center text-xs text-slate-400">
          Supply Prescript · Supply Chain Prediction and Decision Support
        </footer>
      </main>
    </div>
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