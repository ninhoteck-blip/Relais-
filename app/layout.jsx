import "./globals.css";

export const metadata = {
  title: "Relais",
  description: "Rappels de rendez-vous et relances de factures pour les petites entreprises",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
