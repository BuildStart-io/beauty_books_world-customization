import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Eye, ShoppingCart, Loader2, Phone, MapPin, CreditCard, Package, MessageSquare, Trash2, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import LimitWarningBanner from "@/components/LimitWarningBanner";
import { useAuth } from "@/hooks/useAuth";
import { useStaffAccess } from "@/hooks/useStaffAccess";

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  whatsapp_phone: string | null;
  district: string | null;
  customer_address: string | null;
  order_items: any;
  custom_fields?: any;
  special_instructions: string | null;
  payment_method: string;
  status: string;
  total_amount: number;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const navigate = useNavigate();

  const { user } = useAuth();
  const { effectiveUserId } = useStaffAccess();
  const currentUserId = effectiveUserId || user?.id;

  const fetchOrders = async () => {
    try {
      let query = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching orders",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) throw error;
      toast({ title: "Order status updated" });
      fetchOrders();
      
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
    } catch (error: any) {
      toast({
        title: "Error updating order",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateHandoff = async (phone: string | null, active: boolean) => {
    if (!phone) return;
    if (!currentUserId) {
      toast({ title: "Authentication required", variant: "destructive" });
      return;
    }
    try {
      if (active) {
        const { error } = await supabase
          .from("chat_takeovers" as any)
          .upsert(
            {
              user_id: currentUserId,
              phone_number: phone,
              is_taken_over: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,phone_number" }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("chat_takeovers" as any)
          .delete()
          .eq("user_id", currentUserId)
          .eq("phone_number", phone);
        if (error) throw error;
      }
      toast({ title: active ? "Manual handoff activated" : "Manual handoff deactivated" });
    } catch (error: any) {
      toast({ title: "Error updating handoff", description: error.message, variant: "destructive" });
    }
  };

  const deleteOrder = async (orderId: string) => {
    try {
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
      toast({ title: "Order deleted" });
      if (selectedOrder?.id === orderId) setSelectedOrder(null);
      fetchOrders();
    } catch (error: any) {
      toast({ title: "Error deleting order", description: error.message, variant: "destructive" });
    }
  };

  const exportOrders = (type: "csv" | "excel") => {
    if (orders.length === 0) {
      toast({ title: "No orders to export", variant: "destructive" });
      return;
    }

    const headers = [
      "Order ID",
      "Customer Name",
      "Phone",
      "District",
      "Address",
      "Items",
      "Purchase Type",
      "Quantity",
      "Packaging",
      "Branding / Customization",
      "Sample Request",
      "Discount %",
      "Discount Amount",
      "Quotation Amount",
      "Quotation Status",
      "Payment Method",
      "Payment Status",
      "Order Status",
      "Follow-up Status",
      "Manual Handoff",
      "Date"
    ];
    const rows = orders.map((o) => {
      const items = Array.isArray(o.order_items)
        ? (o.order_items as any[]).map((i: any) => `${i.name} x${i.quantity}`).join("; ")
        : "";
      return [
        o.id.slice(0, 8),
        o.customer_name,
        o.customer_phone,
        o.district || "",
        o.customer_address || "",
        items,
        o.custom_fields?.purchase_type || "",
        o.custom_fields?.quantity || "",
        o.custom_fields?.packaging_option || "",
        o.custom_fields?.branding_req || "",
        o.custom_fields?.sample_request || "",
        o.custom_fields?.discount_percentage || "0",
        o.custom_fields?.discount_amount || "0",
        Number(o.total_amount || 0).toFixed(2),
        o.custom_fields?.quotation_status || "Sent",
        o.payment_method === "cod" ? "Cash on Delivery" : "Bank Transfer",
        o.custom_fields?.payment_status || "Pending",
        o.status,
        o.custom_fields?.follow_up_status || "Pending",
        o.custom_fields?.manual_handoff_status || "Automated",
        format(new Date(o.created_at), "yyyy-MM-dd HH:mm"),
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: type === "excel"
        ? "application/vnd.ms-excel;charset=utf-8"
        : "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filterLabel = statusFilter === "all" ? "all" : statusFilter;
    a.download = `orders-${filterLabel}-${format(new Date(), "yyyy-MM-dd")}.${type === "excel" ? "xls" : "csv"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: `Orders exported as ${type === "excel" ? "Excel" : "CSV"}` });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <LimitWarningBanner type="orders" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Orders</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Manage customer orders from WhatsApp
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground hidden sm:inline">Filter:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => exportOrders("csv")} disabled={orders.length === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportOrders("excel")} disabled={orders.length === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              Excel
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Order List</CardTitle>
            <CardDescription>
              {orders.length} order{orders.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {statusFilter === "all" 
                    ? "No orders yet. Orders will appear here when customers order via WhatsApp." 
                    : `No ${statusFilter} orders found.`}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile: Card layout */}
                <div className="space-y-3 md:hidden">
                  {orders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{order.customer_name}</p>
                          <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                        </div>
                        <Badge className={statusColors[order.status]}>{order.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">LKR {Number(order.total_amount || 0).toFixed(2)}</span>
                        <span className="text-muted-foreground">{format(new Date(order.created_at), "MMM d, yyyy")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelectedOrder(order)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Order</AlertDialogTitle>
                              <AlertDialogDescription>This will permanently delete this order. This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteOrder(order.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: Table layout */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Purchase Type</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.customer_name}</TableCell>
                          <TableCell>{order.customer_phone}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              <Badge variant="secondary" className="font-normal text-xs">
                                {order.custom_fields?.purchase_type || "Standard"}
                              </Badge>
                              {String(order.custom_fields?.branding_req || "").toLowerCase() === "yes" && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 font-semibold text-[10px] px-1.5 py-0">
                                  Branding (LKR 5,000)
                                </Badge>
                              )}
                              {(order.custom_fields?.manual_handoff_status === "Manual Follow-Up Required" || order.custom_fields?.follow_up_status === "Manual Follow-Up Required") && (
                                <Badge variant="outline" className="text-amber-700 border-amber-400 dark:text-amber-300 text-[10px] px-1.5 py-0 font-medium">
                                  Manual Follow-Up
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>LKR {Number(order.total_amount || 0).toFixed(2)}</TableCell>
                          <TableCell className="capitalize">
                            {order.payment_method === "cod" ? "Cash on Delivery" : "Bank Transfer"}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={order.status}
                              onValueChange={(value) => updateOrderStatus(order.id, value)}
                            >
                              <SelectTrigger className="w-[130px]">
                                <Badge className={statusColors[order.status]}>
                                  {order.status}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((status) => (
                                  <SelectItem key={status.value} value={status.value}>
                                    {status.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {format(new Date(order.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Order</AlertDialogTitle>
                                    <AlertDialogDescription>This will permanently delete this order. This action cannot be undone.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteOrder(order.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Order Details Dialog */}
        <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order Details</DialogTitle>
              <DialogDescription>
                Order #{selectedOrder?.id.slice(0, 8)}
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-6">
                {/* Customer Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Customer</h4>
                    <p className="font-medium">{selectedOrder.customer_name}</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Contact Number
                    </h4>
                    <p>{selectedOrder.customer_phone}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Customer Address
                    </h4>
                    {selectedOrder.district && <p className="font-medium">District: {selectedOrder.district}</p>}
                    {selectedOrder.customer_address && <p>{selectedOrder.customer_address}</p>}
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Purchase Type</h4>
                    <p>{selectedOrder.custom_fields?.purchase_type || "N/A"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Packaging Option</h4>
                    <p>{selectedOrder.custom_fields?.packaging_option || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Branding / Customization</h4>
                    <p>{selectedOrder.custom_fields?.branding_req || "N/A"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Sample Request</h4>
                    <p>{selectedOrder.custom_fields?.sample_request || "No"}</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Follow-up Status</h4>
                    <Badge 
                      variant={selectedOrder.custom_fields?.follow_up_status === "Manual Follow-Up Required" ? "default" : "outline"}
                      className={selectedOrder.custom_fields?.follow_up_status === "Manual Follow-Up Required" ? "bg-amber-600 hover:bg-amber-700 text-white font-semibold" : ""}
                    >
                      {selectedOrder.custom_fields?.follow_up_status || "Pending"}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Manual Handoff Status</h4>
                    <Badge 
                      variant={selectedOrder.custom_fields?.manual_handoff_status === "Manual Follow-Up Required" ? "default" : "outline"}
                      className={selectedOrder.custom_fields?.manual_handoff_status === "Manual Follow-Up Required" ? "bg-amber-600 hover:bg-amber-700 text-white font-semibold" : ""}
                    >
                      {selectedOrder.custom_fields?.manual_handoff_status || "Automated"}
                    </Badge>
                  </div>
                </div>



                {/* Order Items & Quotation */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-1">
                    <Package className="h-3 w-3" /> Selected Products & Quantity
                  </h4>
                  <div className="border rounded-lg divide-y">
                    {(Array.isArray(selectedOrder.order_items) ? selectedOrder.order_items : []).map((item: any, index: number) => (
                      <div key={index} className="p-3 flex justify-between">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.variations && (
                            <p className="text-sm text-muted-foreground">
                              {Object.entries(item.variations).map(([key, value]) => `${key}: ${value}`).join(", ")}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-medium">LKR {item.price}</p>
                          <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Discount %</p>
                    <p className="font-medium">{selectedOrder.custom_fields?.discount_percentage || "0"}%</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Discount Amount</p>
                    <p className="font-medium">LKR {selectedOrder.custom_fields?.discount_amount || "0.00"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Quotation Amount</p>
                    <p className="font-bold text-lg">LKR {Number(selectedOrder.total_amount || 0).toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-1">
                      <CreditCard className="h-3 w-3" /> Payment Method
                    </h4>
                    <p className="capitalize">
                      {selectedOrder.payment_method === "cod" ? "Cash on Delivery" : "Bank Transfer"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Payment Status</h4>
                    <div className="flex items-center gap-2">
                      <Badge className={selectedOrder.custom_fields?.payment_status === "verified" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                        {selectedOrder.custom_fields?.payment_status || "Pending"}
                      </Badge>
                      {selectedOrder.status === "pending" && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => updateOrderStatus(selectedOrder.id, "processing")}
                        >
                          Verify Payment
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {selectedOrder.special_instructions && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Special Instructions</h4>
                    <p className="text-sm bg-muted p-3 rounded-lg">{selectedOrder.special_instructions}</p>
                  </div>
                )}

                {/* Status Update */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t">
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm">Order Status</h4>
                    <Select
                      value={selectedOrder.status}
                      onValueChange={(value) => updateOrderStatus(selectedOrder.id, value)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm">Quotation Status</h4>
                    <Badge variant="outline">{selectedOrder.custom_fields?.quotation_status || "Sent"}</Badge>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => updateHandoff(selectedOrder.whatsapp_phone || selectedOrder.customer_phone, true)}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Take Over Chat
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const chatPhone = selectedOrder.whatsapp_phone || selectedOrder.customer_phone;
                        setSelectedOrder(null);
                        navigate(`/dashboard/conversations?phone=${encodeURIComponent(chatPhone)}`);
                      }}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      See Chat
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(selectedOrder.created_at), "PPp")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
