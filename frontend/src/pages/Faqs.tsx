import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, HelpCircle, Loader2, Link, AlertTriangle, Crosshair } from "lucide-react";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import LimitWarningBanner from "@/components/LimitWarningBanner";
import { Badge } from "@/components/ui/badge";
import FaqMediaUpload from "@/components/faqs/FaqMediaUpload";

interface Faq {
  id: string;
  question: string;
  answer: string;
  product_id: string | null;
  is_active: boolean;
  is_tracked: boolean;
  media_urls: string[] | null;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
}

export default function Faqs() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { effectiveUserId } = useStaffAccess();
  const { canAddFaq, usage, limits, isPaused } = usePlanLimits();

  // Form state
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [isTracked, setIsTracked] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      const [faqsRes, productsRes] = await Promise.all([
        supabase.from("faqs").select("*").order("created_at", { ascending: false }),
        supabase.from("products").select("id, name").eq("is_active", true),
      ]);

      if (faqsRes.error) throw faqsRes.error;
      if (productsRes.error) throw productsRes.error;

      setFaqs(faqsRes.data || []);
      setProducts(productsRes.data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setQuestion("");
    setAnswer("");
    setProductId("");
    setIsActive(true);
    setIsTracked(false);
    setMediaUrls([]);
    setEditingFaq(null);
  };

  const openEditDialog = (faq: Faq) => {
    setEditingFaq(faq);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setProductId(faq.product_id || "");
    setIsActive(faq.is_active);
    setIsTracked(faq.is_tracked);
    setMediaUrls(faq.media_urls || []);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const faqData = {
        question,
        answer,
        product_id: productId || null,
        is_active: isActive,
        is_tracked: isTracked,
        media_urls: mediaUrls,
        user_id: effectiveUserId || user!.id,
      };

      if (editingFaq) {
        const { error } = await supabase
          .from("faqs")
          .update(faqData)
          .eq("id", editingFaq.id);

        if (error) throw error;
        toast({ title: "FAQ updated successfully" });
      } else {
        if (!canAddFaq) {
          toast({ title: "FAQ limit reached", description: `Your plan allows ${limits?.max_faqs} FAQs. Upgrade to add more.`, variant: "destructive" });
          setSaving(false);
          return;
        }
        const { error } = await supabase
          .from("faqs")
          .insert([faqData]);

        if (error) throw error;
        toast({ title: "FAQ created successfully" });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error saving FAQ",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this FAQ?")) return;

    try {
      const { error } = await supabase.from("faqs").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "FAQ deleted successfully" });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error deleting FAQ",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getProductName = (productId: string | null) => {
    if (!productId) return null;
    const product = products.find(p => p.id === productId);
    return product?.name;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <LimitWarningBanner type="faqs" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">FAQs</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Manage frequently asked questions for the chatbot
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <div className="flex flex-col items-end">
              <DialogTrigger asChild>
                <Button disabled={isPaused || (!canAddFaq && !editingFaq)} className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add FAQ
                </Button>
              </DialogTrigger>
              {!canAddFaq && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  Limit reached ({usage?.faqs}/{limits?.max_faqs})
                </p>
              )}
            </div>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingFaq ? "Edit FAQ" : "Add New FAQ"}</DialogTitle>
                <DialogDescription>
                  {editingFaq ? "Update the FAQ details" : "Create a new FAQ for your chatbot"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="question">Question *</Label>
                  <Input
                    id="question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g., What are your shipping options?"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="answer">Answer *</Label>
                  <Textarea
                    id="answer"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Provide a detailed answer..."
                    rows={4}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Attachments (Optional)</Label>
                  <FaqMediaUpload value={mediaUrls} onChange={setMediaUrls} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="product">Link to Product (Optional)</Label>
                    <Select value={productId || "none"} onValueChange={(val) => setProductId(val === "none" ? "" : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No product link</SelectItem>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Link this FAQ to a specific product for contextual responses
                    </p>
                  </div>
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="active"
                        checked={isActive}
                        onCheckedChange={setIsActive}
                      />
                      <Label htmlFor="active">Active</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="tracked"
                        checked={isTracked}
                        onCheckedChange={setIsTracked}
                      />
                      <Label htmlFor="tracked" className="flex items-center gap-1.5">
                        <Crosshair className="h-3.5 w-3.5" />
                        Track Usage
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When tracked, customers who trigger this FAQ will be highlighted in Chats
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : editingFaq ? (
                      "Update FAQ"
                    ) : (
                      "Create FAQ"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>FAQ List</CardTitle>
            <CardDescription>
              {faqs.length} FAQ{faqs.length !== 1 ? "s" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : faqs.length === 0 ? (
              <div className="text-center py-8">
                <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No FAQs yet. Add your first FAQ to help customers.</p>
              </div>
            ) : (
              <>
                {/* Mobile: Card layout */}
                <div className="space-y-3 md:hidden">
                  {faqs.map((faq) => (
                    <div key={faq.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium line-clamp-2">{faq.question}</p>
                            {faq.is_tracked && (
                              <Badge variant="outline" className="flex-shrink-0 gap-1 text-xs border-primary/50 text-primary">
                                <Crosshair className="h-3 w-3" />
                                Tracked
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{faq.answer}</p>
                        </div>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                          faq.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {faq.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        {faq.product_id ? (
                          <span className="inline-flex items-center gap-1 text-sm text-primary">
                            <Link className="h-3 w-3" />
                            {getProductName(faq.product_id)}
                          </span>
                        ) : (
                          <span />
                        )}
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(faq)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(faq.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: Table layout */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Question</TableHead>
                        <TableHead>Linked Product</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {faqs.map((faq) => (
                        <TableRow key={faq.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-medium line-clamp-1">{faq.question}</p>
                                <p className="text-sm text-muted-foreground line-clamp-1">{faq.answer}</p>
                              </div>
                              {faq.is_tracked && (
                                <Badge variant="outline" className="flex-shrink-0 gap-1 text-xs border-primary/50 text-primary">
                                  <Crosshair className="h-3 w-3" />
                                  Tracked
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {faq.product_id ? (
                              <span className="inline-flex items-center gap-1 text-sm text-primary">
                                <Link className="h-3 w-3" />
                                {getProductName(faq.product_id)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              faq.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {faq.is_active ? "Active" : "Inactive"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(faq)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(faq.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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
      </div>
    </DashboardLayout>
  );
}
