import React, { useState, useEffect, useCallback, useRef } from "react";
import { PGlite } from "@electric-sql/pglite";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  LayoutDashboard,
  Database,
  Upload,
  Download,
  Play,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  AlertCircle,
  FileText,
  Loader2,
  Truck,
  Calendar,
  ShoppingCart,
  Filter,
  Menu,
  X,
  Moon,
  Sun,
  Eye,
} from "lucide-react";

// --- TYPES ---
interface ChartData {
  name: string;
  [key: string]: any;
}

interface Metrics {
  totalSales: number;
  totalProfit: number;
  totalOrders: number;
  profitMargin: number;
  avgOrderValue: number;
  salesByCategory: ChartData[];
  salesByRegion: ChartData[];
  profitBySubCategory: ChartData[];
  monthlyTrend: ChartData[];
  topCustomers: ChartData[];
  topProducts: ChartData[];
  shippingMode: ChartData[];
  profitByRegion: ChartData[];
}

interface QueryResult {
  rows: any[];
  fields: { name: string }[];
  time: string;
}

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ef4444",
];

export default function App() {
  const [db, setDb] = useState<PGlite | null>(null);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState<boolean>(false);

  // UI States
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Lazy Load Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalData, setModalData] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalFields, setModalFields] = useState<string[]>([]);

  // Ref to prevent double initialization in Strict Mode
  const initRef = useRef(false);

  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  const [metrics, setMetrics] = useState<Metrics>({
    totalSales: 0,
    totalProfit: 0,
    totalOrders: 0,
    profitMargin: 0,
    avgOrderValue: 0,
    salesByCategory: [],
    salesByRegion: [],
    profitBySubCategory: [],
    monthlyTrend: [],
    topCustomers: [],
    topProducts: [],
    shippingMode: [],
    profitByRegion: [],
  });

  const [query, setQuery] = useState<string>(
    "SELECT * FROM superstore_order LIMIT 10;"
  );
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string>("");
  const [tables, setTables] = useState<string[]>([]);

  // 0. Toggle Dark Mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // 1. Initialize DB
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function initDb() {
      try {
        setLoading(true);
        const pglite = new PGlite();
        setDb(pglite);

        try {
          const response = await fetch("/initial.sql");
          if (response.ok) {
            const sqlContent = await response.text();
            await pglite.exec(sqlContent);
            console.log("Initial SQL loaded successfully");
            await fetchTables(pglite);
          } else {
            console.warn("initial.sql not found, starting with empty DB");
          }
        } catch (e) {
          console.warn("Error loading initial.sql:", e);
        }

        setDbReady(true);
        setLoading(false);
      } catch (err: any) {
        console.error("DB Init Failed:", err);
        setError(`Failed to load: ${err.message}`);
        setLoading(false);
      }
    }
    initDb();
  }, []);

  // 2. Refresh when DB is ready or year changes
  useEffect(() => {
    if (!dbReady || !db) return;

    const loadData = async () => {
      await fetchYears();
      await refreshDashboard(db);
      await handleRunQuery(db);
    };
    loadData();
  }, [dbReady, db, selectedYear]);

  const fetchTables = async (db: PGlite) => {
    if (!db) return;
    try {
      const res = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        `);
      setTables(res.rows.map((r: any) => r.table_name));
    } catch (e) {
      console.warn("Could not fetch tables", e);
    }
  };

  const fetchYears = async () => {
    if (!db) return;
    try {
      const checkTable = await db.query(
        `SELECT to_regclass('public.superstore_order') as exists`
      );
      if (!(checkTable as any).rows[0].exists) return;

      const res = await db.query(`
        SELECT DISTINCT SPLIT_PART("Order Date", '/', 3) as year 
        FROM superstore_order 
        WHERE "Order Date" LIKE '%/%/%'
        ORDER BY year DESC
      `);
      const years = res.rows.map((r: any) => r.year).filter((y: any) => y);

      setAvailableYears((prev) => {
        const newYears = ["All", ...years];
        return JSON.stringify(prev) !== JSON.stringify(newYears)
          ? newYears
          : prev;
      });
    } catch (e) {
      console.warn("Could not fetch years", e);
    }
  };

  const refreshDashboard = async (db: PGlite | null) => {
    if (!db) return;
    try {
      const checkTable = await db.query(
        `SELECT to_regclass('public.superstore_order') as exists`
      );
      if (!(checkTable as any).rows[0].exists) return;

      const whereClause =
        selectedYear !== "All"
          ? `WHERE o."Order Date" LIKE '%/${selectedYear}'`
          : "";

      const simpleWhereClause =
        selectedYear !== "All"
          ? `WHERE "Order Date" LIKE '%/${selectedYear}'`
          : "";

      const simpleWhereClauseAnd =
        selectedYear !== "All"
          ? `AND "Order Date" LIKE '%/${selectedYear}'`
          : "";

      // KPIs
      const kpiRes = await db.query(`
        SELECT 
          COUNT(*) as total_orders, 
          COALESCE(SUM("Sales"), 0) as total_sales, 
          COALESCE(SUM("Profit"), 0) as total_profit 
        FROM superstore_order
        ${simpleWhereClause}
      `);
      const kpi = kpiRes.rows[0] as any;

      // Sales Analysis
      const catRes = await db.query(`
        SELECT p."Category" as name, SUM(o."Sales") as value 
        FROM superstore_order o
        LEFT JOIN superstore_product p ON o."Product ID" = p."Product ID"
        ${whereClause}
        GROUP BY p."Category" 
        ORDER BY value DESC
      `);

      const regionRes = await db.query(`
        SELECT "Region" as name, SUM("Sales") as value 
        FROM superstore_order 
        ${simpleWhereClause}
        GROUP BY "Region" 
        ORDER BY value DESC
      `);

      // Profit Analysis
      const subCatRes = await db.query(`
        SELECT p."Sub-Category" as name, SUM(o."Profit") as profit, SUM(o."Sales") as sales 
        FROM superstore_order o
        LEFT JOIN superstore_product p ON o."Product ID" = p."Product ID"
        ${whereClause}
        GROUP BY p."Sub-Category" 
        ORDER BY profit DESC 
        LIMIT 10
      `);

      const regionProfitRes = await db.query(`
        SELECT "Region" as name, SUM("Profit") as value 
        FROM superstore_order 
        ${simpleWhereClause}
        GROUP BY "Region" 
        ORDER BY value DESC
      `);

      // Time Series
      const trendRes = await db.query(`
        SELECT 
          SPLIT_PART("Order Date", '/', 3) || '-' || LPAD(SPLIT_PART("Order Date", '/', 1), 2, '0') as date,
          SUM("Sales") as sales,
          SUM("Profit") as profit
        FROM superstore_order 
        WHERE "Order Date" LIKE '%/%/%' ${simpleWhereClauseAnd}
        GROUP BY 1 
        ORDER BY 1 ASC
      `);

      // Customer Analysis
      const custRes = await db.query(`
        SELECT "Customer Name" as name, SUM("Sales") as sales, SUM("Profit") as profit, COUNT(*) as count 
        FROM superstore_order 
        ${simpleWhereClause}
        GROUP BY "Customer Name" 
        ORDER BY sales DESC 
        LIMIT 10
      `);

      // Product Analysis
      const prodRes = await db.query(`
        SELECT "Product Name" as name, SUM("Sales") as sales, SUM("Quantity") as count
        FROM superstore_order 
        ${simpleWhereClause}
        GROUP BY "Product Name" 
        ORDER BY sales DESC 
        LIMIT 10
      `);

      // Shipping Analysis
      const shipRes = await db.query(`
        SELECT "Ship Mode" as name, COUNT(*) as value, AVG("Profit") as profit 
        FROM superstore_order 
        ${simpleWhereClause}
        GROUP BY "Ship Mode"
      `);

      setMetrics({
        totalSales: kpi.total_sales,
        totalProfit: kpi.total_profit,
        totalOrders: kpi.total_orders,
        profitMargin: kpi.total_sales
          ? (kpi.total_profit / kpi.total_sales) * 100
          : 0,
        avgOrderValue: kpi.total_orders
          ? kpi.total_sales / kpi.total_orders
          : 0,
        salesByCategory: catRes.rows as ChartData[],
        salesByRegion: regionRes.rows as ChartData[],
        profitBySubCategory: subCatRes.rows as ChartData[],
        monthlyTrend: trendRes.rows as ChartData[],
        topCustomers: custRes.rows as ChartData[],
        topProducts: prodRes.rows as ChartData[],
        shippingMode: shipRes.rows as ChartData[],
        profitByRegion: regionProfitRes.rows as ChartData[],
      });
    } catch (e) {
      console.error("Dashboard refresh error:", e);
    }
  };

  // 3. Handlers
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !db) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await db.exec(e.target?.result as string);
        setImportStatus("Success! Database updated.");
        setTimeout(() => setImportStatus(""), 3000);
        await fetchTables(db);
        await fetchYears();
        refreshDashboard(db);
      } catch (err: any) {
        setImportStatus(`Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleRunQuery = useCallback(async (db: PGlite|null) => {
    if (!db) return;
    setQueryError(null);
    setQueryResult(null);
    try {
      const start = performance.now();
      const res = await db.query(query);
      const end = performance.now();
      setQueryResult({
        rows: res.rows,
        fields: res.fields,
        time: (end - start).toFixed(2),
      });
    } catch (err: any) {
      setQueryError(err.message);
    }
  }, [db, query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleRunQuery(db);
    }
  };

  const handleExportCSV = () => {
    if (!queryResult?.rows.length) return;
    const headers = Object.keys(queryResult.rows[0]).join(",");
    const rows = queryResult.rows
      .map((row) => Object.values(row).join(","))
      .join("\n");
    const blob = new Blob([`${headers}\n${rows}`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = window.URL.createObjectURL(blob);
    a.download = "query_result.csv";
    a.click();
  };

  // --- LAZY LOADING DETAILS ---
  const handleShowDetails = async (type: string, title: string) => {
    if (!db) return;
    setModalOpen(true);
    setModalLoading(true);
    setModalTitle(title);
    setModalData([]);

    try {
      let sql = "";
      const yearFilter =
        selectedYear !== "All"
          ? `WHERE "Order Date" LIKE '%/${selectedYear}'`
          : "";

      switch (type) {
        case "customers":
          sql = `
          SELECT "Customer Name", SUM("Sales") as Sales, SUM("Profit") as Profit, COUNT(*) as Orders
          FROM superstore_order ${yearFilter}
          GROUP BY "Customer Name"
          ORDER BY Sales DESC
          LIMIT 50`;
          break;
        case "products":
          sql = `
          SELECT o."Product Name", p."Category", SUM(o."Sales") as Sales, SUM(o."Quantity") as Qty
          FROM superstore_order o
          LEFT JOIN superstore_product p
          ON o."Product ID" = p."Product ID"
          ${
            selectedYear !== "All"
              ? `WHERE o."Order Date" LIKE '%/${selectedYear}'`
              : ""
          }
          GROUP BY o."Product Name", p."Category"
          ORDER BY Sales DESC
          LIMIT 50
          `;
          break;
        case "orders":
          sql = `
          SELECT "Order ID", "Order Date", "Customer Name", "Sales", "Profit"
          FROM superstore_order ${yearFilter}
          ORDER BY "Sales" DESC
          LIMIT 50`;
          break;
        default:
          sql = `SELECT * FROM superstore_order LIMIT 10`;
      }

      const res = await db.query(sql);
      setModalData(res.rows);
      if (res.rows.length > 0) {
        setModalFields(Object.keys((res as any).rows[0]));
      }
    } catch (e) {
      console.error("Lazy load failed", e);
    } finally {
      setModalLoading(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(val);
  const formatNumber = (val: number) =>
    new Intl.NumberFormat("en-US").format(val);

  if (error)
    return (
      <div className="p-8 text-red-600 font-bold dark:bg-slate-900 dark:text-red-400">
        Error: {error}
      </div>
    );

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-200">
      {/* MOBILE HEADER */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md z-50">
        <h1 className="font-bold flex items-center gap-2">
          <Database className="text-emerald-400" size={20} /> Superstore
        </h1>
        <button onClick={() => setSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* SIDEBAR */}
      <div
        className={`
        h-full z-40 w-64 bg-slate-900 text-slate-100 flex flex-col shadow-xl shrink-0 transform transition-transform duration-300 ease-in-out
        ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }
      `}
      >
        <div className="p-6 border-b border-slate-800 hidden md:block">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Database className="text-emerald-400" /> Superstore
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavBtn
            id="overview"
            label="Overview"
            icon={LayoutDashboard}
            activeTab={activeTab}
            setTab={(id) => {
              setActiveTab(id);
              setSidebarOpen(false);
            }}
          />
          <NavBtn
            id="sales"
            label="Sales Analysis"
            icon={DollarSign}
            activeTab={activeTab}
            setTab={(id) => {
              setActiveTab(id);
              setSidebarOpen(false);
            }}
          />
          <NavBtn
            id="profit"
            label="Profit & Margin"
            icon={TrendingUp}
            activeTab={activeTab}
            setTab={(id) => {
              setActiveTab(id);
              setSidebarOpen(false);
            }}
          />
          <NavBtn
            id="customer"
            label="Customer Analysis"
            icon={Users}
            activeTab={activeTab}
            setTab={(id) => {
              setActiveTab(id);
              setSidebarOpen(false);
            }}
          />
          <NavBtn
            id="product"
            label="Product Analysis"
            icon={ShoppingCart}
            activeTab={activeTab}
            setTab={(id) => {
              setActiveTab(id);
              setSidebarOpen(false);
            }}
          />
          <NavBtn
            id="shipping"
            label="Shipping Performance"
            icon={Truck}
            activeTab={activeTab}
            setTab={(id) => {
              setActiveTab(id);
              setSidebarOpen(false);
            }}
          />
          <NavBtn
            id="time"
            label="Time Series"
            icon={Calendar}
            activeTab={activeTab}
            setTab={(id) => {
              setActiveTab(id);
              setSidebarOpen(false);
            }}
          />
          <NavBtn
            id="sql"
            label="SQL Editor"
            icon={FileText}
            activeTab={activeTab}
            setTab={(id) => {
              setActiveTab(id);
              setSidebarOpen(false);
            }}
          />

          <div className="mt-6 pt-6 border-t border-slate-800">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 px-3">
              Database Info
            </p>
            <ul className="space-y-1">
              {tables.map((t) => (
                <li
                  key={t}
                  className="px-3 py-1 text-xs text-slate-400 font-mono flex items-center gap-2"
                >
                  <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>{" "}
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-4">
          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 rounded text-xs text-slate-300 hover:text-white"
          >
            <span className="flex items-center gap-2">
              {darkMode ? <Moon size={14} /> : <Sun size={14} />}
              {darkMode ? "Dark Mode" : "Light Mode"}
            </span>
            <div
              className={`w-8 h-4 rounded-full p-0.5 flex ${
                darkMode
                  ? "bg-emerald-500 justify-end"
                  : "bg-slate-600 justify-start"
              }`}
            >
              <div className="w-3 h-3 bg-white rounded-full shadow-sm"></div>
            </div>
          </button>

          <div className="bg-slate-800 rounded p-3">
            <label className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1 cursor-pointer hover:text-emerald-400 transition-colors">
              <Upload size={12} /> Import SQL File
            </label>
            <input
              type="file"
              accept=".sql"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-300"
            />
            {importStatus && (
              <p className="text-[10px] mt-2 text-emerald-400">
                {importStatus}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* OVERLAY FOR MOBILE SIDEBAR */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 dark:text-slate-100">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
            <div className="text-emerald-600 font-medium">
              Initializing PGlite Database...
            </div>
          </div>
        ) : (
          <div className="p-4 md:p-8 pb-20">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-xl md:text-2xl font-bold capitalize text-slate-800 dark:text-white">
                  {activeTab
                    .replace(/([A-Z])/g, " $1")
                    .trim()
                    .toUpperCase()}
                </h2>
                {/* Timeframe Selector */}
                {activeTab !== "sql" && (
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1 shadow-sm">
                    <Filter size={14} className="text-slate-400" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Year:
                    </span>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="text-sm font-semibold text-slate-700 dark:text-slate-200 bg-transparent outline-none cursor-pointer"
                    >
                      {availableYears.map((y) => (
                        <option key={y} value={y} className="dark:bg-slate-800">
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-400">
                Connected to In-Memory Postgres
              </div>
            </header>

            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    title="Total Sales"
                    value={formatCurrency(metrics.totalSales)}
                    icon={DollarSign}
                    color="bg-blue-500"
                  />
                  <KpiCard
                    title="Total Profit"
                    value={formatCurrency(metrics.totalProfit)}
                    icon={TrendingUp}
                    color="bg-emerald-500"
                  />
                  <KpiCard
                    title="Total Orders"
                    value={formatNumber(metrics.totalOrders)}
                    icon={Package}
                    color="bg-indigo-500"
                  />
                  <KpiCard
                    title="Avg Order Value"
                    value={formatCurrency(metrics.avgOrderValue)}
                    icon={AlertCircle}
                    color="bg-amber-500"
                  />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Sales by Region">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={metrics.salesByRegion}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke={darkMode ? "#334155" : "#e2e8f0"}
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(value) => `$${value / 1000}k`}
                          tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: darkMode ? "#1e293b" : "#fff",
                            borderColor: darkMode ? "#334155" : "#e2e8f0",
                            color: darkMode ? "#fff" : "#000",
                          }}
                          formatter={(val: number) => formatCurrency(val)}
                        />
                        <Bar
                          dataKey="value"
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Profit Trend (Monthly)">
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart
                        data={metrics.monthlyTrend}
                        margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="colorProfit"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#10b981"
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor="#10b981"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                        />
                        <YAxis
                          tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                        />
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke={darkMode ? "#334155" : "#e2e8f0"}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: darkMode ? "#1e293b" : "#fff",
                            borderColor: darkMode ? "#334155" : "#e2e8f0",
                            color: darkMode ? "#fff" : "#000",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="profit"
                          stroke="#10b981"
                          fillOpacity={1}
                          fill="url(#colorProfit)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              </div>
            )}

            {activeTab === "sales" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                  title="Sales by Category"
                  onDetails={() =>
                    handleShowDetails("products", "Sales by Category Detail")
                  }
                >
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={metrics.salesByCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${(percent ? percent * 100 : 0).toFixed(0)}%`
                        }
                      >
                        {metrics.salesByCategory.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: darkMode ? "#1e293b" : "#fff",
                          borderColor: darkMode ? "#334155" : "#e2e8f0",
                          color: darkMode ? "#fff" : "#000",
                        }}
                        formatter={(val: number) => formatCurrency(val)}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Sales by Region">
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                      layout="vertical"
                      data={metrics.salesByRegion}
                      margin={{ left: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke={darkMode ? "#334155" : "#e2e8f0"}
                      />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={80}
                        tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: darkMode ? "#1e293b" : "#fff",
                          borderColor: darkMode ? "#334155" : "#e2e8f0",
                          color: darkMode ? "#fff" : "#000",
                        }}
                        formatter={(val: number) => formatCurrency(val)}
                      />
                      <Bar
                        dataKey="value"
                        fill="#6366f1"
                        radius={[0, 4, 4, 0]}
                        barSize={30}
                      >
                        {metrics.salesByRegion.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}

            {activeTab === "profit" && (
              <div className="space-y-6">
                <ChartCard
                  title="Profit & Sales by Sub-Category (Top 10)"
                  onDetails={() =>
                    handleShowDetails("products", "Product Profit Details")
                  }
                >
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart
                      layout="vertical"
                      data={metrics.profitBySubCategory}
                      margin={{ left: 40, right: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={true}
                        stroke={darkMode ? "#334155" : "#e2e8f0"}
                      />
                      <XAxis
                        type="number"
                        tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={100}
                        tick={{
                          fontSize: 12,
                          fill: darkMode ? "#94a3b8" : "#64748b",
                        }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: darkMode ? "#1e293b" : "#fff",
                          borderColor: darkMode ? "#334155" : "#e2e8f0",
                          color: darkMode ? "#fff" : "#000",
                        }}
                        formatter={(val: number) => formatCurrency(val)}
                      />
                      <Legend />
                      <Bar
                        dataKey="sales"
                        name="Sales"
                        fill="#94a3b8"
                        barSize={10}
                        radius={[0, 4, 4, 0]}
                      />
                      <Bar
                        dataKey="profit"
                        name="Profit"
                        fill="#10b981"
                        barSize={10}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Profit Distribution by Region">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={metrics.profitByRegion}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={darkMode ? "#334155" : "#e2e8f0"}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                      />
                      <YAxis
                        tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: darkMode ? "#1e293b" : "#fff",
                          borderColor: darkMode ? "#334155" : "#e2e8f0",
                          color: darkMode ? "#fff" : "#000",
                        }}
                        formatter={(val: number) => formatCurrency(val)}
                      />
                      <Bar
                        dataKey="value"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}

            {activeTab === "customer" && (
              <div className="space-y-6">
                <ChartCard
                  title="Top 10 Customers by Sales"
                  onDetails={() =>
                    handleShowDetails("customers", "Full Customer List")
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                        <tr>
                          <th className="px-6 py-3">Customer Name</th>
                          <th className="px-6 py-3 text-right">Orders</th>
                          <th className="px-6 py-3 text-right">Total Profit</th>
                          <th className="px-6 py-3 text-right">Total Sales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.topCustomers.map((c, i) => (
                          <tr
                            key={i}
                            onClick={() =>
                              handleShowDetails(
                                "customers",
                                `Details for ${c.name}`
                              )
                            }
                            className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer group transition-colors"
                          >
                            <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100 group-hover:text-emerald-500">
                              {c.name}
                            </td>
                            <td className="px-6 py-3 text-right text-slate-600 dark:text-slate-300">
                              {c.count}
                            </td>
                            <td
                              className={`px-6 py-3 text-right ${
                                c.profit && c.profit > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {formatCurrency(c.profit || 0)}
                            </td>
                            <td className="px-6 py-3 text-right font-bold text-slate-800 dark:text-slate-100">
                              {formatCurrency(c.sales || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              </div>
            )}

            {activeTab === "product" && (
              <ChartCard
                title="Top Selling Products"
                onDetails={() =>
                  handleShowDetails("products", "Product Inventory Detail")
                }
              >
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    layout="vertical"
                    data={metrics.topProducts}
                    margin={{ left: 10, right: 30 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke={darkMode ? "#334155" : "#e2e8f0"}
                    />
                    <XAxis
                      type="number"
                      tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={250}
                      tick={{
                        fontSize: 10,
                        fill: darkMode ? "#94a3b8" : "#64748b",
                      }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: darkMode ? "#1e293b" : "#fff",
                        borderColor: darkMode ? "#334155" : "#e2e8f0",
                        color: darkMode ? "#fff" : "#000",
                      }}
                      formatter={(val: number) => formatCurrency(val)}
                    />
                    <Bar
                      dataKey="sales"
                      fill="#f59e0b"
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {activeTab === "shipping" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ChartCard title="Order Count by Ship Mode">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={metrics.shippingMode}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {metrics.shippingMode.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: darkMode ? "#1e293b" : "#fff",
                          borderColor: darkMode ? "#334155" : "#e2e8f0",
                          color: darkMode ? "#fff" : "#000",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
                <div className="space-y-4">
                  {metrics.shippingMode.map((mode, i) => (
                    <div
                      key={i}
                      className="bg-white dark:bg-slate-900 p-4 rounded shadow-sm border border-slate-100 dark:border-slate-800 flex justify-between items-center"
                    >
                      <div>
                        <h4 className="font-bold text-slate-700 dark:text-slate-200">
                          {mode.name}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Avg Profit / Order
                        </p>
                      </div>
                      <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(mode.profit || 0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "time" && (
              <ChartCard
                title="Sales & Profit Timeline"
                onDetails={() =>
                  handleShowDetails("orders", "Order Timeline Details")
                }
              >
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart
                    data={metrics.monthlyTrend}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={darkMode ? "#334155" : "#e2e8f0"}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                    />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(val) => `$${val}`}
                      tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: darkMode ? "#94a3b8" : "#64748b" }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: darkMode ? "#1e293b" : "#fff",
                        borderColor: darkMode ? "#334155" : "#e2e8f0",
                        color: darkMode ? "#fff" : "#000",
                      }}
                      formatter={(val: number) => formatCurrency(val)}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="sales"
                      stroke="#3b82f6"
                      activeDot={{ r: 8 }}
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="profit"
                      stroke="#10b981"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {activeTab === "sql" && (
              <div className="space-y-4 h-full flex flex-col min-h-[500px]">
                <div className="bg-white dark:bg-slate-900 p-4 rounded shadow-sm border dark:border-slate-700">
                  <div className="flex justify-between mb-2">
                    <h3 className="font-semibold text-slate-700 dark:text-slate-200">
                      Query Editor
                    </h3>
                    <div className="gap-2 flex">
                      <button
                        onClick={() => handleRunQuery(db)}
                        className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium flex gap-2 items-center hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200 dark:shadow-none"
                      >
                        <Play size={14} fill="currentColor" /> Run
                      </button>
                      <button
                        onClick={handleExportCSV}
                        className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded text-sm font-medium flex gap-2 items-center hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 transition-colors"
                      >
                        <Download size={14} /> CSV
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="SELECT * FROM superstore_order LIMIT 10;"
                      className="w-full h-40 bg-slate-900 text-slate-100 font-mono text-sm p-4 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                    />
                    <div className="absolute bottom-3 right-4 text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded opacity-70">
                      Ctrl + Enter to run
                    </div>
                  </div>
                  {queryError && (
                    <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded border border-red-200 dark:border-red-900 flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />{" "}
                      {queryError}
                    </div>
                  )}
                </div>
                {queryResult && (
                  <div className="bg-white dark:bg-slate-900 rounded shadow-sm border dark:border-slate-700 flex-1 overflow-hidden flex flex-col">
                    <div className="p-2 bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700 flex justify-between items-center px-4">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Results
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {queryResult.rows.length} rows in {queryResult.time}ms
                      </span>
                    </div>
                    <div className="overflow-auto flex-1 max-h-[400px]">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                          <tr>
                            {queryResult.fields.map((f) => (
                              <th
                                key={f.name}
                                className="px-4 py-2 border-b dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 text-xs tracking-wider"
                              >
                                {f.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {queryResult.rows.map((row, i) => (
                            <tr
                              key={i}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              {Object.values(row).map((val: any, j) => (
                                <td
                                  key={j}
                                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-mono text-xs border-r border-slate-50 dark:border-slate-800 last:border-0"
                                >
                                  {val?.toString()}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* LAZY LOAD MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-lg shadow-2xl flex flex-col border dark:border-slate-700">
            <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800 rounded-t-lg">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                <Database size={18} className="text-emerald-500" />
                {modalTitle}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
              >
                <X className="text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-0">
              {modalLoading ? (
                <div className="h-64 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-2" />
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Fetching data from database...
                  </span>
                </div>
              ) : (
                <div className="relative">
                  {modalData.length > 0 ? (
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
                        <tr>
                          {modalFields.map((field) => (
                            <th
                              key={field}
                              className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 text-xs border-b dark:border-slate-700"
                            >
                              {field}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {modalData.map((row, i) => (
                          <tr
                            key={i}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            {modalFields.map((field, j) => (
                              <td
                                key={j}
                                className="px-4 py-2.5 text-slate-600 dark:text-slate-400 border-r border-slate-50 dark:border-slate-800 last:border-0"
                              >
                                {typeof row[field] === "number" &&
                                (field.includes("Sales") ||
                                  field.includes("Profit"))
                                  ? formatCurrency(row[field])
                                  : row[field]?.toString()}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                      No data found
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex justify-between rounded-b-lg">
              <span>Showing top results (Lazy Loaded)</span>
              <span>{modalData.length} records</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SUBCOMPONENTS ---

interface NavBtnProps {
  id: string;
  label: string;
  icon: React.ElementType;
  activeTab: string;
  setTab: (id: string) => void;
}

function NavBtn({ id, label, icon: Icon, activeTab, setTab }: NavBtnProps) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all duration-200
        ${
          isActive
            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/50"
            : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
        }`}
    >
      <Icon
        size={18}
        className={isActive ? "text-emerald-100" : "text-slate-500"}
      />
      {label}
    </button>
  );
}

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
}

function KpiCard({ title, value, icon: Icon, color }: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4 transition-transform hover:-translate-y-1">
      <div className={`p-3 rounded-full text-white shadow-md ${color}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">
          {title}
        </p>
        <p className="text-2xl font-bold text-slate-800 dark:text-white mt-0.5">
          {value}
        </p>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  onDetails,
}: {
  title: string;
  children: React.ReactNode;
  onDetails?: () => void;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800 h-full flex flex-col transition-colors duration-200">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
          {title}
        </h3>
        {onDetails && (
          <button
            onClick={onDetails}
            className="text-slate-400 hover:text-emerald-500 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            title="View Details"
          >
            <Eye size={16} />
          </button>
        )}
      </div>
      <div className="flex-1 min-h-[100px]">{children}</div>
    </div>
  );
}
