import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useServices, useContact } from "@/hooks/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useState } from "react";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().optional(),
  bestContactMethod: z.string().optional(),
  service: z.string().optional(),
  message: z.string().min(10, "Please provide a brief message"),
});

export function Contact() {
  const { data: services } = useServices();
  const contactMutation = useContact();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phone: "",
      bestContactMethod: "",
      service: "",
      message: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      await contactMutation.mutateAsync(values);
      setSubmitted(true);
      form.reset();
    } catch (error) {
      // Error is handled by the mutation and form state
    }
  };

  return (
    <section id="contact" className="py-24 bg-white border-t border-gray-200">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          
          {/* Left: Info */}
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 uppercase tracking-tight mb-4">Let's Get to Work.</h2>
            <div className="w-24 h-2 bg-primary mb-8"></div>
            
            <p className="text-xl text-gray-600 mb-8 leading-relaxed font-medium">
              Ready to start your next project? Tell us what you need, and we'll get back to you with an honest quote and a timeline you can count on.
            </p>
            
            <div className="bg-gray-50 p-8 border-l-4 border-secondary mt-12">
              <h3 className="text-xl font-bold uppercase tracking-wide text-gray-900 mb-4">The Willard's Way</h3>
              <ul className="space-y-4 text-gray-600 font-medium">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0" />
                  <span>Free, no-obligation estimates on all jobs.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0" />
                  <span>Clear communication from start to finish.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0" />
                  <span>Respect for your property and your time.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right: Form */}
          <div className="bg-gray-900 p-8 md:p-10 text-white shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
            
            <h3 className="text-2xl font-black uppercase tracking-wider mb-8">Request a Quote</h3>

            {submitted ? (
              <div className="bg-white/10 border border-white/20 p-8 text-center py-16">
                <div className="w-16 h-16 bg-primary mx-auto flex items-center justify-center mb-6 rounded-full">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-2xl font-bold uppercase tracking-wide mb-4">Message Sent</h4>
                <p className="text-gray-300 font-medium">
                  Thanks for reaching out. We've received your information and will be in touch shortly.
                </p>
                <Button 
                  onClick={() => setSubmitted(false)}
                  variant="outline" 
                  className="mt-8 border-white/30 text-white hover:bg-white/10 rounded-none uppercase font-bold tracking-wider"
                >
                  Send Another Message
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300 uppercase tracking-wider text-xs font-bold">Full Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="John Doe" 
                            {...field} 
                            className="bg-white/5 border-white/20 text-white placeholder:text-gray-500 rounded-none focus-visible:ring-primary h-12"
                          />
                        </FormControl>
                        <FormMessage className="text-primary font-medium" />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-300 uppercase tracking-wider text-xs font-bold">Phone Number</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="(555) 123-4567" 
                              {...field} 
                              className="bg-white/5 border-white/20 text-white placeholder:text-gray-500 rounded-none focus-visible:ring-primary h-12"
                            />
                          </FormControl>
                          <FormMessage className="text-primary font-medium" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bestContactMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-300 uppercase tracking-wider text-xs font-bold">Best Way to Reach You</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-white/5 border-white/20 text-white rounded-none focus-visible:ring-primary h-12">
                                <SelectValue placeholder="Select method" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none border-gray-200">
                              <SelectItem value="Call me">Call me</SelectItem>
                              <SelectItem value="Text me">Text me</SelectItem>
                              <SelectItem value="Email me">Email me</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-primary font-medium" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="service"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300 uppercase tracking-wider text-xs font-bold">Interested Service</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-white/5 border-white/20 text-white rounded-none focus-visible:ring-primary h-12">
                              <SelectValue placeholder="What do you need help with?" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-none border-gray-200 max-h-[300px]">
                            {services?.map(s => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                            <SelectItem value="Other">Other / Not sure</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-primary font-medium" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300 uppercase tracking-wider text-xs font-bold">Project Details *</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Tell us a bit about what you're looking to get done..." 
                            className="min-h-[120px] bg-white/5 border-white/20 text-white placeholder:text-gray-500 rounded-none focus-visible:ring-primary resize-y"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage className="text-primary font-medium" />
                      </FormItem>
                    )}
                  />

                  {contactMutation.isError && (
                    <div className="p-4 bg-primary/20 border border-primary text-white text-sm font-bold">
                      Failed to send message. Please try again later.
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    disabled={contactMutation.isPending}
                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold rounded-none h-14 text-lg uppercase tracking-wider group"
                  >
                    {contactMutation.isPending ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Send Message
                        <Send className="ml-2 h-5 w-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            )}
          </div>

        </div>
      </div>
    </section>
  );
}
