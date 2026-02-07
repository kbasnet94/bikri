import { useState } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useProducts } from "@/hooks/use-products";
import { useCustomers } from "@/hooks/use-customers";
import { useCurrency } from "@/hooks/use-currency";
import { StatsCard } from "@/components/stats-card";
import { DollarSign, AlertTriangle, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Dashboard() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const { data: orders, isLoading: loadingOrders } = useOrders();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: customers, isLoading: loadingCustomers } = useCustomers();
  const { formatCurrency, formatCurrencyShort, symbol } = useCurrency();

  if (loadingOrders || loadingProducts || loadingCustomers) {
    return <DashboardSkeleton />;
  }

  // Calculate metrics
  const completedOrders = orders?.filter(o => o.status === 'completed') || [];
  const totalSales = completedOrders.reduce((sum, order) => sum + order.total_amount, 0);
  const lowStockProducts = products?.filter(p => p.stock_quantity < 10) || [];
  const totalCreditBalance = customers?.reduce((sum, c) => sum + Math.max(0, c.current_balance), 0) || 0;

  // Get available years from orders
  const availableYears = Array.from(new Set(
    completedOrders
      .filter(o => o.order_date)
      .map(o => new Date(o.order_date!).getFullYear())
  )).sort((a, b) => b - a);
  
  // Include current year if not in list
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
          description="Lifetime sales volume"
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
          value={customers?.length || 0}
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
              {orders?.slice(0, 5).map(order => (
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
                      order.status === 'pending' ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
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
