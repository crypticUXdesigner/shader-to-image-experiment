/**
 * Error Handling Utilities
 * 
 * Shared utilities for consistent error handling, logging, and formatting across the application.
 * Supports work package 01C (Standardize Error Handling).
 */

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  /** Informational message (not an error) */
  Info = 'info',
  /** Warning - something unexpected but recoverable */
  Warning = 'warning',
  /** Error - something went wrong but may be recoverable */
  Error = 'error',
  /** Critical error - application may be in invalid state */
  Critical = 'critical'
}

/**
 * Error context information
 */
export interface ErrorContext {
  /** Component/module where error occurred */
  component?: string;
  /** Operation being performed when error occurred */
  operation?: string;
  /** Additional context data */
  data?: Record<string, unknown>;
  /** Timestamp when error occurred */
  timestamp?: number;
}

/**
 * Formatted error information
 */
export interface FormattedError {
  /** Error message */
  message: string;
  /** Severity level */
  severity: ErrorSeverity;
  /** Error context */
  context?: ErrorContext;
  /** Original error object (if available) */
  originalError?: Error | unknown;
}

/**
 * Format an error into a standardized structure
 * 
 * @param error - Error object, string, or unknown value
 * @param severity - Error severity level
 * @param context - Additional context information
 * @returns Formatted error information
 */
export function formatError(
  error: Error | string | unknown,
  severity: ErrorSeverity = ErrorSeverity.Error,
  context?: ErrorContext
): FormattedError {
  let message: string;
  let originalError: Error | undefined;

  if (error instanceof Error) {
    message = error.message;
    originalError = error;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = String(error);
  }

  return {
    message,
    severity,
    context: {
      ...context,
      timestamp: context?.timestamp || Date.now()
    },
    originalError
  };
}

/**
 * Log an error with consistent formatting
 * 
 * @param error - Error to log
 * @param severity - Error severity level
 * @param context - Additional context information
 */
export function logError(
  error: Error | string | unknown,
  severity: ErrorSeverity = ErrorSeverity.Error,
  context?: ErrorContext
): void {
  const formatted = formatError(error, severity, context);
  
  const prefix = context?.component ? `[${context.component}]` : '[Error]';
  const operation = context?.operation ? ` ${context.operation}:` : '';
  const logMessage = `${prefix}${operation} ${formatted.message}`;
  
  switch (severity) {
    case ErrorSeverity.Info:
      console.log(logMessage, context?.data || '');
      break;
    case ErrorSeverity.Warning:
      console.warn(logMessage, context?.data || '');
      break;
    case ErrorSeverity.Error:
    case ErrorSeverity.Critical:
      console.error(logMessage, context?.data || '');
      if (formatted.originalError && formatted.originalError instanceof Error && formatted.originalError.stack) {
        console.error('Stack trace:', formatted.originalError.stack);
      }
      break;
  }
}

/**
 * Create a user-friendly error message from an error
 * 
 * @param error - Error to format
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(error: Error | string | unknown): string {
  if (error instanceof Error) {
    // For known error types, provide user-friendly messages
    if (error.message.includes('decodeAudioData')) {
      return 'Could not load that audio file. It may be damaged or use an unsupported format.';
    }
    if (error.message.includes('compile')) {
      return 'Shader did not compile. Check the console for details.';
    }
    if (error.message.includes('WebGL')) {
      return 'Graphics error. Try refreshing the page.';
    }
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'Something went wrong.';
}

/**
 * Check if an error is recoverable
 * 
 * @param error - Error to check
 * @returns true if error is recoverable, false otherwise
 */
export function isRecoverableError(error: Error | string | unknown): boolean {
  if (error instanceof Error) {
    // WebGL context lost is not recoverable without page reload
    if (error.message.includes('WebGL context lost')) {
      return false;
    }
    // Network errors may be recoverable
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return true;
    }
    // Most other errors are potentially recoverable
    return true;
  }
  return true;
}

/**
 * Create error context from component and operation
 * 
 * @param component - Component name
 * @param operation - Operation name
 * @param data - Additional data
 * @returns Error context object
 */
export function createErrorContext(
  component: string,
  operation?: string,
  data?: Record<string, unknown>
): ErrorContext {
  return {
    component,
    operation,
    data,
    timestamp: Date.now()
  };
}

/**
 * Error categories for better organization
 */
export type ErrorCategory = 
  | 'compilation'
  | 'runtime'
  | 'audio'
  | 'validation'
  | 'webgl'
  | 'network'
  | 'unexpected';

/**
 * Application error structure
 */
export interface AppError {
  /** Error message */
  message: string;
  /** Error category */
  category: ErrorCategory;
  /** Error severity */
  severity: 'error' | 'warning' | 'info';
  /** Additional error details */
  details?: string[];
  /** Timestamp when error occurred */
  timestamp: number;
  /** Additional context data */
  data?: Record<string, unknown>;
}

/**
 * Canonical error reporting interface for shader compilation and runtime.
 * All compilation (CompilationManager, compiler) and runtime (RuntimeManager, ShaderInstance,
 * audio, etc.) paths report via this interface so errors surface in the main error UI.
 */
