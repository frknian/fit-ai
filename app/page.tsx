"use client";

import FitAiApp from "@/components/FitAiApp";
import { NavigationProvider } from "@/components/navigation/NavigationProvider";

export default function Page() {
  // Rota durumu uygulamanın en dışında: kabuk onu okur, geri tuşu ve derin
  // bağlantı ona bağlanır (bkz. components/navigation/NavigationProvider.tsx).
  return (
    <NavigationProvider>
      <FitAiApp />
    </NavigationProvider>
  );
}
