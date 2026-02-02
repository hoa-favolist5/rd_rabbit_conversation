// Suppress Next.js 15 development warnings about async APIs
// These are false positives from Next.js internals
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' && 
      (args[0].includes('searchParams') || 
       args[0].includes('params are being enumerated'))
    ) {
      return;
    }
    originalError.apply(console, args);
  };
  
  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' && 
      (args[0].includes('searchParams') || 
       args[0].includes('params are being enumerated'))
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
}
