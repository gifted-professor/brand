export function LoadingIndicator({ children }: { children: string }) {
  return <span className="loading-indicator"><span className="loading-spinner" aria-hidden="true" /><span>{children}</span></span>;
}
