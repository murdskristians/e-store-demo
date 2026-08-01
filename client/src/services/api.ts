// API service for E-Store Demo
import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type {
  User,
  Product,
  CartResponse,
  CartItem,
  OrderResponse,
  Expertise,
  HomePageResponse,
  SearchSuggestion
} from '../types';

// Use relative URL so Vite proxy handles routing to backend
const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * The backend runs on a free instance that sleeps after ~15 minutes of
 * inactivity. The first request after that either hangs while the container
 * boots or is rejected outright by the platform edge, which used to leave the
 * page stuck on "No products available" until a manual reload.
 *
 * Retry idempotent reads through the wake-up window instead. Delays are spread
 * over roughly a minute, which covers an observed cold start.
 */
const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 10000, 10000, 10000, 10000];
const RETRYABLE_STATUS = [408, 425, 429, 500, 502, 503, 504];
const REQUEST_TIMEOUT_MS = 90000;

type RetryConfig = InternalAxiosRequestConfig & { _retryCount?: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class ApiService {
  private client: AxiosInstance;
  private userId: number | null = null;
  private wakingListeners = new Set<(waking: boolean) => void>();

  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE}/api`,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add user ID to requests
    this.client.interceptors.request.use((config) => {
      if (this.userId) {
        config.headers['X-User-Id'] = String(this.userId);
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        this.setWaking(false);
        return response;
      },
      (error: AxiosError) => this.retry(error)
    );
  }

  /**
   * Notifies when the client is sitting in a retry loop, so the UI can say the
   * server is waking rather than showing an empty page.
   */
  onWaking(listener: (waking: boolean) => void): () => void {
    this.wakingListeners.add(listener);
    return () => {
      this.wakingListeners.delete(listener);
    };
  }

  private setWaking(waking: boolean) {
    this.wakingListeners.forEach((listener) => listener(waking));
  }

  private async retry(error: AxiosError): Promise<unknown> {
    const config = error.config as RetryConfig | undefined;

    // Only replay reads - retrying a POST could duplicate a cart item or order.
    const isIdempotent = (config?.method ?? 'get').toLowerCase() === 'get';
    // No response at all means a network error or timeout, which is what a
    // sleeping instance looks like from the browser.
    const isRetryableFailure =
      !error.response || RETRYABLE_STATUS.includes(error.response.status);

    if (!config || !isIdempotent || !isRetryableFailure) {
      this.setWaking(false);
      return Promise.reject(error);
    }

    const attempt = config._retryCount ?? 0;
    if (attempt >= RETRY_DELAYS_MS.length) {
      this.setWaking(false);
      return Promise.reject(error);
    }

    config._retryCount = attempt + 1;
    this.setWaking(true);
    await sleep(RETRY_DELAYS_MS[attempt] ?? 10000);

    return this.client.request(config);
  }

  setUserId(id: number) {
    this.userId = id;
  }

  getUserId(): number | null {
    return this.userId;
  }

  // Auth
  async login(name: string): Promise<User> {
    const { data } = await this.client.post<User>('/auth/login', { name });
    this.userId = data.id;
    return data;
  }

  // Products
  async getProducts(params?: {
    category?: string;
    brand?: string;
    min_price?: number;
    max_price?: number;
    limit?: number;
  }): Promise<Product[]> {
    const { data } = await this.client.get<Product[]>('/products', { params });
    return data;
  }

  async getProduct(id: number): Promise<Product> {
    const { data } = await this.client.get<Product>(`/products/${id}`);
    return data;
  }

  async searchProducts(query: string): Promise<Product[]> {
    const { data } = await this.client.get<Product[]>('/products/search', {
      params: { q: query }
    });
    return data;
  }

  async getCategories(): Promise<string[]> {
    const { data } = await this.client.get<string[]>('/products/categories');
    return data;
  }

  // Cart
  async getCart(): Promise<CartResponse> {
    const { data } = await this.client.get<CartResponse>('/cart');
    return data;
  }

  async addToCart(productId: number, quantity = 1): Promise<CartItem> {
    const { data } = await this.client.post<CartItem>('/cart/add', {
      product_id: productId,
      quantity
    });
    return data;
  }

  async updateCartItem(itemId: number, quantity: number): Promise<CartItem> {
    const { data } = await this.client.put<CartItem>(`/cart/${itemId}`, {
      quantity
    });
    return data;
  }

  async removeFromCart(itemId: number): Promise<void> {
    await this.client.delete(`/cart/${itemId}`);
  }

  // Orders
  async checkout(): Promise<OrderResponse> {
    const { data } = await this.client.post<OrderResponse>('/orders/checkout');
    return data;
  }

  async getOrders(): Promise<OrderResponse[]> {
    const { data } = await this.client.get<OrderResponse[]>('/orders');
    return data;
  }

  async getOrder(orderId: string): Promise<OrderResponse> {
    const { data } = await this.client.get<OrderResponse>(`/orders/${orderId}`);
    return data;
  }

  // Expertise
  async getExpertise(): Promise<Expertise> {
    const { data } = await this.client.get<Expertise>('/expertise');
    return data;
  }

  async trackAction(actionType: 'view_product_details' | 'add_to_cart' | 'checkout', productId: number): Promise<void> {
    await this.client.post('/expertise/action', {
      action_type: actionType,
      product_id: productId
    });
  }

  async clearExpertise(): Promise<void> {
    await this.client.delete('/expertise');
  }

  async getLiveSystemPrompt(): Promise<{
    system_prompt: string;
    user_prompt: string;
    total_improvements: number;
    prefetched_products: {
      checked_out: any[];
      added_to_cart: any[];
      viewed_products: any[];
    };
  }> {
    const { data } = await this.client.get('/expertise/live-prompt');
    return data;
  }

  // Home
  async getHomePage(): Promise<HomePageResponse> {
    const { data } = await this.client.get<HomePageResponse>('/home');
    return data;
  }

  async getSearchAutocomplete(query: string): Promise<{ suggestions: SearchSuggestion[]; query: string }> {
    const { data } = await this.client.get('/home/autocomplete', {
      params: { q: query }
    });
    return data;
  }
}

export const api = new ApiService();
export default api;
