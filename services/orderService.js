const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const DeliveryRider = require('../models/DeliveryRider');
const Counter = require('../models/Counter');

/**
 * Validates cart items against official MongoDB MenuItem prices
 * Prevents client-side price manipulation
 */
async function validateAndCalculateCart(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Cart is empty or invalid.');
  }

  let totalAmount = 0;
  const processedItems = [];

  for (const item of items) {
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    
    // Look up menu item in DB by ID or name
    let dbItem = null;
    if (item.item_id && item.item_id !== 'ITEM-GENERIC') {
      if (item.item_id.match(/^[0-9a-fA-F]{24}$/)) {
        dbItem = await MenuItem.findById(item.item_id);
      } else {
        dbItem = await MenuItem.findOne({ name: item.name });
      }
    }
    if (!dbItem && item.name) {
      dbItem = await MenuItem.findOne({ name: item.name });
    }

    let unitPrice = 0;

    if (dbItem) {
      // Determine base price according to size
      let basePrice = dbItem.price;
      const requestedSize = item.size || 'Medium';

      if (dbItem.sizes && dbItem.sizes.length > 0) {
        const matchingSize = dbItem.sizes.find(
          s => s.name.toLowerCase() === requestedSize.toLowerCase()
        );
        if (matchingSize) {
          basePrice = matchingSize.price;
        }
      } else if (dbItem.customization && dbItem.customization.sizes) {
        const matchingSize = dbItem.customization.sizes.find(
          s => s.name.toLowerCase() === requestedSize.toLowerCase()
        );
        if (matchingSize) {
          basePrice = matchingSize.price;
        }
      }

      let extrasSum = 0;
      const extrasList = Array.isArray(item.extras) ? item.extras : [];

      if (dbItem.customization) {
        // Calculate crust extra price
        if (dbItem.customization.crusts) {
          for (const crust of dbItem.customization.crusts) {
            const hasCrust = extrasList.some(e => 
              typeof e === 'string' && e.toLowerCase().includes(crust.name.toLowerCase())
            );
            if (hasCrust && crust.price > 0) {
              extrasSum += crust.price;
            }
          }
        }
        // Calculate side extra price
        if (dbItem.customization.sides) {
          for (const side of dbItem.customization.sides) {
            const hasSide = extrasList.some(e => 
              typeof e === 'string' && e.toLowerCase().includes(side.name.toLowerCase())
            );
            if (hasSide && side.price > 0) {
              extrasSum += side.price;
            }
          }
        }
        // Calculate custom extras price
        if (dbItem.customization.extras) {
          for (const ext of dbItem.customization.extras) {
            const hasExt = extrasList.some(e => 
              typeof e === 'string' && e.toLowerCase().includes(ext.name.toLowerCase())
            );
            if (hasExt && ext.price > 0) {
              extrasSum += ext.price;
            }
          }
        }
        // Calculate addons price
        if (dbItem.customization.addons) {
          for (const addon of dbItem.customization.addons) {
            const hasAddon = extrasList.some(e => 
              typeof e === 'string' && e.toLowerCase().includes(addon.name.toLowerCase())
            );
            if (hasAddon && addon.price > 0) {
              extrasSum += addon.price;
            }
          }
        }
      }

      unitPrice = basePrice + extrasSum;
    } else {
      // Fallback if item was custom or legacy
      unitPrice = Math.max(0, Number(item.unit_price || item.price) || 0);
    }

    const itemTotal = unitPrice * qty;
    totalAmount += itemTotal;

    processedItems.push({
      item_id: dbItem ? String(dbItem._id) : (item.item_id || 'ITEM-GENERIC'),
      name: dbItem ? dbItem.name : (item.name || 'Food Item'),
      quantity: qty,
      size: item.size || 'Medium',
      extras: Array.isArray(item.extras) ? item.extras : [],
      unit_price: unitPrice,
      total_price: itemTotal
    });
  }

  return {
    processedItems,
    totalAmount
  };
}

/**
 * Canonical Order Statuses
 */
const CANONICAL_STATUS = {
  RECEIVED: 'RECEIVED',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  RIDER_ASSIGNED: 'RIDER_ASSIGNED',
  RIDER_ACCEPTED: 'RIDER_ACCEPTED',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED'
};

function normalizeOrderStatus(status) {
  if (!status) return CANONICAL_STATUS.RECEIVED;
  const s = String(status).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (s === 'RECEIVED') return CANONICAL_STATUS.RECEIVED;
  if (s === 'CONFIRMED') return CANONICAL_STATUS.CONFIRMED;
  if (s === 'PREPARING') return CANONICAL_STATUS.PREPARING;
  if (s === 'READY' || s === 'READY_FOR_PICKUP') return CANONICAL_STATUS.READY_FOR_PICKUP;
  if (s === 'RIDER_ASSIGNED' || s === 'ASSIGNED') return CANONICAL_STATUS.RIDER_ASSIGNED;
  if (s === 'RIDER_ACCEPTED' || s === 'ACCEPTED') return CANONICAL_STATUS.RIDER_ACCEPTED;
  if (s === 'PICKED_UP' || s === 'PICKEDUP') return CANONICAL_STATUS.PICKED_UP;
  if (s === 'OUT_FOR_DELIVERY' || s === 'OUT_OF_DELIVERY') return CANONICAL_STATUS.OUT_FOR_DELIVERY;
  if (s === 'DELIVERED') return CANONICAL_STATUS.DELIVERED;
  if (s === 'CANCELLED' || s === 'CANCELED') return CANONICAL_STATUS.CANCELLED;
  return s;
}

/**
 * Idempotent order delivery transition logic
 */
async function processOrderDelivered(order, riderId = null) {
  if (!order) throw new Error('Order not found');

  order.order_status = 'DELIVERED';
  order.payment_status = 'Paid';

  // Only apply stats increment if not previously processed
  if (!order.is_delivery_processed) {
    order.is_delivery_processed = true;

    // Update customer spending & VIP status
    const customer = await Customer.findOne({ customer_id: order.customer_id });
    if (customer) {
      customer.completed_orders += 1;
      customer.total_spending += order.total_amount;
      customer.updateCustomerLevel();
      await customer.save();
    }

    // Update rider statistics
    const targetRiderId = riderId || order.rider_id;
    if (targetRiderId) {
      const rider = await DeliveryRider.findOne({ rider_id: targetRiderId });
      if (rider) {
        rider.total_deliveries += 1;
        rider.status = 'Available';
        rider.assigned_order_id = null;
        await rider.save();
      }
    }
  }

  await order.save();
  return order;
}

module.exports = {
  CANONICAL_STATUS,
  normalizeOrderStatus,
  validateAndCalculateCart,
  processOrderDelivered
};
