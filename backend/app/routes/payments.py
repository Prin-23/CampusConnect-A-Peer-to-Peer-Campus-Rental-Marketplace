from fastapi import APIRouter, Depends, HTTPException
from app.services.payment_services import PaymentService
from app.utils.schemas.payment import PaymentCreate
from app.models.payments import payment_model
from app.core.dependencies import get_current_user
from app.db.mongodb import db
from bson import ObjectId
from datetime import datetime

import razorpay
import os
import hmac
import hashlib
from dotenv import load_dotenv

load_dotenv()

from app.core.config import settings

router = APIRouter(prefix="/payments", tags=["Payments"])

try:
    razorpay_client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
except Exception as e:
    print(f"Failed to initialize Razorpay Client: {e}")

# CREATE RAZORPAY ORDER (Simulated Escrow Hold)
@router.post("/create-razorpay-order")
async def create_razorpay_order(
    data: PaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    try:
        # 🔍 Find order to get total price
        order = await db.orders.find_one({"_id": ObjectId(data.order_id)})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
            
        amount = int(order["total_price"] * 100) # Razorpay accepts amount in paise
        
        # Razorpay requires minimum 1 INR (100 paise)
        if amount < 100:
            amount = 100
        
        razorpay_order = razorpay_client.order.create({
            "amount": amount,
            "currency": "INR",
            "receipt": f"receipt_{data.order_id}"
        })
        
        return {"id": razorpay_order["id"], "amount": amount, "currency": "INR"}
    except Exception as e:
        print(f"Razorpay Error: {e}")
        raise HTTPException(status_code=500, detail=f"Razorpay Error: {str(e)}")


# VERIFY RAZORPAY PAYMENT
@router.post("/verify-razorpay")
async def verify_razorpay_payment(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    try:
        # Verify the signature
        razorpay_client.utility.verify_payment_signature({
            'razorpay_order_id': data.get('razorpay_order_id'),
            'razorpay_payment_id': data.get('razorpay_payment_id'),
            'razorpay_signature': data.get('razorpay_signature')
        })
        
        # Payment is verified. Now create our internal payment record and update order.
        payment_data = PaymentCreate(
            order_id=data.get("order_id"),
            amount=data.get("amount"),
            payment_method="UPI" # Assuming UPI for simplicity in this project
        )
        
        payment = await PaymentService.create_payment(payment_data)
        
        # Update Order Status
        await db.orders.update_one(
            {"_id": ObjectId(data.get("order_id"))},
            {"$set": {"status": "paid"}}
        )
        
        return {"status": "success", "message": "Payment verified securely"}
        
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# CREATE PAYMENT
@router.post("/")
async def create_payment(
    data: PaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    payment = await PaymentService.create_payment(data)

    # Send Notifications and Update Order Status
    order = await db.orders.find_one({"_id": ObjectId(data.order_id)})
    if order:
        product = await db.products.find_one({"_id": ObjectId(order["product_id"])})
        if product:
            duration = order.get("duration", order.get("days", 1))
            duration_type = order.get("duration_type", "days")
            product_name = product.get("name", "Unknown Product")
            payment_method = getattr(data, "payment_method", "upi").upper()
            
            buyer_msg = {
                "sender_id": "system",
                "receiver_id": str(current_user["_id"]),
                "product_id": str(product["_id"]),
                "text": f"SYSTEM: Order Placed! You have rented {product_name} for {duration} {duration_type}. Payment Method: {payment_method}.",
                "timestamp": datetime.utcnow(),
                "is_read": False
            }
            
            owner_msg = {
                "sender_id": "system",
                "receiver_id": product["owner_id"],
                "product_id": str(product["_id"]),
                "text": f"SYSTEM: Your item {product_name} has been rented for {duration} {duration_type} by {current_user.get('name', current_user.get('email', 'User'))}. Payment Method: {payment_method}.",
                "timestamp": datetime.utcnow(),
                "is_read": False
            }
            
            await db.messages.insert_many([buyer_msg, owner_msg])
            
            new_status = "paid" if payment_method == "UPI" else "cod"
            await db.orders.update_one(
                {"_id": ObjectId(data.order_id)},
                {"$set": {"status": new_status}}
            )

    return payment_model(payment)


# ✅ MARK SUCCESS (SECURE)
@router.put("/{payment_id}/success")
async def payment_success(
    payment_id: str,
    current_user: dict = Depends(get_current_user)
):
    # 🔍 Find payment
    payment = await db.payments.find_one({"_id": ObjectId(payment_id)})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    # 🔍 Find order
    order = await db.orders.find_one({"_id": ObjectId(payment["order_id"])})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # 🔒 Authorization check
    if order["buyer_id"] != str(current_user["_id"]) and not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    # ✅ Update status
    await PaymentService.mark_success(payment_id)

    return {"message": "Payment released securely"}


# ✅ MARK FAILED (SECURE)
@router.put("/{payment_id}/failed")
async def payment_failed(
    payment_id: str,
    current_user: dict = Depends(get_current_user)
):
    payment = await db.payments.find_one({"_id": ObjectId(payment_id)})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    order = await db.orders.find_one({"_id": ObjectId(payment["order_id"])})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order["user_id"] != str(current_user["_id"]) and not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    await PaymentService.mark_failed(payment_id)

    return {"message": "Payment marked as failed"}