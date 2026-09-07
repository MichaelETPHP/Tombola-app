// Minimal shape of Chapa's own Inline.js widget — see
// github.com/Chapa-Et/inline.js. Loaded from their CDN at runtime, never
// bundled, since it's the vendor's own script for their own API.
interface ChapaCheckoutInstance {
  initialize(containerId: string): void;
}

interface ChapaCheckoutOptions {
  publicKey: string;
  amount: string;
  currency: string;
  tx_ref: string;
  availablePaymentMethods: string[];
  customizations?: { buttonText?: string; styles?: string };
  onSuccessfulPayment?: (result: unknown, refId: string) => void;
  onPaymentFailure?: (message: string) => void;
  onClose?: () => void;
}

interface Window {
  ChapaCheckout?: new (options: ChapaCheckoutOptions) => ChapaCheckoutInstance;
}
