import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useListVendors, getListVendorsQueryKey,
  useCreateVendor,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Search, Plus, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Vendors() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", bankName: "", accountNumber: "", phone: "", email: "" });

  const { data, isLoading } = useListVendors(search ? { search } : undefined, {
    query: { queryKey: getListVendorsQueryKey(search ? { search } : undefined) },
  });

  const createVendor = useCreateVendor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListVendorsQueryKey() });
        setShowCreate(false);
        setForm({ name: "", bankName: "", accountNumber: "", phone: "", email: "" });
        toast({ title: "Vendor created" });
      },
      onError: () => toast({ title: "Failed to create vendor", variant: "destructive" }),
    },
  });

  const canOperate = user?.role === "md" || user?.role === "payment_assistant";

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Vendors</h1>
          <p className="text-muted-foreground text-sm font-medium">Beneficiaries and payment counterparties.</p>
        </div>
        {canOperate && (
          <Button className="font-semibold shadow-sm" onClick={() => setShowCreate(true)} data-testid="button-create-vendor">
            <Plus className="w-4 h-4 mr-2" /> Add Vendor
          </Button>
        )}
      </div>

      <Card className="shadow-sm">
        <div className="p-4 border-b flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted/50 border-none"
              data-testid="input-vendor-search"
            />
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1,2,3,4].map(i => (
                <div key={i} className="p-4 flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : !data?.vendors?.length ? (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building2 className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-bold">No vendors found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-2">No vendors match your search.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.vendors.map((vendor) => (
                <Link key={vendor.id} href={`/vendors/${vendor.id}`}>
                  <div className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer group" data-testid={`row-vendor-${vendor.id}`}>
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-foreground group-hover:text-primary transition-colors truncate block">{vendor.name}</span>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        {[vendor.bankName, vendor.accountNumber].filter(Boolean).join(" · ") || "No bank details"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono text-muted-foreground">{formatCurrency(vendor.outstandingBalance)} outstanding</p>
                      {vendor.email && <p className="text-xs text-muted-foreground/70">{vendor.email}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Vendor</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Vendor Name *</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Supplies Ltd" data-testid="input-vendor-name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Bank Name</Label>
              <Input value={form.bankName} onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="GTBank" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Account Number</Label>
              <Input value={form.accountNumber} onChange={(e) => setForm(f => ({ ...f, accountNumber: e.target.value }))} placeholder="0123456789" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+234..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="vendor@example.com" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!form.name || createVendor.isPending}
              onClick={() => createVendor.mutate({ data: { name: form.name, bankName: form.bankName || undefined, accountNumber: form.accountNumber || undefined, phone: form.phone || undefined, email: form.email || undefined } })}
              data-testid="button-confirm-create-vendor"
            >
              {createVendor.isPending ? "Creating..." : "Create Vendor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
