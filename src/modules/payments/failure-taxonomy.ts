export type PaymentFailureCode =
  | "PAYMENT_METHOD_UNAVAILABLE"
  | "PAYMENT_PACKAGE_UNAVAILABLE"
  | "PAYMENT_PROVIDER_UNAVAILABLE"
  | "PAYMENT_REQUEST_CONFLICT"
  | "PAYMENT_PROVIDER_OBJECT_MISSING"
  | "PAYMENT_ORDER_NOT_FOUND"
  | "PAYMENT_PROVIDER_MISMATCH"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_METADATA_ORDER_MISMATCH"
  | "PAYMENT_METADATA_USER_MISMATCH"
  | "PAYMENT_METADATA_PACKAGE_MISMATCH"
  | "EMAIL_REQUIRED";

export type PaymentFailureInfo = {
  code: PaymentFailureCode;
  category: "configuration" | "input" | "provider" | "reconciliation" | "idempotency";
  retryable: boolean;
  userAction: "choose_other_method" | "change_input" | "retry_later" | "contact_support";
  severity: "info" | "warning" | "critical";
};

export const PAYMENT_FAILURE_TAXONOMY: Record<PaymentFailureCode, PaymentFailureInfo> = {
  PAYMENT_METHOD_UNAVAILABLE: {
    code: "PAYMENT_METHOD_UNAVAILABLE",
    category: "configuration",
    retryable: false,
    userAction: "choose_other_method",
    severity: "warning"
  },
  PAYMENT_PACKAGE_UNAVAILABLE: {
    code: "PAYMENT_PACKAGE_UNAVAILABLE",
    category: "input",
    retryable: false,
    userAction: "change_input",
    severity: "info"
  },
  PAYMENT_PROVIDER_UNAVAILABLE: {
    code: "PAYMENT_PROVIDER_UNAVAILABLE",
    category: "provider",
    retryable: true,
    userAction: "retry_later",
    severity: "warning"
  },
  PAYMENT_REQUEST_CONFLICT: {
    code: "PAYMENT_REQUEST_CONFLICT",
    category: "idempotency",
    retryable: false,
    userAction: "contact_support",
    severity: "warning"
  },
  PAYMENT_PROVIDER_OBJECT_MISSING: {
    code: "PAYMENT_PROVIDER_OBJECT_MISSING",
    category: "reconciliation",
    retryable: false,
    userAction: "contact_support",
    severity: "critical"
  },
  PAYMENT_ORDER_NOT_FOUND: {
    code: "PAYMENT_ORDER_NOT_FOUND",
    category: "reconciliation",
    retryable: false,
    userAction: "contact_support",
    severity: "critical"
  },
  PAYMENT_PROVIDER_MISMATCH: {
    code: "PAYMENT_PROVIDER_MISMATCH",
    category: "reconciliation",
    retryable: false,
    userAction: "contact_support",
    severity: "critical"
  },
  PAYMENT_AMOUNT_MISMATCH: {
    code: "PAYMENT_AMOUNT_MISMATCH",
    category: "reconciliation",
    retryable: false,
    userAction: "contact_support",
    severity: "critical"
  },
  PAYMENT_METADATA_ORDER_MISMATCH: {
    code: "PAYMENT_METADATA_ORDER_MISMATCH",
    category: "reconciliation",
    retryable: false,
    userAction: "contact_support",
    severity: "critical"
  },
  PAYMENT_METADATA_USER_MISMATCH: {
    code: "PAYMENT_METADATA_USER_MISMATCH",
    category: "reconciliation",
    retryable: false,
    userAction: "contact_support",
    severity: "critical"
  },
  PAYMENT_METADATA_PACKAGE_MISMATCH: {
    code: "PAYMENT_METADATA_PACKAGE_MISMATCH",
    category: "reconciliation",
    retryable: false,
    userAction: "contact_support",
    severity: "critical"
  },
  EMAIL_REQUIRED: {
    code: "EMAIL_REQUIRED",
    category: "input",
    retryable: false,
    userAction: "change_input",
    severity: "info"
  }
};

export function paymentFailureInfo(code: string): PaymentFailureInfo | undefined {
  return PAYMENT_FAILURE_TAXONOMY[code as PaymentFailureCode];
}
