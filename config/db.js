const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Branch = require('../models/Branch');
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const DeliveryRider = require('../models/DeliveryRider');
const Review = require('../models/Review');
const ReviewReward = require('../models/ReviewReward');
const WhatsAppSession = require('../models/WhatsAppSession');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const Counter = require('../models/Counter');

let mongoServer;

const startMemoryDatabase = async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  console.log('MongoDB Memory Server connected for local development.');
};

const hasPlaceholderCredentials = (uri) => {
  if (!uri) return false;

  const credentials = uri.match(/^mongodb(?:\+srv)?:\/\/([^@]+)@/i)?.[1];
  return Boolean(credentials && (credentials.includes('<') || credentials.includes('>')));
};

const connectDB = async () => {
  const configuredUri = process.env.MONGODB_URI?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    if (!configuredUri || hasPlaceholderCredentials(configuredUri)) {
      if (isProduction) {
        throw new Error('MONGODB_URI is missing or contains placeholder credentials.');
      }

      console.warn('MONGODB_URI is missing or contains placeholder credentials; using an in-memory database for local development.');
      await startMemoryDatabase();
    } else {
      await mongoose.connect(configuredUri, { serverSelectionTimeoutMS: 10000 });
      console.log('MongoDB connected successfully.');
    }

    await seedInitialData();
  } catch (error) {
    console.error('MongoDB connection error:', error.message);

    if (!isProduction && mongoose.connection.readyState === 0) {
      console.warn('Using an in-memory database because the configured development database is unavailable.');
      await startMemoryDatabase();
      await seedInitialData();
      return;
    }

    throw error;
  }
};

