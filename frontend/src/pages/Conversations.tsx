import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Search,
  User,
  Send,
  Loader2,
  Phone,
  ArrowLeft,
  Bot,
  HandMetal,
  Trash2,
  Crosshair,
  AlertCircle,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Message {
  id: string;
  phone_number: string;
  message: string;
  direction: string;
  message_type: string | null;
  metadata: any;
  created_at: string;
}

interface ChatThread {
  phone_number: string;
  last_message: string;
  last_time: string;
  sender_name: string;
  unread_count: number;
}

interface TrackedPhone {
  phone_number: string;
  faq_questions: string[];
}

export default function Conversations() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "attention">("all");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [takenOverChats, setTakenOverChats] = useState<Set<string>>(new Set());
  const [togglingTakeover, setTogglingTakeover] = useState(false);
  const [trackedPhones, setTrackedPhones] = useState<Map<string, string[]>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { effectiveUserId } = useStaffAccess();
  const [searchParams, setSearchParams] = useSearchParams();

  // Fetch tracked FAQ usage phones
  const fetchTrackedPhones = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("faq_usage_logs" as any)
        .select("phone_number, faq_id, faqs!inner(question)")
        .order("created_at", { ascending: false });

      if (data) {
        const phoneMap = new Map<string, string[]>();
        for (const row of data as any[]) {
          const phone = row.phone_number;
          const question = row.faqs?.question || "Unknown FAQ";
          if (!phoneMap.has(phone)) {
            phoneMap.set(phone, []);
          }
          const existing = phoneMap.get(phone)!;
          if (!existing.includes(question)) {
            existing.push(question);
          }
        }
        setTrackedPhones(phoneMap);
      }
    } catch (err) {
      console.error("Error fetching tracked phones:", err);
    }
  }, [user]);

  // Auto-select phone from URL query param
  useEffect(() => {
    const phoneParam = searchParams.get("phone");
    if (phoneParam && !selectedPhone) {
      setSelectedPhone(phoneParam);
      fetchMessages(phoneParam);
      // Clean up the URL
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  // Helper to match phones across different formats (e.g. 94740237915, 0740237915, +94740237915)
  const isPhoneMatch = useCallback((targetPhone: string, phoneSet: Set<string>) => {
    if (!targetPhone) return false;
    if (phoneSet.has(targetPhone)) return true;
    const digits = targetPhone.replace(/\D/g, "");
    const last9 = digits.slice(-9);
    if (last9.length >= 7) {
      for (const p of phoneSet) {
        const pDigits = p.replace(/\D/g, "");
        if (pDigits === digits || pDigits.endsWith(last9) || digits.endsWith(pDigits.slice(-9))) return true;
      }
    }
    return false;
  }, []);

  // Fetch all takeover states and manual handoff orders for the user
  const fetchTakeovers = useCallback(async () => {
    const targetUserId = effectiveUserId || user?.id;
    if (!targetUserId) return;
    const { data } = await supabase
      .from("chat_takeovers" as any)
      .select("phone_number")
      .eq("user_id", targetUserId)
      .eq("is_taken_over", true);

    const manualPhones = new Set<string>();
    if (data) {
      (data as any[]).forEach((d: any) => manualPhones.add(d.phone_number));
    }

    // Also fetch any orders requiring manual follow-up (branding_req === "Yes" or manual_handoff_status === "Manual Follow-Up Required")
    const { data: manualOrders } = await supabase
      .from("orders")
      .select("customer_phone, whatsapp_phone, custom_fields")
      .eq("user_id", targetUserId);

    if (manualOrders) {
      for (const ord of manualOrders as any[]) {
        const cf = ord.custom_fields;
        const needsHandoff = cf?.manual_handoff_status === "Manual Follow-Up Required" || 
                             cf?.follow_up_status === "Manual Follow-Up Required" ||
                             String(cf?.branding_req || "").toLowerCase() === "yes";
        if (needsHandoff) {
          if (ord.whatsapp_phone) manualPhones.add(ord.whatsapp_phone);
          if (ord.customer_phone) manualPhones.add(ord.customer_phone);
        }
      }
    }

    setTakenOverChats(manualPhones);
  }, [user, effectiveUserId]);

  useEffect(() => {
    fetchTakeovers();
    fetchTrackedPhones();
  }, [fetchTakeovers, fetchTrackedPhones]);

  // Realtime subscription for chat_takeovers
  useEffect(() => {
    const channel = supabase
      .channel("chat-takeovers-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_takeovers" },
        () => {
          fetchTakeovers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTakeovers]);

  const toggleTakeover = useCallback(async (phoneNumber: string) => {
    if (!user || togglingTakeover) return;
    setTogglingTakeover(true);
    try {
      const isTakenOver = isPhoneMatch(phoneNumber, takenOverChats);
      const digits = phoneNumber.replace(/\D/g, "");
      const last9 = digits.length >= 9 ? digits.slice(-9) : digits;
      if (isTakenOver) {
        await (supabase.from("chat_takeovers" as any) as any)
          .delete()
          .eq("user_id", effectiveUserId || user.id)
          .ilike("phone_number", `%${last9}`);
        setTakenOverChats(prev => {
          const next = new Set<string>();
          prev.forEach(p => {
            const pDigits = p.replace(/\D/g, "");
            const pLast9 = pDigits.length >= 9 ? pDigits.slice(-9) : pDigits;
            if (pLast9 !== last9) next.add(p);
          });
          return next;
        });
        toast({ title: "Bot re-enabled for this chat" });
      } else {
        await (supabase.from("chat_takeovers" as any) as any)
          .upsert({
            user_id: effectiveUserId || user.id,
            phone_number: phoneNumber,
            is_taken_over: true,
          }, { onConflict: "user_id,phone_number" });
        setTakenOverChats(prev => new Set(prev).add(phoneNumber));
        toast({ title: "Bot paused — you're in control" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTogglingTakeover(false);
    }
  }, [user, effectiveUserId, takenOverChats, togglingTakeover, toast]);

  const deleteThread = async (phoneNumber: string) => {
    try {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("phone_number", phoneNumber);
      if (error) throw error;
      await (supabase.from("chat_takeovers" as any) as any)
        .delete()
        .eq("phone_number", phoneNumber);
      if (selectedPhone === phoneNumber) {
        setSelectedPhone(null);
        setMessages([]);
      }
      setThreads((prev) => prev.filter((t) => t.phone_number !== phoneNumber));
      toast({ title: "Conversation deleted" });
    } catch (error: any) {
      toast({ title: "Error deleting conversation", description: error.message, variant: "destructive" });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchThreads = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const threadMap = new Map<string, ChatThread>();
      (data || []).forEach((msg) => {
        const existing = threadMap.get(msg.phone_number);
        const senderName =
          msg.direction === "inbound"
            ? (msg.metadata as any)?.senderName || "Unknown"
            : "";

        if (!existing) {
          threadMap.set(msg.phone_number, {
            phone_number: msg.phone_number,
            last_message: msg.message,
            last_time: msg.created_at,
            sender_name: senderName || "Unknown",
            unread_count: 0,
          });
        } else if (senderName && existing.sender_name === "Unknown") {
          existing.sender_name = senderName;
        }
      });

      setThreads(Array.from(threadMap.values()));
    } catch (error: any) {
      console.error("Error fetching threads:", error);
      toast({
        title: "Error loading conversations",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchMessages = useCallback(
    async (phoneNumber: string) => {
      setMessagesLoading(true);
      try {
        const { data, error } = await supabase
          .from("conversations")
          .select("*")
          .eq("phone_number", phoneNumber)
          .order("created_at", { ascending: true });

        if (error) throw error;
        setMessages(data || []);
        setTimeout(scrollToBottom, 100);
      } catch (error: any) {
        toast({
          title: "Error loading messages",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setMessagesLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel("conversations-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        (payload) => {
          const newMsg = payload.new as Message;

          setThreads((prev) => {
            const existing = prev.find(
              (t) => t.phone_number === newMsg.phone_number
            );
            if (existing) {
              return prev.map((t) =>
                t.phone_number === newMsg.phone_number
                  ? {
                      ...t,
                      last_message: newMsg.message,
                      last_time: newMsg.created_at,
                    }
                  : t
              );
            }
            return [
              {
                phone_number: newMsg.phone_number,
                last_message: newMsg.message,
                last_time: newMsg.created_at,
                sender_name:
                  (newMsg.metadata as any)?.senderName || "Unknown",
                unread_count: 0,
              },
              ...prev,
            ];
          });

          if (newMsg.phone_number === selectedPhone) {
            setMessages((prev) => [...prev, newMsg]);
            setTimeout(scrollToBottom, 100);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedPhone]);

  const handleSelectThread = (phoneNumber: string) => {
    setSelectedPhone(phoneNumber);
    fetchMessages(phoneNumber);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedPhone || sending) return;

    setSending(true);
    try {
      const ownerId = effectiveUserId || user!.id;
      const { data: sessionData, error: sessionError } = await supabase
        .from("user_wsender_sessions" as any)
        .select("session_api_key, session_id")
        .eq("user_id", ownerId)
        .limit(1)
        .maybeSingle();

      if (sessionError) throw sessionError;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: selectedPhone,
            message: replyText,
            sessionApiKey: (sessionData as any)?.session_api_key || (sessionData as any)?.session_id,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to send message");
      }

      await supabase.from("conversations").insert({
        phone_number: selectedPhone,
        message: replyText,
        direction: "outbound",
        message_type: "text",
        user_id: ownerId,
      });

      setReplyText("");
      toast({ title: "Message sent" });
    } catch (error: any) {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const formatWhatsAppText = (text: string) => {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/~(.+?)~/g, '<del>$1</del>');
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (hours < 24) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (hours < 48) return "Yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };
  const attentionCount = threads.filter((t) => isPhoneMatch(t.phone_number, takenOverChats)).length;
  const isSelectedManualAttention = selectedPhone ? isPhoneMatch(selectedPhone, takenOverChats) : false;
  const isSelectedTracked = selectedPhone ? trackedPhones.has(selectedPhone) : false;

  const filteredThreads = threads.filter((t) => {
    const matchesSearch =
      t.phone_number.includes(searchQuery) ||
      t.sender_name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterMode === "attention") {
      return isPhoneMatch(t.phone_number, takenOverChats);
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-7rem)] lg:h-[calc(100vh-8rem)] flex flex-col">
        <div className={cn("mb-4", selectedPhone && "hidden md:block")}>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Conversations</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            WhatsApp chat history and live messages
          </p>
        </div>

        <Card className="flex-1 flex overflow-hidden">
          {/* Thread List */}
          <div
            className={cn(
              "w-full md:w-80 border-r flex flex-col",
              selectedPhone ? "hidden md:flex" : "flex"
            )}
          >
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1.5 pt-0.5">
                <Button
                  type="button"
                  variant={filterMode === "all" ? "default" : "secondary"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setFilterMode("all")}
                >
                  All ({threads.length})
                </Button>
                <Button
                  type="button"
                  variant={filterMode === "attention" ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-7 text-xs px-2.5 gap-1.5",
                    filterMode === "attention"
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                  )}
                  onClick={() => setFilterMode("attention")}
                >
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  Needs Attention ({attentionCount})
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {filterMode === "attention" ? "No chats need attention" : "No conversations yet"}
                  </p>
                </div>
              ) : (
                <TooltipProvider>
                  {filteredThreads.map((thread) => {
                    const isTracked = trackedPhones.has(thread.phone_number);
                    const trackedFaqs = trackedPhones.get(thread.phone_number) || [];
                    const isManualAttention = isPhoneMatch(thread.phone_number, takenOverChats);
                    
                    return (
                      <button
                        key={thread.phone_number}
                        onClick={() => handleSelectThread(thread.phone_number)}
                        className={cn(
                          "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors relative",
                          selectedPhone === thread.phone_number && "bg-muted",
                          isTracked && "border-l-4 border-l-primary bg-primary/5",
                          isManualAttention && "border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center gap-1 flex-shrink-0">
                            <div className={cn(
                              "h-10 w-10 rounded-full flex items-center justify-center",
                              isManualAttention
                                ? "bg-amber-500/20 ring-2 ring-amber-500 text-amber-600 dark:text-amber-400"
                                : isTracked
                                  ? "bg-primary/20 ring-2 ring-primary text-primary"
                                  : "bg-primary/10 text-primary"
                            )}>
                              {isManualAttention ? (
                                <AlertCircle className="h-5 w-5" />
                              ) : (
                                <User className="h-5 w-5" />
                              )}
                            </div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <span
                                  role="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </span>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently delete all messages with {thread.phone_number}. This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteThread(thread.phone_number)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                <p className={cn(
                                  "font-medium text-sm truncate",
                                  isManualAttention ? "text-amber-700 dark:text-amber-400 font-bold" : isTracked ? "text-primary font-bold" : ""
                                )}>
                                  {thread.sender_name}
                                </p>
                                {isManualAttention && (
                                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-semibold flex items-center gap-1 px-1.5 py-0">
                                    <AlertCircle className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
                                    Need Manual Attention
                                  </Badge>
                                )}
                                {isTracked && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <Crosshair className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs">
                                      <p className="font-medium text-xs mb-1">Triggered tracked FAQs:</p>
                                      <ul className="text-xs space-y-0.5">
                                        {trackedFaqs.map((q, i) => (
                                          <li key={i} className="truncate">• {q}</li>
                                        ))}
                                      </ul>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                                {formatTime(thread.last_time)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {thread.phone_number}
                            </p>
                            <p className="text-sm text-muted-foreground truncate mt-0.5">
                              {thread.last_message}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </TooltipProvider>
              )}
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div
            className={cn(
              "flex-1 flex flex-col",
              !selectedPhone ? "hidden md:flex" : "flex"
            )}
          >
            {selectedPhone ? (
              <>
                {/* Chat Header */}
                <div className="flex items-center gap-3 p-4 border-b bg-card">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={() => setSelectedPhone(null)}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center",
                    isSelectedManualAttention
                      ? "bg-amber-500/20 ring-2 ring-amber-500 text-amber-600 dark:text-amber-400"
                      : isSelectedTracked
                        ? "bg-primary/20 ring-2 ring-primary text-primary"
                        : "bg-primary/10 text-primary"
                  )}>
                    {isSelectedManualAttention ? (
                      <AlertCircle className="h-5 w-5" />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn(
                        "font-medium text-sm",
                        isSelectedManualAttention
                          ? "text-amber-700 dark:text-amber-400 font-bold"
                          : isSelectedTracked && "text-primary font-bold"
                      )}>
                        {threads.find((t) => t.phone_number === selectedPhone)
                          ?.sender_name || "Unknown"}
                      </p>
                      {isSelectedManualAttention && (
                        <Badge variant="outline" className="gap-1 text-xs border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                          <AlertCircle className="h-3 w-3" />
                          Need Manual Attention
                        </Badge>
                      )}
                      {isSelectedTracked && (
                        <Badge variant="outline" className="gap-1 text-xs border-primary/50 text-primary">
                          <Crosshair className="h-3 w-3" />
                          FAQ Tracked
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedPhone}
                    </p>
                  </div>
                  <Button
                    variant={isSelectedManualAttention ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleTakeover(selectedPhone)}
                    disabled={togglingTakeover}
                    className={cn(
                      "gap-1.5",
                      isSelectedManualAttention && "bg-amber-600 hover:bg-amber-700 text-white"
                    )}
                  >
                    {isSelectedManualAttention ? (
                      <>
                        <Bot className="h-4 w-4" />
                        <span className="hidden sm:inline">Resume Bot</span>
                      </>
                    ) : (
                      <>
                        <HandMetal className="h-4 w-4" />
                        <span className="hidden sm:inline">Take Over Chat</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            msg.direction === "outbound"
                              ? "justify-end"
                              : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                              msg.direction === "outbound"
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-muted rounded-bl-md"
                            )}
                          >
                            <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.message) }} />
                            <p
                              className={cn(
                                "text-[10px] mt-1",
                                msg.direction === "outbound"
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground"
                              )}
                            >
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Manual Attention Banner */}
                {isSelectedManualAttention && (
                  <div className="px-3 py-1.5 bg-amber-500/15 border-t border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                      <span><strong>Manual Mode Active</strong> — Bot is paused for this customer. You are chatting directly.</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleTakeover(selectedPhone)}
                      className="h-6 text-xs text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 px-2 font-semibold"
                    >
                      Resume Bot
                    </Button>
                  </div>
                )}

                {/* Reply Input */}
                <div className="p-3 border-t bg-card">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendReply();
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1"
                      disabled={sending}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!replyText.trim() || sending}
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    Select a conversation
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Choose a chat from the list to view messages
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
