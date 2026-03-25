import { useState } from "react";
import { useListClients, useCreateClient, useUpdateClient } from "@workspace/api-client-react";
import { Users, Plus, Phone, Mail, MapPin, Edit2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Clients() {
  const { data: clients, isLoading, refetch } = useListClients();
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      address: formData.get("address") as string,
      city: formData.get("city") as string,
      notes: formData.get("notes") as string,
    };

    try {
      if (editingClient) {
        await updateMutation.mutateAsync({
          id: editingClient.id,
          data: payload
        });
      } else {
        await createMutation.mutateAsync({
          data: payload
        });
      }
      setIsDialogOpen(false);
      setEditingClient(null);
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditDialog = (client: any) => {
    setEditingClient(client);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingClient(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your customer relationships.</p>
        </div>
        <button 
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5 mr-2" /> Add Client
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
           [1,2,3].map(i => <div key={i} className="h-40 bg-card rounded-2xl border border-border/50 animate-pulse"></div>)
        ) : clients?.length === 0 ? (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-2xl bg-card/50">
            <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No clients found</h3>
          </div>
        ) : (
          clients?.map(client => (
            <Card key={client.id} className="border-border/50 shadow-sm hover:shadow-md transition-shadow bg-card overflow-hidden group">
              <div className="h-2 bg-primary/20 group-hover:bg-primary transition-colors"></div>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4 gap-2">
                  <h3 className="text-xl font-bold font-display text-foreground truncate flex-1">{client.name}</h3>
                  <button
                    onClick={() => openEditDialog(client)}
                    className="flex-shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Edit client"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  {client.phone && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Phone className="w-4 h-4 mr-3 text-primary/60" /> {client.phone}
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center text-sm text-muted-foreground truncate">
                      <Mail className="w-4 h-4 mr-3 text-primary/60 flex-shrink-0" /> <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-start text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 mr-3 mt-0.5 text-primary/60 flex-shrink-0" /> 
                      <span className="line-clamp-2">{client.address}{client.city && `, ${client.city}`}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">
              {editingClient ? "Edit Client" : "Add Client"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name / Company *</label>
              <input 
                name="name" 
                required 
                defaultValue={editingClient?.name || ""}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input 
                  name="email" 
                  type="email" 
                  defaultValue={editingClient?.email || ""}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input 
                  name="phone" 
                  defaultValue={editingClient?.phone || ""}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input 
                name="address" 
                defaultValue={editingClient?.address || ""}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 mb-3" 
                placeholder="Street" 
              />
              <input 
                name="city" 
                defaultValue={editingClient?.city || ""}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" 
                placeholder="City" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea 
                name="notes" 
                defaultValue={editingClient?.notes || ""}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 resize-none" 
                rows={3}
                placeholder="Additional notes..."
              />
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={closeDialog} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md">
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Client"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
