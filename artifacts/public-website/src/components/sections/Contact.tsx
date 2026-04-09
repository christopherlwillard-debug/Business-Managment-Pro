import { useForm } from "react-hook-form";
import { useServices, useContact } from "@/hooks/api";
import { CheckCircle2, Loader2, Send, Phone, Mail, MapPin, Clock } from "lucide-react";
import { useState, useEffect } from "react";

interface FormValues {
  name: string;
  phone: string;
  email: string;
  bestTime: string;
  service: string;
  message: string;
}

export function Contact() {
  const { data: services } = useServices();
  const contactMutation = useContact();
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { name: "", phone: "", email: "", bestTime: "", service: "", message: "" },
  });

  useEffect(() => {
    function handlePrefill(e: Event) {
      const detail = (e as CustomEvent<{ service: string }>).detail;
      if (detail?.service) setValue("service", detail.service);
    }
    window.addEventListener("prefill-contact", handlePrefill);
    return () => window.removeEventListener("prefill-contact", handlePrefill);
  }, [setValue]);

  const onSubmit = async (values: FormValues) => {
    try {
      await contactMutation.mutateAsync({
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        bestTime: values.bestTime || undefined,
        service: values.service || undefined,
        message: values.message,
      });
      setSubmitted(true);
      reset();
    } catch {
      // Error shown via contactMutation.isError
    }
  };

  const inputCls =
    "w-full bg-white/5 border border-white/20 text-white placeholder:text-gray-500 px-4 h-12 focus:outline-none focus:border-primary transition-colors";
  const labelCls = "block text-gray-300 uppercase tracking-wider text-xs font-bold mb-1.5";
  const errorCls = "mt-1 text-xs text-red-400 font-medium";
  const selectCls = inputCls + " bg-gray-800 border border-white/20";

  return (
    <section id="contact" className="py-24 bg-white border-t border-gray-200">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">

          {/* Left: Info */}
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 uppercase tracking-tight mb-4">
              Let's Get to Work.
            </h2>
            <div className="w-24 h-2 bg-primary mb-8" />
            <p className="text-xl text-gray-600 mb-8 leading-relaxed font-medium">
              Ready to start your next project? Tell us what you need, and we'll get back to you with an honest quote and a timeline you can count on.
            </p>
            {/* Business contact info */}
            <div className="space-y-4 mb-10">
              <a href="tel:+12707993703" className="flex items-center gap-3 text-gray-700 hover:text-primary transition-colors group">
                <div className="w-10 h-10 bg-primary/10 flex items-center justify-center rounded-full group-hover:bg-primary/20 transition-colors">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-400 font-bold">Call or Text</div>
                  <div className="font-bold text-gray-900">(270) 799-3703</div>
                </div>
              </a>
              <a href="mailto:willardsgeneralcontracting@gmail.com" className="flex items-center gap-3 text-gray-700 hover:text-primary transition-colors group">
                <div className="w-10 h-10 bg-primary/10 flex items-center justify-center rounded-full group-hover:bg-primary/20 transition-colors">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-400 font-bold">Email</div>
                  <div className="font-bold text-gray-900 text-sm">willardsgeneralcontracting@gmail.com</div>
                </div>
              </a>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-10 h-10 bg-primary/10 flex items-center justify-center rounded-full">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-400 font-bold">Service Area</div>
                  <div className="font-bold text-gray-900">Owensboro, KY & Surrounding Areas</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-10 h-10 bg-primary/10 flex items-center justify-center rounded-full">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-400 font-bold">Hours</div>
                  <div className="font-bold text-gray-900">Mon–Sat, 7am–6pm</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-8 border-l-4 border-secondary">
              <h3 className="text-xl font-bold uppercase tracking-wide text-gray-900 mb-4">The Willard's Way</h3>
              <ul className="space-y-4 text-gray-600 font-medium">
                {[
                  "Free, no-obligation estimates on all jobs.",
                  "Clear communication from start to finish.",
                  "Respect for your property and your time.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: Form */}
          <div className="bg-gray-900 p-8 md:p-10 text-white shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary" />
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
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-8 px-6 py-3 border border-white/30 text-white hover:bg-white/10 uppercase font-bold tracking-wider transition-colors"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Name */}
                <div>
                  <label className={labelCls}>Full Name *</label>
                  <input
                    {...register("name", { required: "Name is required" })}
                    placeholder="John Doe"
                    className={inputCls}
                  />
                  {errors.name && <p className={errorCls}>{errors.name.message}</p>}
                </div>

                {/* Phone + Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className={labelCls}>Phone Number</label>
                    <input
                      {...register("phone")}
                      placeholder="(555) 123-4567"
                      type="tel"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Email Address</label>
                    <input
                      {...register("email")}
                      placeholder="you@email.com"
                      type="email"
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Service + Best time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className={labelCls}>Interested Service</label>
                    <select {...register("service")} className={selectCls}>
                      <option value="">What do you need help with?</option>
                      {services?.map((s) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                      <option value="Other">Other / Not sure</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Best Time to Call</label>
                    <select {...register("bestTime")} className={selectCls}>
                      <option value="">Any time</option>
                      <option value="Morning (8am–12pm)">Morning (8am–12pm)</option>
                      <option value="Afternoon (12pm–5pm)">Afternoon (12pm–5pm)</option>
                      <option value="Evening (5pm–8pm)">Evening (5pm–8pm)</option>
                      <option value="Weekends only">Weekends only</option>
                    </select>
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className={labelCls}>Project Details *</label>
                  <textarea
                    {...register("message", {
                      required: "Please provide a brief message",
                      minLength: { value: 10, message: "Please provide a bit more detail" },
                    })}
                    placeholder="Tell us a bit about what you're looking to get done..."
                    className={inputCls + " h-auto min-h-[110px] py-3 resize-y"}
                    rows={4}
                  />
                  {errors.message && <p className={errorCls}>{errors.message.message}</p>}
                </div>

                {contactMutation.isError && (
                  <div className="p-4 bg-primary/20 border border-primary text-white text-sm font-bold">
                    Failed to send message. Please try again later.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={contactMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold h-14 text-lg uppercase tracking-wider group transition-colors disabled:opacity-60"
                >
                  {contactMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Send Message
                      <Send className="h-5 w-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

        </div>
      </div>
    </section>
  );
}
