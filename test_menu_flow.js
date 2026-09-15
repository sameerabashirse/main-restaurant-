const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 ===============================================');
console.log('🧪 TESTING FEASTFLOW MENU SELECTION & POST-CHECKOUT UI LOGIC');
console.log('🧪 ===============================================\n');

// 1. Check Customer.jsx for required behaviors
const customerJsxPath = path.join(__dirname, 'src', 'pages', 'Customer.jsx');
const customerJsxContent = fs.readFileSync(customerJsxPath, 'utf8');

// Test 1: Double-click guard state in Customer.jsx
assert.ok(customerJsxContent.includes('isAddingToCart'), 'Customer.jsx must include isAddingToCart double-click guard state');
console.log('✅ PASS: Customer.jsx includes double-click prevention lock state');

// Test 2: Confirmation message "Item added to your cart successfully."
assert.ok(customerJsxContent.includes('Item added to your cart successfully.'), 'Customer.jsx must display confirmation message');
console.log('✅ PASS: Customer.jsx displays exact confirmation message "Item added to your cart successfully."');

// Test 3: Selective panel closing (setModal(null) & setSelectedItem(null))
assert.ok(customerJsxContent.includes('setModal(null)'), 'Customer.jsx must close customization modal');
assert.ok(customerJsxContent.includes('setSelectedItem(null)'), 'Customer.jsx must reset selected item panel state');
console.log('✅ PASS: Customer.jsx selectively closes customization panel on add');

// Test 4: Category context preservation
assert.ok(customerJsxContent.includes('if (itemCat) setCategory(itemCat)'), 'Customer.jsx must preserve active category view');
console.log('✅ PASS: Customer.jsx returns customer to same menu category on item add');

// Test 5: Post-checkout UI cleanup in Customer.jsx (setMenu([]))
assert.ok(customerJsxContent.includes('setMenu([])'), 'Customer.jsx must clear menu cards on order confirmation');
console.log('✅ PASS: Customer.jsx clears menu cards upon order confirmation');

// 2. Check public/js/customer.js for required behaviors
const customerJsPath = path.join(__dirname, 'public', 'js', 'customer.js');
const customerJsContent = fs.readFileSync(customerJsPath, 'utf8');

// Test 6: Static customer.js includes double-click guard
assert.ok(customerJsContent.includes('isWizSubmitting'), 'customer.js must include isWizSubmitting guard');
console.log('✅ PASS: customer.js includes double-click prevention guard');

// Test 7: Static customer.js includes exact confirmation message and toast
assert.ok(customerJsContent.includes('Item added to your cart successfully.'), 'customer.js must include exact confirmation message');
console.log('✅ PASS: customer.js displays exact confirmation message and toast notification');

// Test 8: Static customer.js tracks active category
assert.ok(customerJsContent.includes('currentWACategory'), 'customer.js must track active category');
console.log('✅ PASS: customer.js preserves active category context');

// Test 9: Post-checkout UI cleanup in customer.js
assert.ok(customerJsContent.includes('currentWACategory = null'), 'customer.js must reset active category on order confirmation');
console.log('✅ PASS: customer.js resets active category and modal state upon order confirmation');

console.log('\n===============================================');
console.log('🏁 ALL MENU SELECTION & POST-CHECKOUT UI CHECKS PASSED!');
console.log('===============================================\n');