const seedInitialData = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('🌱 Seeding database records with Smart Customization options...');

      const adminPassword = await bcrypt.hash('admin123', 10);
      const managerPassword = await bcrypt.hash('manager123', 10);
      const kitchenPassword = await bcrypt.hash('kitchen123', 10);
      const deliveryPassword = await bcrypt.hash('delivery123', 10);
      const riderPassword = await bcrypt.hash('rider123', 10);

      // Seed Staff Users
      await User.create([
        { name: 'Super Admin', email: 'admin@restaurant.com', password: adminPassword, role: 'admin' },
        { name: 'Restaurant Manager', email: 'manager@restaurant.com', password: managerPassword, role: 'manager' },
        { name: 'Kitchen Chef', email: 'kitchen@restaurant.com', password: kitchenPassword, role: 'kitchen' },
        { name: 'Delivery Manager', email: 'delivery@restaurant.com', password: deliveryPassword, role: 'delivery' },
        { name: 'Rider Ali', email: 'rider@restaurant.com', password: riderPassword, role: 'rider', phone: '03009998877' }
      ]);

      // Seed Default Settings
      await Settings.create({
        restaurant_name: 'FeastFlow Restaurant',
        tagline: 'Smart AI Ordering & Food Customization',
        contact_phone: '042-35894120',
        contact_email: 'info@feastflow.com',
        whatsapp_number: '+923001234567',
        tax_rate_percent: 16,
        default_delivery_fee: 150
      });

      await AuditLog.create({
        action: 'SYSTEM_INITIALIZATION',
        performed_by: 'Super Admin',
        role: 'admin',
        module: 'System',
        details: 'Initial database seeding with product-specific customization engine complete.'
      });

      // Seed Branches
      await Branch.create([
        {
          branch_id: 'BR-DHA',
          name: '📍 FeastFlow DHA Branch',
          address: 'Phase 5 Commercial, DHA, Lahore',
          phone: '042-35894120',
          opening_hours: '12:00 PM - 12:00 AM',
          lat: 31.4704,
          lng: 74.4101,
          is_active: true
        },
        {
          branch_id: 'BR-GLB',
          name: '📍 FeastFlow Gulberg Branch',
          address: 'Main Boulevard, Gulberg III, Lahore',
          phone: '042-35759088',
          opening_hours: '12:00 PM - 01:00 AM',
          lat: 31.5204,
          lng: 74.3587,
          is_active: true
        }
      ]);

      // Seed Categories
      const categories = [
        { name: 'Pizza', icon: '🍕', display_order: 1 },
        { name: 'Burgers', icon: '🍔', display_order: 2 },
        { name: 'Chicken', icon: '🍗', display_order: 3 },
        { name: 'Pasta', icon: '🍝', display_order: 4 },
        { name: 'Drinks', icon: '🥤', display_order: 5 },
        { name: 'Desserts', icon: '🍰', display_order: 6 },
        { name: 'Sides', icon: '🍟', display_order: 7 }
      ];
      await MenuCategory.create(categories);

      // Seed Menu Items with Customization Arrays
      await MenuItem.create([
        {
          name: 'Chicken Tikka Pizza',
          category: 'Pizza',
          description: 'Freshly baked pizza with chicken tikka topping, onions, and mozzarella.',
          price: 1199,
          image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500',
          sizes: [
            { name: 'Small', price: 899 },
            { name: 'Medium', price: 1199 },
            { name: 'Large', price: 1599 },
            { name: 'Family', price: 1999 }
          ],
          extras: [
            { name: '🧀 Extra Cheese', price: 150 },
            { name: '🌶️ Extra Spice', price: 50 }
          ],
          customization: {
            flavours: ['🍗 Chicken Tikka', '🍖 Chicken Fajita', '🌶️ Spicy Chicken', '🥩 BBQ Chicken', '🧀 Cheese Lover'],
            sizes: [
              { name: 'Small', price: 899 },
              { name: 'Medium', price: 1199 },
              { name: 'Large', price: 1599 },
              { name: 'Family', price: 1999 }
            ],
            crusts: [
              { name: 'Classic', price: 0 },
              { name: 'Thin Crust', price: 0 },
              { name: 'Cheese Burst', price: 250 },
              { name: 'Stuffed Crust', price: 300 }
            ],
            sides: [
              { name: '🍟 Fries', price: 200 },
              { name: '🥤 Drink', price: 150 },
              { name: '🧄 Garlic Bread', price: 250 },
              { name: '🥣 Dip', price: 90 }
            ],
            extras: [
              { name: '🧀 Extra Cheese', price: 150 },
              { name: '🌶️ Extra Spice', price: 50 },
              { name: '❌ No Extras', price: 0 }
            ]
          }
        },
        {
          name: 'Smokey BBQ Beef Burger',
          category: 'Burgers',
          description: 'Juicy smashed beef patty with cheddar cheese and smoky BBQ sauce.',
          price: 850,
          image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500',
          sizes: [
            { name: 'Regular', price: 850 },
            { name: 'Large', price: 1150 }
          ],
          extras: [
            { name: 'Extra Cheese', price: 100 },
            { name: 'Extra Patty', price: 250 }
          ],
          customization: {
            flavours: ['🍗 Chicken Burger', '🍖 Beef Burger', '🔥 Zinger Burger'],
            sizes: [
              { name: 'Regular', price: 850 },
              { name: 'Large', price: 1150 }
            ],
            addons: [
              { name: 'Extra Cheese', price: 100 },
              { name: 'Extra Patty', price: 250 },
              { name: 'Fries', price: 200 },
              { name: 'Drink', price: 150 }
            ]
          }
        },
        {
          name: 'Creamy Alfredo Pasta',
          category: 'Pasta',
          description: 'Penne pasta tossed in rich parmesan garlic cream sauce with grilled chicken.',
          price: 950,
          image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281288?w=500',
          sizes: [
            { name: 'Regular', price: 950 },
            { name: 'Large', price: 1250 }
          ],
          customization: {
            flavours: ['Alfredo', 'Arrabbiata', 'Creamy Chicken'],
            sizes: [
              { name: 'Regular', price: 950 },
              { name: 'Large', price: 1250 }
            ],
            addons: [
              { name: 'Garlic Bread', price: 250 },
              { name: 'Drink', price: 150 },
              { name: 'Extra Cheese', price: 150 }
            ]
          }
        },
        {
          name: 'Cold Gourmet Soda',
          category: 'Drinks',
          description: 'Refreshing carbonated soft drink served chilled with ice.',
          price: 150,
          image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500',
          sizes: [
            { name: 'Regular', price: 150 },
            { name: 'Large 1.5L', price: 250 }
          ],
          customization: {
            flavours: ['Coke', 'Pepsi', 'Sprite', 'Water'],
            sizes: [
              { name: 'Regular', price: 150 },
              { name: 'Large 1.5L', price: 250 }
            ]
          }
        },
        {
          name: 'Crispy French Fries',
          category: 'Sides',
          description: 'Golden seasoned potato fries served with garlic dip.',
          price: 399,
          image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500',
          sizes: [
            { name: 'Small', price: 299 },
            { name: 'Medium', price: 399 },
            { name: 'Large', price: 499 }
          ],
          customization: {
            flavours: ['Classic', 'Cheese', 'Spicy'],
            sizes: [
              { name: 'Small', price: 299 },
              { name: 'Medium', price: 399 },
              { name: 'Large', price: 499 }
            ]
          }
        },
        {
          name: 'Chocolate Lava Cake',
          category: 'Desserts',
          description: 'Warm decadent chocolate cake with a rich molten liquid chocolate center.',
          price: 550,
          image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=500',
          sizes: [
            { name: 'Single Serving', price: 550 },
            { name: 'Double Sharing', price: 999 }
          ],
          extras: [
            { name: 'Vanilla Ice Cream Scoop', price: 150 },
            { name: 'Extra Chocolate Fudge', price: 100 }
          ],
          customization: {
            flavours: ['Classic Dark Chocolate', 'Belgian Milk Chocolate'],
            sizes: [
              { name: 'Single Serving', price: 550 },
              { name: 'Double Sharing', price: 999 }
            ],
            extras: [
              { name: 'Vanilla Ice Cream Scoop', price: 150 },
              { name: 'Extra Chocolate Fudge', price: 100 }
            ]
          }
        },
        {
          name: 'Cheesecake',
          category: 'Desserts',
          description: 'Smooth and creamy New York style cheesecake with a buttery graham cracker crust.',
          price: 650,
          image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500',
          sizes: [
            { name: 'Slice', price: 650 },
            { name: 'Mini Whole Cake', price: 1850 }
          ],
          extras: [
            { name: 'Strawberry Compote', price: 120 },
            { name: 'Blueberry Topping', price: 150 },
            { name: 'Whipped Cream', price: 80 }
          ],
          customization: {
            flavours: ['Classic New York', 'Strawberry Swirl', 'Blueberry Bliss', 'Lotus Biscoff'],
            sizes: [
              { name: 'Slice', price: 650 },
              { name: 'Mini Whole Cake', price: 1850 }
            ],
            extras: [
              { name: 'Strawberry Compote', price: 120 },
              { name: 'Blueberry Topping', price: 150 },
              { name: 'Whipped Cream', price: 80 }
            ]
          }
        },
        {
          name: 'Brownie with Ice Cream',
          category: 'Desserts',
          description: 'Warm fudgy chocolate brownie topped with premium vanilla bean ice cream and hot chocolate drizzle.',
          price: 499,
          image: 'https://images.unsplash.com/photo-1607920591413-4ec007e70023?w=500',
          sizes: [
            { name: 'Regular', price: 499 },
            { name: 'Large Sizzler', price: 799 }
          ],
          extras: [
            { name: 'Extra Scoop Ice Cream', price: 150 },
            { name: 'Roasted Almonds', price: 90 },
            { name: 'Caramel Drizzle', price: 80 }
          ],
          customization: {
            flavours: ['Fudge Walnut Brownie', 'Double Chocolate Brownie', 'Nutella Brownie'],
            sizes: [
              { name: 'Regular', price: 499 },
              { name: 'Large Sizzler', price: 799 }
            ],
            extras: [
              { name: 'Extra Scoop Ice Cream', price: 150 },
              { name: 'Roasted Almonds', price: 90 },
              { name: 'Caramel Drizzle', price: 80 }
            ]
          }
        },
        {
          name: 'Ice Cream Sundae',
          category: 'Desserts',
          description: 'Generous artisanal ice cream scoops layered with wafer, sprinkles, chocolate syrup and cherry.',
          price: 450,
          image: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=500',
          sizes: [
            { name: 'Standard (2 Scoops)', price: 450 },
            { name: 'Jumbo (3 Scoops)', price: 650 }
          ],
          extras: [
            { name: 'Crushed Oreos', price: 90 },
            { name: 'Chocolate Chips', price: 80 },
            { name: 'Waffle Cone Crumbs', price: 70 }
          ],
          customization: {
            flavours: ['Chocolate & Vanilla', 'Strawberry Delight', 'Mango Mania', 'Cookies & Cream'],
            sizes: [
              { name: 'Standard (2 Scoops)', price: 450 },
              { name: 'Jumbo (3 Scoops)', price: 650 }
            ],
            extras: [
              { name: 'Crushed Oreos', price: 90 },
              { name: 'Chocolate Chips', price: 80 },
              { name: 'Waffle Cone Crumbs', price: 70 }
            ]
          }
        },
        {
          name: 'Molten Brownie',
          category: 'Desserts',
          description: 'Decadent deep-baked molten skillet brownie served warm with a luscious gooey chocolate core.',
          price: 599,
          image: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=500',
          sizes: [
            { name: 'Regular', price: 599 },
            { name: 'Skillet Special', price: 899 }
          ],
          extras: [
            { name: 'Vanilla Bean Gelato', price: 160 },
            { name: 'Salted Caramel Swirl', price: 100 },
            { name: 'Nutella Drizzle', price: 120 }
          ],
          customization: {
            flavours: ['Original Molten Chocolate', 'Lotus Caramel Molten', 'Dark Choc & Hazelnut'],
            sizes: [
              { name: 'Regular', price: 599 },
              { name: 'Skillet Special', price: 899 }
            ],
            extras: [
              { name: 'Vanilla Bean Gelato', price: 160 },
              { name: 'Salted Caramel Swirl', price: 100 },
              { name: 'Nutella Drizzle', price: 120 }
            ]
          }
        }
      ]);

      // Seed Delivery Rider
      const rider = await DeliveryRider.create({
        rider_id: 'RIDER-101',
        name: 'Rider Ali',
        phone: '03009998877',
        vehicle_number: 'LEK-4592',
        status: 'Available',
        current_location: { lat: 31.4704, lng: 74.4101 }
      });

      // Seed Customer "Sameer"
      const sampleCustomer = await Customer.create({
        customer_id: 'CUST-1001',
        name: 'Sameer',
        phone: '03001234567',
        email: 'sameer@example.com',
        addresses: [
          { label: 'Home', address: 'House 42, Street 10, Phase 5 DHA, Lahore', lat: 31.4750, lng: 74.4200 },
          { label: 'Office', address: 'Suite 302, Software Technology Park, Lahore', lat: 31.5100, lng: 74.3400 }
        ],
        total_orders: 4,
        completed_orders: 3,
        cancelled_orders: 0,
        total_spending: 5195,
        favorite_items: ['Chicken Tikka Pizza', 'Crispy French Fries'],
        last_order_date: new Date(Date.now() - 86400000 * 2),
        loyalty_points: 100,
        customer_level: 'VIP Customer'
      });

      await WhatsAppSession.create({
        phone: '03001234567',
        name: 'Sameer',
        customer_id: sampleCustomer.customer_id,
        current_state: 'IDLE'
      });

      const pastOrder = await Order.create({
        order_id: 'FF-2026-0001',
        customer_id: sampleCustomer.customer_id,
        customer_name: sampleCustomer.name,
        customer_phone: sampleCustomer.phone,
        branch_id: 'BR-DHA',
        branch_name: '📍 FeastFlow DHA Branch',
        items: [
          { item_id: 'ITEM-1', name: 'Chicken Tikka Pizza', quantity: 2, size: 'Medium', extras: ['🧀 Extra Cheese'], unit_price: 1199, total_price: 2398 },
          { item_id: 'ITEM-2', name: 'Crispy French Fries', quantity: 1, size: 'Regular', extras: [], unit_price: 399, total_price: 399 }
        ],
        delivery_type: 'Home Delivery',
        delivery_address: { label: 'Home', address: 'House 42, Street 10, Phase 5 DHA, Lahore', lat: 31.4750, lng: 74.4200 },
        payment_method: 'Cash on Delivery',
        payment_status: 'Paid',
        order_status: 'Delivered',
        total_amount: 2797,
        rider_id: rider.rider_id,
        rider_name: rider.name,
        rider_phone: rider.phone,
        is_reviewed: true
      });

      await Review.create({
        order_id: pastOrder.order_id,
        customer_id: sampleCustomer.customer_id,
        customer_name: sampleCustomer.name,
        rating: 5,
        food_quality: 'Amazing',
        delivery_speed: 'Fast',
        feedback: 'Delicious pizza delivered fast!',
        points_earned: 20
      });

      await ReviewReward.create({
        order_id: pastOrder.order_id,
        customer_id: sampleCustomer.customer_id,
        points_awarded: 20
      });

      const activeOrder = await Order.create({
        order_id: 'FF-2026-0002',
        customer_id: sampleCustomer.customer_id,
        customer_name: sampleCustomer.name,
        customer_phone: sampleCustomer.phone,
        branch_id: 'BR-DHA',
        branch_name: '📍 FeastFlow DHA Branch',
        items: [
          { item_id: 'ITEM-2', name: 'Smokey BBQ Beef Burger', quantity: 2, size: 'Double Patty', extras: ['🧀 Extra Cheese', '🍟 Add Fries'], unit_price: 1150, total_price: 2300 }
        ],
        delivery_type: 'Home Delivery',
        delivery_address: { label: 'Home', address: 'House 42, Street 10, Phase 5 DHA, Lahore', lat: 31.4750, lng: 74.4200 },
        payment_method: 'Cash on Delivery',
        payment_status: 'Pending',
        order_status: 'Out For Delivery',
        total_amount: 2300,
        rider_id: rider.rider_id,
        rider_name: rider.name,
        rider_phone: rider.phone
      });

      rider.assigned_order_id = activeOrder.order_id;
      rider.status = 'On Delivery';
      await rider.save();

      // Seed Initial Counters
      await Counter.create([
        { _id: 'order_id', seq: 2 },
        { _id: 'customer_id', seq: 1 },
        { _id: 'rider_id', seq: 1 },
        { _id: 'branch_id', seq: 2 }
      ]);

      console.log('✨ Smart Customization Database Seeding Complete!');
    }
  } catch (err) {
    console.error('Error during data seeding:', err);
  }
};

module.exports = connectDB;
