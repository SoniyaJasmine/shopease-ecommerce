import { useState, useEffect } from "react";
import "./App.css";

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// Firebase configuration from the project's root .env file.
const firebaseConfig = JSON.parse(
  import.meta.env.VITE_FIREBASE_CONFIG || "{}"
);

const appId = globalThis.__app_id || "shopease-ecommerce";

// Product data
const PRODUCTS = [
  {
    id: 1,
    name: "Wireless Headphones",
    description: "High-quality wireless headphones with clear sound.",
    price: 1999,
    image: "/images/headphone.jpg",
    category: "Electronics",
  },
  {
    id: 2,
    name: "Smart Watch",
    description: "Stylish smartwatch with fitness tracking features.",
    price: 2499,
    image: "/images/smartwatch.jpg",
    category: "Electronics",
  },
  {
    id: 3,
    name: "Backpack",
    description: "Spacious backpack for everyday use.",
    price: 4599,
    image: "/images/bagpack.jpeg",
    category: "Accessories",
  },
  {
    id: 4,
    name: "Camera",
    description: "Portable camera with high-resolution capabilities.",
    price: 14999,
    image: "/images/camera.jpg",
    category: "Electronics",
  },
  {
    id: 5,
    name: "Shoe",
    description: "Comfortable shoes for everyday wear.",
    price: 1599,
    image: "/images/shoe.jpg",
    category: "Fashion",
  },
  {
    id: 6,
    name: "T-Shirt",
    description: "Comfortable t-shirt for everyday wear.",
    price: 999,
    image: "/images/tshirt.avif",
    category: "Fashion",
  },
];

// Format prices consistently using Indian number grouping.
function formatPrice(price) {
  return `₹${price.toLocaleString("en-IN")}`;
}

// Debounce delays filtering until the user pauses typing.
// The cancel method clears a pending timer when the component updates/unmounts.
function debounce(callback, delay) {
  let timeoutId;

  const debouncedFunction = (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };

  debouncedFunction.cancel = () => clearTimeout(timeoutId);
  return debouncedFunction;
}

// Product card
function ProductCard({ product, onAddToCart }) {
  return (
    <article className="product-card">
      <img src={product.image} alt={product.name} />
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <p className="product-category">Category: {product.category}</p>
      <h4>{formatPrice(product.price)}</h4>
      <button type="button" onClick={() => onAddToCart(product)}>
        Add to Cart
      </button>
    </article>
  );
}

// Shopping cart
function Cart({ cartItems, onClose, onCheckout }) {
  const total = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <section className="cart-container" aria-label="Shopping cart">
      <div className="cart-header">
        <h2>Shopping Cart</h2>
        <button
          type="button"
          className="close-btn"
          onClick={onClose}
          aria-label="Close cart"
        >
          ✕
        </button>
      </div>

      {cartItems.length === 0 ? (
        <p className="empty-cart">Your cart is empty!</p>
      ) : (
        <>
          {cartItems.map((item) => (
            <div className="cart-item" key={item.id}>
              <div>
                <h4>{item.name}</h4>
                <p>{formatPrice(item.price)}</p>
                <p>Quantity: {item.quantity}</p>
              </div>
              <h4>{formatPrice(item.price * item.quantity)}</h4>
            </div>
          ))}

          <div className="cart-total">
            <h3>
              Total: {formatPrice(total)}
            </h3>
          </div>

          <button
            type="button"
            className="checkout-btn"
            onClick={onCheckout}
          >
            Proceed to Checkout
          </button>
        </>
      )}
    </section>
  );
}

// Checkout form with browser validation and an additional email check.
function CheckoutForm({
  formData,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
}) {
  return (
    <section className="checkout-container">
      <h2>Checkout</h2>

      <form onSubmit={onSubmit}>
        <label htmlFor="fullName">Full Name</label>
        <input
          id="fullName"
          type="text"
          name="fullName"
          placeholder="Enter your full name"
          value={formData.fullName}
          onChange={onChange}
          minLength={3}
          autoComplete="name"
          required
        />

        <label htmlFor="email">Email Address</label>
        <input
          id="email"
          type="email"
          name="email"
          placeholder="Enter your email"
          value={formData.email}
          onChange={onChange}
          autoComplete="email"
          required
        />

        <label htmlFor="address">Delivery Address</label>
        <textarea
          id="address"
          name="address"
          placeholder="Enter your delivery address"
          value={formData.address}
          onChange={onChange}
          minLength={10}
          autoComplete="street-address"
          required
        />

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Placing Order..." : "Place Order"}
        </button>

        <button
          type="button"
          className="cancel-btn"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Back to Cart
        </button>
      </form>
    </section>
  );
}

// Shows products from the same category as the last product added.
function Recommendations({ products, onAddToCart }) {
  if (products.length === 0) return null;

  return (
    <section className="recommendations">
      <h2>Recommended Products for You</h2>
      <div className="product-list">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAddToCart={onAddToCart}
          />
        ))}
      </div>
    </section>
  );
}

