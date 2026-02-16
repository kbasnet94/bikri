import { useState, useMemo } from "react";
import { useDashboardStats, useRecentOrders } from "@/hooks/use-orders";
import { useProducts } from "@/hooks/use-products";
import { useCustomerStats, useCustomerTypeMap } from "@/hooks/use-customers";
import { useCustomerTypes } from "@/hooks/use-customer-types";
import { useCurrency } from "@/hooks/use-currency";
import { StatsCard } from "@/components/stats-card";
import { DollarSign, AlertTriangle, TrendingUp, Users, Percent, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { cn } from "@/lib/utils";

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_COLORS = [
  'hsl(160, 60%, 45%)', 'hsl(220, 70%, 55%)', 'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 55%)', 'hsl(350, 65%, 55%)', 'hsl(45, 85%, 50%)',
  'hsl(190, 70%, 45%)', 'hsl(100, 50%, 45%)',
];

export default function Dashboard() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [stackMode, setStackMode] = useState<'percent' | 'absolute'>('percent');
  
  const { data: dashboardStats, isLoading: loadingStats } = useDashboardStats();
  const { data: recentOrders, isLoading: loadingRecent } = useRecentOrders(5);
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: customerStats, isLoading: loadingCustomers } = useCustomerStats();
  const { data: customerTypeMap } = useCustomerTypeMap();
  const { data: customerTypes } = useCustomerTypes();
  const { formatCurrency, formatCurrencyShort, symbol } = useCurrency();

  const completedOrders = dashboardStats?.completedOrders || [];

  // Pie chart: lifetime revenue by customer type (must be called before early return)
  const { pieData, typeNames } = useMemo(() => {
    if (!customerTypeMap || !customerTypes || customerTypes.length === 0)
      return { pieData: [] as { name: string; value: number }[], typeNames: [] as string[] };

    const typeNameMap = new Map<number, string>();
    for (const ct of customerTypes) typeNameMap.set(ct.id, ct.name);

    const totals = new Map<string, number>();
    for (const order of completedOrders) {
      const typeId = customerTypeMap.get(order.customer_id);
      const typeName = typeId ? (typeNameMap.get(typeId) || 'Uncategorized') : 'Uncategorized';
      totals.set(typeName, (totals.get(typeName) || 0) + order.total_amount);
    }

    const sorted = Array.from(totals.entries())
      .map(([name, value]) => ({ name, value: Math.round(value / 100) }))
      .sort((a, b) => b.value - a.value);

    return { pieData: sorted, typeNames: sorted.map(d => d.name) };
  }, [completedOrders, customerTypeMap, customerTypes]);

  // Stacked bar chart: monthly revenue % by customer type (last 12 months)
  const stackedBarData = useMemo(() => {
    if (!customerTypeMap || !customerTypes || customerTypes.length === 0 || typeNames.length === 0) return [];

    const typeNameMap = new Map<number, string>();
    for (const ct of customerTypes) typeNameMap.set(ct.id, ct.name);

    const now = new Date();
    const months: { key: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(now, i);
      const s = startOfMonth(d);
      const e = endOfMonth(d);
      months.push({ key: format(s, 'yyyy-MM'), label: format(s, 'MMM yy'), start: s, end: e });
    }

    return months.map(m => {
      const row: Record<string, any> = { month: m.label };
      for (const order of completedOrders) {
        if (!order.order_date) continue;
        const od = new Date(order.order_date);
        if (od >= m.start && od <= m.end) {
          const typeId = customerTypeMap.get(order.customer_id);
          const typeName = typeId ? (typeNameMap.get(typeId) || 'Uncategorized') : 'Uncategorized';
          row[typeName] = (row[typeName] || 0) + order.total_amount / 100;
        }
      }
      return row;
    });
  }, [completedOrders, customerTypeMap, customerTypes, typeNames]);

  if (loadingStats || loadingProducts || loadingCustomers) {
    return <DashboardSkeleton />;
  }

  const totalSales = dashboardStats?.totalRevenue || 0;
  const lowStockProducts = products?.filter(p => p.stock_quantity < 10) || [];
  const totalCreditBalance = customerStats?.totalCreditBalance || 0;

  // Get available years from completed orders
  const availableYears = Array.from(new Set(
    completedOrders
      .filter(o => o.order_date)
      .map(o => new Date(o.order_date!).getFullYear())
  )).sort((a, b) => b - a);
  
  if (!availableYears.includes(currentYear)) {
    availableYears.unshift(currentYear);
  }

  // Monthly revenue chart data for selected year
  const monthlyRevenueData = MONTH_NAMES.map((month, index) => {
    const monthTotal = completedOrders
      .filter(o => {
        if (!o.order_date) return false;
        const orderDate = new Date(o.order_date);
        return orderDate.getMonth() === index && orderDate.getFullYear() === selectedYear;
      })
      .reduce((sum, order) => sum + order.total_amount, 0);
    return {
      month,
      revenue: monthTotal / 100
    };
  });

  // Chart Data: Last 7 days sales
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return format(d, 'yyyy-MM-dd');
  }).reverse();

  const chartData = last7Days.map(date => {
    const dayTotal = completedOrders
      .filter(o => o.order_date && format(new Date(o.order_date), 'yyyy-MM-dd') === date)
      .reduce((sum, o) => sum + o.total_amount, 0);
    return {
      date: format(new Date(date), 'MMM dd'),
      sales: dayTotal / 100
    };
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-lg">Overview of your business performance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Revenue"
          value={formatCurrencyShort(totalSales)}
          icon={DollarSign}
          description={`From ${completedOrders.length.toLocaleString()} completed orders`}
        />
        <StatsCard
          title="Low Stock Alerts"
          value={lowStockProducts.length}
          icon={AlertTriangle}
          description="Products with < 10 units"
          className={lowStockProducts.length > 0 ? "border-orange-200 bg-orange-50/50 dark:bg-orange-900/10 dark:border-orange-900" : ""}
        />
        <StatsCard
          title="Outstanding Credit"
          value={formatCurrencyShort(totalCreditBalance)}
          icon={Users}
          description="Total customer debt"
        />
        <StatsCard
          title="Active Customers"
          value={customerStats?.totalCustomers || 0}
          icon={TrendingUp}
          description="Registered clients"
        />
      </div>

      {/* Monthly Revenue Chart */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4 pb-2">
          <CardTitle>Monthly Revenue</CardTitle>
          <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
            <SelectTrigger className="w-[120px]" data-testid="select-year">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenueData}>
                <XAxis 
                  dataKey="month" 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${symbol}${value}`}
                />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: number) => [`${symbol}${value.toFixed(2)}`, 'Revenue']}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Revenue by Customer Type — Pie + Stacked Bar */}
      {pieData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Pie Chart */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle>Revenue by Customer Type</CardTitle>
              <CardDescription>Lifetime revenue share</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="75%"
                      innerRadius="40%"
                      paddingAngle={2}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => [`${symbol}${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Stacked Bar Chart with toggle */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4 pb-2">
              <div>
                <CardTitle>Monthly Revenue Mix</CardTitle>
                <CardDescription>Revenue by customer type — last 12 months</CardDescription>
              </div>
              <div className="flex items-center rounded-md border p-0.5">
                <Button
                  variant={stackMode === 'percent' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1"
                  onClick={() => setStackMode('percent')}
                >
                  <Percent className="h-3 w-3" />
                  %
                </Button>
                <Button
                  variant={stackMode === 'absolute' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1"
                  onClick={() => setStackMode('absolute')}
                >
                  <Hash className="h-3 w-3" />
                  Total
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stackedBarData}
                    stackOffset={stackMode === 'percent' ? 'expand' : 'none'}
                  >
                    <XAxis
                      dataKey="month"
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={
                        stackMode === 'percent'
                          ? (value: number) => `${Math.round(value * 100)}%`
                          : (value: number) => {
                              if (value >= 1000000) return `${symbol}${(value / 1000000).toFixed(1)}M`;
                              if (value >= 1000) return `${symbol}${(value / 1000).toFixed(0)}k`;
                              return `${symbol}${value}`;
                            }
                      }
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number, name: string) => [`${symbol}${Math.round(value).toLocaleString()}`, name]}
                    />
                    <Legend />
                    {typeNames.map((name, index) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="a"
                        fill={TYPE_COLORS[index % TYPE_COLORS.length]}
                        radius={index === typeNames.length - 1 ? [2, 2, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Sales Trend (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis 
                    dataKey="date" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${symbol}${value}`}
                  />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 shadow-sm">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loadingRecent ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : (
                recentOrders?.map(order => (
                  <div key={order.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{order.customer?.name}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(order.created_at!), 'MMM dd, HH:mm')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold text-sm">{formatCurrency(order.total_amount)}</span>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider",
                        order.status === 'completed' ? "bg-green-100 text-green-700" :
                        order.status === 'new' ? "bg-blue-100 text-blue-700" :
                        order.status === 'in-process' ? "bg-yellow-100 text-yellow-700" :
                        order.status === 'ready' ? "bg-purple-100 text-purple-700" :
                        order.status === 'cancelled' ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      )}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8 p-4">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-7">
        <Skeleton className="col-span-4 h-[400px] rounded-xl" />
        <Skeleton className="col-span-3 h-[400px] rounded-xl" />
      </div>
    </div>
  );
}
