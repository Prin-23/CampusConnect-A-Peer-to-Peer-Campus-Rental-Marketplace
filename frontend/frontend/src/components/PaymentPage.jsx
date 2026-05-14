import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import { apiFetch } from "../utils/api";

// ── Icons ──
const ArrowLeft = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
  </svg>
);
const ShieldCheck = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
  </svg>
);
const CalendarDays = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
    <line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/>
    <line x1="3" x2="21" y1="10" y2="10"/>
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>
  </svg>
);
const CheckCircle = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>
  </svg>
);

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PaymentPage() {
  const [method, setMethod]   = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();

  // Load Razorpay Script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Order summary passed from OrderPage via navigation state
  const order = location.state || {};
  const {
    productName  = "Rental Order",
    productImage = "",
    category     = "General",
    startDate    = "",
    endDate      = "",
    duration     = 0,
    durationType = "days",
    pricePerUnit = 0,
    total        = 0,
  } = order;

  const handlePayment = async () => {
    if (!method) { alert("Please select a payment method"); return; }
    setLoading(true);
    try {
      const order_id = localStorage.getItem("order_id");
      if (!order_id) throw new Error("No active order found. Please go back and try again.");

      if (method === "upi") {
        // 1. Create Razorpay Order
        const orderData = await apiFetch("/payments/create-razorpay-order", {
          method: "POST",
          body: { order_id, amount: total || 0, payment_method: method }
        });

        // 2. Open Razorpay Checkout Modal
        const options = {
          key: "rzp_test_Sp6zDdfpNZ5adv", // Safe Test Key
          amount: orderData.amount,
          currency: "INR",
          name: "CampusConnect",
          description: "Simulated Escrow Hold for " + productName,
          order_id: orderData.id,
          handler: async function (response) {
            try {
              // 3. Verify Payment Signature
              await apiFetch("/payments/verify-razorpay", {
                method: "POST",
                body: {
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  order_id: order_id,
                  amount: total || 0
                }
              });
              
              setSuccess(true);
              setTimeout(() => {
                localStorage.removeItem("order_id");
                navigate("/dashboard");
              }, 2500);
            } catch (verifyErr) {
              alert("Payment Verification Failed: " + verifyErr.message);
              setLoading(false);
            }
          },
          prefill: {
            name: "College Student",
            email: "student@campusconnect.edu",
            contact: "9999999999"
          },
          theme: {
            color: "#10b981"
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response){
          alert("Payment Failed. Please try again.");
          setLoading(false);
        });
        rzp.open();
      } else {
        // Cash on delivery / traditional logic
        await apiFetch("/payments/", {
          method: "POST",
          body: { order_id, amount: total || 0, payment_method: method }
        });

        setSuccess(true);
        setTimeout(() => {
          localStorage.removeItem("order_id");
          navigate("/dashboard");
        }, 2500);
      }
    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  };

  // ── Success Screen ──
  if (success) {
    return (
      <div className="bg-slate-50 min-h-screen flex flex-col items-center justify-center font-sans text-slate-800 p-6">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-12 flex flex-col items-center gap-5 max-w-sm w-full text-center border border-slate-100">
          <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center border-4 border-emerald-200">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Payment Authorized!</h2>
          <p className="text-slate-500 font-medium text-sm">
            Your escrow hold of <span className="font-black text-emerald-600">₹{total}</span> has been placed securely. Redirecting you to dashboard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-800 relative pb-16">
      {/* Background gradient */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-emerald-100/50 to-transparent pointer-events-none" />

      <Navbar />

      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-6 pb-12 relative z-10">

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-2.5 px-5 py-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all font-bold text-sm text-slate-600 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="glass rounded-[2.5rem] border border-white shadow-xl overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-8 py-7 flex items-center gap-4">
            <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <h1 className="text-xl font-black text-white tracking-tighter">Secure Checkout</h1>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">CampusRent Escrow Protection</p>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-6">

            {/* ── ORDER SUMMARY ── */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Order Summary</span>
              </div>

              <div className="p-5 flex gap-4">
                {/* Product thumbnail */}
                {productImage && (
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 shrink-0 flex items-center justify-center">
                    <img src={productImage} alt={productName} className="w-full h-full object-contain p-2" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-tighter border border-blue-100">
                    {category}
                  </span>
                  <h3 className="font-black text-slate-900 text-base tracking-tighter mt-1 truncate">{productName}</h3>
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 font-semibold">
                    <CalendarDays className="w-3.5 h-3.5 text-blue-400" />
                    <span>{formatDate(startDate)}</span>
                    <span className="text-slate-300">→</span>
                    <span>{durationType === 'hours' ? new Date(endDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : formatDate(endDate)}</span>
                    {duration > 0 && <span className="text-slate-400">({duration} {durationType === 'hours' ? `hour${duration !== 1 ? 's' : ''}` : `day${duration !== 1 ? 's' : ''}`})</span>}
                  </div>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="border-t border-slate-100 px-5 py-4 space-y-2 bg-slate-50/50">
                <div className="flex justify-between text-sm text-slate-500 font-semibold">
                  <span>₹{pricePerUnit} × {duration} {durationType === 'hours' ? `hour${duration !== 1 ? 's' : ''}` : `day${duration !== 1 ? 's' : ''}`}</span>
                  <span>₹{total}</span>
                </div>
                <div className="flex justify-between font-black text-slate-900 text-lg pt-1 border-t border-slate-200 mt-1">
                  <span>Total</span>
                  <span className="text-emerald-600">₹{total}</span>
                </div>
              </div>
            </div>

            {/* ── PAYMENT METHOD ── */}
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Select Payment Method</h3>

              <div className="space-y-3">

                {/* UPI */}
                <div
                  onClick={() => setMethod("upi")}
                  className={`p-5 rounded-2xl cursor-pointer transition-all border-2 ${
                    method === "upi"
                      ? "border-blue-500 bg-blue-50/60 shadow-md shadow-blue-100"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${method === "upi" ? "border-blue-500" : "border-slate-300"}`}>
                      {method === "upi" && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                    </div>
                    <span className="text-2xl">📱</span>
                    <div>
                      <p className="font-black text-slate-800">UPI Payment</p>
                      <p className="text-xs text-slate-400 font-medium">PhonePe, GPay, Paytm &amp; more</p>
                    </div>
                  </div>
                  {method === "upi" && (
                    <div className="mt-4 flex gap-2">
                      {["PhonePe", "GPay", "Paytm"].map((app) => (
                        <button 
                          key={app} 
                          onClick={(e) => {
                            e.stopPropagation(); // prevent triggering the parent div's onClick
                            handlePayment();
                          }}
                          className="flex-1 py-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 shadow-sm font-bold text-sm text-slate-700 transition-all active:scale-95"
                        >
                          {app}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cash */}
                <div
                  onClick={() => setMethod("cash")}
                  className={`p-5 rounded-2xl cursor-pointer transition-all border-2 ${
                    method === "cash"
                      ? "border-emerald-500 bg-emerald-50/60 shadow-md shadow-emerald-100"
                      : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${method === "cash" ? "border-emerald-500" : "border-slate-300"}`}>
                      {method === "cash" && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                    </div>
                    <span className="text-2xl">💵</span>
                    <div>
                      <p className="font-black text-slate-800">Cash on Delivery</p>
                      <p className="text-xs text-slate-400 font-medium">Pay when you receive the item</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* ── ESCROW NOTE ── */}
            <div className="flex gap-4 items-start bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5">
              <ShieldCheck className="w-8 h-8 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-black text-slate-800 text-sm">Escrow Protection</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Your payment of <strong className="text-blue-700">₹{total}</strong> is held securely by CampusRent and released to the owner only after the item is returned and verified.
                </p>
              </div>
            </div>

            {/* ── PAY BUTTON ── */}
            <button
              onClick={handlePayment}
              disabled={loading || !method}
              className={`w-full py-4 rounded-2xl font-black text-base flex justify-center items-center gap-3 shadow-lg transition-all active:scale-[0.98] ${
                loading || !method
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  : "bg-slate-900 text-white hover:bg-black hover:shadow-xl hover:-translate-y-0.5"
              }`}
            >
              {loading
                ? <div className="w-5 h-5 border-4 border-slate-400 border-t-white rounded-full animate-spin" />
                : <>🔒 Authorize Payment Hold · ₹{total}</>
              }
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}