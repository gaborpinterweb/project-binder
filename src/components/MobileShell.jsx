export default function MobileShell({ children }) {
  return (
    <main className="mobile-shell global-view">
      <div className="stage">{children}</div>
    </main>
  );
}