export interface ErrorHandler {
  /**
   * Report an error
   */
  reportError(error: AppError): void;
  
  /**
   * Convenience method to report an error with category and severity
   */
  report(category: ErrorCategory, severity: 'error' | 'warning' | 'info', message: string, details?: string[] | ({ context?: Record<string, unknown>; originalError?: Error } & Record<string, unknown>)): void;
  
  /**
   * Register a callback for error notifications
   */
  onError(callback: (error: AppError) => void): void;
  
  /**
   * Remove an error callback
   */
  offError(callback: (error: AppError) => void): void;
}

/**
 * Default error handler implementation
 */
class DefaultErrorHandler implements ErrorHandler {
  private listeners: Set<(error: AppError) => void> = new Set();
  
  reportError(error: AppError): void {
    // Log to console
    logError(error.message, 
      error.severity === 'error' ? ErrorSeverity.Error :
      error.severity === 'warning' ? ErrorSeverity.Warning :
      ErrorSeverity.Info,
      {
        component: error.category,
        data: { ...error.data, details: error.details },
        timestamp: error.timestamp
      }
    );
    // Log individual error details when present (e.g. shader compilation errors).
    // Match the parent severity so an `info` notice with structured details
    // doesn't surface its details as red `console.error` lines when the notice is benign.
    if (error.details && error.details.length > 0) {
      const detailLogger =
        error.severity === 'info' ? console.log :
        error.severity === 'warning' ? console.warn :
        console.error;
      error.details.forEach((detail, i) => {
        detailLogger(`  [${i + 1}] ${detail}`);
      });
    }
    
    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(error);
      } catch (e) {
        console.error('Error in error handler listener:', e);
      }
    }
  }
  
  report(category: ErrorCategory, severity: 'error' | 'warning' | 'info', message: string, details?: string[] | ({ context?: Record<string, unknown>; originalError?: Error } & Record<string, unknown>)): void {
    const errorDetails = Array.isArray(details) ? details : undefined;
    const errorData = Array.isArray(details) ? undefined : details;
    this.reportError({
      message,
      category,
      severity,
      details: errorDetails,
      timestamp: Date.now(),
      data: errorData
    });
  }
  
  onError(callback: (error: AppError) => void): void {
    this.listeners.add(callback);
  }
  
  offError(callback: (error: AppError) => void): void {
    this.listeners.delete(callback);
  }
}

/**
 * Global error handler singleton
 */
export const globalErrorHandler: ErrorHandler = new DefaultErrorHandler();

/**
 * Error utility functions for creating common error types
 */
export const ErrorUtils = {
  /**
   * Create a compilation error
   */
  compilationError(
    message: string,
    errors?: string[],
    context?: { originalError?: Error } & Record<string, unknown>
  ): AppError {
    return {
      message,
      category: 'compilation',
      severity: 'error',
      details: errors,
      timestamp: Date.now(),
      data: context
    };
  },
  
  /**
   * Create a runtime error
   */
  runtimeError(
    message: string,
    context?: { originalError?: Error } & Record<string, unknown>
  ): AppError {
    return {
      message,
      category: 'runtime',
      severity: 'error',
      timestamp: Date.now(),
      data: context
    };
  },
  
  /**
   * Create an audio error
   */
  audioError(
    message: string,
    context?: { originalError?: Error } & Record<string, unknown>
  ): AppError {
    return {
      message,
      category: 'audio',
      severity: 'error',
      timestamp: Date.now(),
      data: context
    };
  },
  
  /**
   * Create a validation error
   */
  validationError(
    message: string,
    context?: Record<string, unknown>
  ): AppError {
    return {
      message,
      category: 'validation',
      severity: 'error',
      timestamp: Date.now(),
      data: context
    };
  },
  
  /**
   * Create a WebGL error
   */
  webglError(
    message: string,
    context?: { originalError?: Error } & Record<string, unknown>
  ): AppError {
    return {
      message,
      category: 'webgl',
      severity: 'error',
      timestamp: Date.now(),
      data: context
    };
  },
  
  /**
   * Create a network error
   */
  networkError(
    message: string,
    context?: { originalError?: Error } & Record<string, unknown>
  ): AppError {
    return {
      message,
      category: 'network',
      severity: 'error',
      timestamp: Date.now(),
      data: context
    };
  },
  
  /**
   * Create an unexpected error
   */
  unexpectedError(
    message: string,
    context?: { originalError?: Error } & Record<string, unknown>
  ): AppError {
    return {
      message,
      category: 'unexpected',
      severity: 'error',
      timestamp: Date.now(),
      data: context
    };
  }
};

/**
 * Adapter function to convert legacy runtime error payload to AppError.
 */
export function adaptErrorCallback(error: {
  type: 'compilation' | 'runtime' | 'unexpected';
  errors?: string[];
  message?: string;
}): AppError {
  const category: ErrorCategory = 
    error.type === 'compilation' ? 'compilation' :
    error.type === 'runtime' ? 'runtime' :
    'unexpected';
  
  return {
    message: error.message || 'An error occurred',
    category,
    severity: 'error',
    details: error.errors,
    timestamp: Date.now()
  };
}