function App() {
  // Shopping and page state
  const [cartItems, setCartItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  // Smart search state
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredProducts, setFilteredProducts] = useState(PRODUCTS);

  // Firebase state
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [firebaseStatus, setFirebaseStatus] = useState(
    "Connecting to Firebase..."
  );

  // Recommendations and checkout state
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    address: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderStatus, setOrderStatus] = useState("");

  // Initialize Firebase and sign in anonymously (or with the supplied token).
  useEffect(() => {
    let isActive = true;

    const initializeFirebase = async () => {
      try {
        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
          throw new Error(
            "Firebase configuration is missing. Check your .env file."
          );
        }

        const app = getApps().length
          ? getApps()[0]
          : initializeApp(firebaseConfig);

        const auth = getAuth(app);
        const firestore = getFirestore(app);

        if (!auth.currentUser) {
          const customToken = globalThis.__initial_auth_token;

          if (customToken) {
            await signInWithCustomToken(auth, customToken);
          } else {
            await signInAnonymously(auth);
          }
        }

        if (isActive && auth.currentUser) {
          setDb(firestore);
          setUserId(auth.currentUser.uid);
          setFirebaseStatus("Firebase connected successfully!");
          console.log("Firebase authentication successful!");
          console.log("User ID:", auth.currentUser.uid);
        }
      } catch (error) {
        console.error("Firebase initialization error:", error);
        if (isActive) {
          setFirebaseStatus(`Firebase connection failed: ${error.message}`);
        }
      }
    };

    initializeFirebase();

    return () => {
      isActive = false;
    };
  }, []);

  // Debounced, case-insensitive search through product names and descriptions.
  useEffect(() => {
    const filterProducts = debounce((term) => {
      const search = term.toLowerCase().trim();

      const results = PRODUCTS.filter((product) => {
        const name = product.name.toLowerCase();
        const description = product.description.toLowerCase();

        return name.includes(search) || description.includes(search);
      });

      setFilteredProducts(results);
    }, 300);

    filterProducts(searchTerm);

    return () => filterProducts.cancel();
  }, [searchTerm]);

  // Add a product; if it is already in the cart, increase its quantity.
  const handleAddToCart = (product) => {
    setCartItems((previousItems) => {
      const existingItem = previousItems.find(
        (item) => item.id === product.id
      );

      if (existingItem) {
        return previousItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...previousItems, { ...product, quantity: 1 }];
    });

    const recommendations = PRODUCTS.filter(
      (item) =>
        item.category === product.category && item.id !== product.id
    );
    setRecommendedProducts(recommendations);
    setOrderStatus("");
  };

  // Keep controlled checkout inputs in sync with their state values.
  const handleInputChange = (event) => {
    const { name, value } = event.target;

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));
  };

  // Save the order to the signed-in user's Firestore orders collection.
  const handlePlaceOrder = async (event) => {
    event.preventDefault();

    if (!db || !userId) {
      setOrderStatus("Firebase is not ready. Please try again.");
      return;
    }

    if (cartItems.length === 0) {
      setOrderStatus("Your cart is empty.");
      return;
    }

    // Extra basic email validation before saving the order.
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      formData.email.trim()
    );

    if (!emailIsValid) {
      setOrderStatus("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    setOrderStatus("");

    try {
      const grandTotal = cartItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const orderData = {
        ...formData,
        items: cartItems,
        grandTotal,
        userId,
        createdAt: serverTimestamp(),
      };

      await addDoc(
        collection(db, "artifacts", appId, "users", userId, "orders"),
        orderData
      );

      console.log("Order saved successfully!");

      setCartItems([]);
      setRecommendedProducts([]);
      setFormData({ fullName: "", email: "", address: "" });
      setShowCheckout(false);
      setIsCartOpen(false);
      setOrderStatus("Your order has been placed successfully! 🎉");

      // Clear the success message after four seconds.
      window.setTimeout(() => {
        setOrderStatus("");
      }, 4000);
    } catch (error) {
      console.error("Order saving error:", error);
      setOrderStatus(`Unable to place order: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Count total units, not just the number of different products.
  const cartCount = cartItems.reduce(
    (total, item) => total + item.quantity,
    0
  );

  return (
    <div className="app">
      <header className="header">
        <h1>ShopEase</h1>

        <input
          type="search"
          className="search-input"
          placeholder="Search products..."
          aria-label="Search products"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />

        <button
          type="button"
          className="cart-icon"
          onClick={() => {
            setIsCartOpen((isOpen) => !isOpen);
            setShowCheckout(false);
          }}
        >
          🛒 Cart ({cartCount})
        </button>
      </header>

      <p className="firebase-status" role="status">
        {firebaseStatus}
      </p>

      <main>
        <h2 className="section-title">Our Products</h2>

        <div className="product-list">
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={handleAddToCart}
              />
            ))
          ) : (
            <p className="no-results">
              No products found. Try another search!
            </p>
          )}
        </div>

        <Recommendations
          products={recommendedProducts}
          onAddToCart={handleAddToCart}
        />
      </main>

      {isCartOpen && !showCheckout && (
        <Cart
          cartItems={cartItems}
          onClose={() => setIsCartOpen(false)}
          onCheckout={() => setShowCheckout(true)}
        />
      )}

      {isCartOpen && showCheckout && (
        <CheckoutForm
          formData={formData}
          onChange={handleInputChange}
          onSubmit={handlePlaceOrder}
          onCancel={() => setShowCheckout(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {orderStatus && (
        <p className="order-status" role="status" aria-live="polite">
          {orderStatus}
        </p>
      )}
    </div>
  );
}

export default App;
